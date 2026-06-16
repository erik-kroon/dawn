import { Badge } from "@dawn/ui/components/badge";
import { Button } from "@dawn/ui/components/button";
import { Checkbox } from "@dawn/ui/components/checkbox";
import { Input } from "@dawn/ui/components/input";
import { Label } from "@dawn/ui/components/label";
import {
  detectCsvTransactionColumnMapping,
  formatMoney,
  parseCsvTransactionRows,
  type Money,
} from "@dawn/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useBlocker, useNavigate } from "@tanstack/react-router";
import {
  ActivityIcon,
  ArrowUpRightIcon,
  Building2Icon,
  DatabaseIcon,
  LandmarkIcon,
  NetworkIcon,
  RefreshCcwIcon,
  ShieldIcon,
  SlidersHorizontalIcon,
  UploadIcon,
  WorkflowIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { orpc } from "@/utils/orpc";

import { ensureCurrentTeam, rememberSelectedTeam } from "../-team-routing";

export const Route = createFileRoute("/_auth/operations")({
  component: OperationsRoute,
  loaderDeps: ({ search }) => ({ teamId: search.teamId }),
  loader: async ({ context, deps }) => {
    const { currentTeamId } = await ensureCurrentTeam(context, deps.teamId);

    if (!currentTeamId) {
      return { currentTeamId };
    }

    await context.queryClient.ensureQueryData(
      context.orpc.transactionReview.list.queryOptions({ input: { teamId: currentTeamId } }),
    );

    return { currentTeamId };
  },
  head: () => ({
    meta: [{ title: "Operations | Dawn" }],
  }),
});

const teamInviteRoles = ["admin", "member", "accountant", "viewer"] as const;
type TeamInviteRole = (typeof teamInviteRoles)[number];

type CsvImportMappingState = {
  postedAt: string;
  description: string;
  amount: string;
  debit: string;
  credit: string;
  currency: string;
  invertAmount: boolean;
  categoryId: string;
};

type CsvImportPreviewData = {
  totalRows: number;
  readyCount: number;
  duplicateCount: number;
  invalidCount: number;
  summary: {
    readyDateRange: { from: string; to: string } | null;
    readyCurrencyTotals: Record<string, Money>;
    readyIncomeCount: number;
    readyExpenseCount: number;
    readyZeroAmountCount: number;
  };
  headers: string[];
  detectedMapping: {
    postedAt?: string | null;
    description?: string | null;
    amount?: string | null;
    debit?: string | null;
    credit?: string | null;
    currency?: string | null;
    invertAmount?: boolean | null;
  };
  rows: {
    rowNumber: number;
    status: "ready" | "duplicate" | "invalid";
    errors: string[];
    values: Record<string, string>;
  }[];
};

type AccountantClosePeriodState = {
  from: string;
  to: string;
};

function OperationsRoute() {
  const { session } = Route.useRouteContext();
  const { currentTeamId } = Route.useLoaderData();
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();
  const [newTeamName, setNewTeamName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamInviteRole>("member");
  const [automationDraft, setAutomationDraft] = useState({
    name: "",
    triggerEventType: "transaction.created",
    actionType: "create_notification" as
      | "categorize_transaction"
      | "create_notification"
      | "create_invoice_draft"
      | "request_accounting_export",
    approvalPolicy: "require_approval" as "require_approval" | "auto_approve",
    categoryId: "",
    customerId: "",
    productId: "",
    message: "",
    exportType: "transactions",
  });
  const [counterpartyName, setCounterpartyName] = useState("");
  const [transactionTagName, setTransactionTagName] = useState("");
  const [transferDraft, setTransferDraft] = useState({
    fromAccountId: "",
    toAccountId: "",
    amount: "",
    currency: "USD",
    description: "Owner transfer",
    tagId: "",
  });
  const [csvText, setCsvText] = useState("");
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [csvAccountId, setCsvAccountId] = useState("");
  const [csvMapping, setCsvMapping] = useState<CsvImportMappingState>({
    postedAt: "Date",
    description: "Description",
    amount: "Amount",
    debit: "",
    credit: "",
    currency: "",
    invertAmount: false,
    categoryId: "",
  });
  const [csvPreviewFingerprint, setCsvPreviewFingerprint] = useState<string | null>(null);
  const [csvCommitAcknowledgementFingerprint, setCsvCommitAcknowledgementFingerprint] = useState<
    string | null
  >(null);
  const [accountantClosePeriod, setAccountantClosePeriod] = useState<AccountantClosePeriodState>(
    () => defaultAccountantClosePeriod(),
  );
  const [csvParseError, setCsvParseError] = useState<string | null>(null);
  const [sandboxBankSession, setSandboxBankSession] = useState<{
    providerSessionId: string;
    linkToken: string;
    connectUrl: string;
  } | null>(null);

  const teams = useQuery(orpc.teams.list.queryOptions({ input: { teamId: currentTeamId } }));
  const currentTeam = teams.data?.teams.find((team) => team.id === currentTeamId);
  const transactionReview = useQuery(
    orpc.transactionReview.list.queryOptions({ input: { teamId: currentTeamId } }),
  );
  const canManageTeam = transactionReview.data?.permissions.includes("team.manage") ?? false;
  const canReadOperations =
    transactionReview.data?.permissions.includes("operations.read") ?? false;
  const canExportPackets =
    transactionReview.data?.permissions.includes("transactions.export") ?? false;
  const accountantCloseInput = useMemo(
    () => accountantClosePeriodInput(accountantClosePeriod),
    [accountantClosePeriod],
  );
  const canManageBankConnections =
    transactionReview.data?.permissions.includes("bank_connections.manage") ?? false;
  const canManageIntegrations =
    transactionReview.data?.permissions.includes("integrations.write") ?? false;
  const teamDirectory = useQuery({
    ...orpc.teams.directory.queryOptions({ input: { teamId: currentTeamId } }),
    enabled: canManageTeam && Boolean(currentTeamId),
  });
  const operations = useQuery({
    ...orpc.operations.list.queryOptions({
      input: {
        teamId: currentTeamId,
        limit: 12,
        accountantClose: accountantCloseInput ?? undefined,
      },
    }),
    enabled: canReadOperations && Boolean(currentTeamId),
  });
  const packetExports = useQuery({
    ...orpc.transactionReview.listPacketExports.queryOptions({
      input: { teamId: currentTeamId, limit: 8 },
    }),
    enabled: canExportPackets && Boolean(currentTeamId),
  });
  const packetAccessAudit = useQuery({
    ...orpc.operations.list.queryOptions({
      input: {
        teamId: currentTeamId,
        limit: 50,
        audit: { entityType: "accountant_packet" },
      },
    }),
    enabled: canReadOperations && canExportPackets && Boolean(currentTeamId),
  });
  const automations = useQuery({
    ...orpc.automations.list.queryOptions({ input: { teamId: currentTeamId } }),
    enabled: Boolean(currentTeamId),
  });
  const banking = useQuery({
    ...orpc.banking.list.queryOptions({ input: { teamId: currentTeamId } }),
    enabled: Boolean(currentTeamId),
  });
  const integrations = useQuery({
    ...orpc.integrations.list.queryOptions({ input: { teamId: currentTeamId } }),
    enabled: Boolean(currentTeamId),
  });
  const billing = useQuery({
    ...orpc.billing.list.queryOptions({ input: { teamId: currentTeamId } }),
    enabled: Boolean(currentTeamId),
  });
  const ledgerSummary = useQuery({
    ...orpc.ledger.summary.queryOptions({ input: { teamId: currentTeamId } }),
    enabled: Boolean(currentTeamId),
  });

  function selectTeam(teamId: string) {
    rememberSelectedTeam(teamId);
    void navigate({
      replace: true,
      search: (previous) => ({
        ...previous,
        teamId,
      }),
    });
  }

  useEffect(() => {
    const firstAccountId = ledgerSummary.data?.accounts[0]?.id;

    if (!csvAccountId && firstAccountId) {
      setCsvAccountId(firstAccountId);
    }
  }, [csvAccountId, ledgerSummary.data?.accounts]);

  useEffect(() => {
    const accounts = ledgerSummary.data?.accounts ?? [];

    if (accounts.length === 0) {
      return;
    }

    setTransferDraft((draft) => {
      const currentFromAccount = accounts.find((account) => account.id === draft.fromAccountId);
      const nextFromAccount = currentFromAccount ?? accounts[0];
      const currentToAccount = accounts.find((account) => account.id === draft.toAccountId);
      const nextToAccount =
        currentToAccount && currentToAccount.id !== nextFromAccount?.id
          ? currentToAccount
          : accounts.find((account) => account.id !== nextFromAccount?.id);

      if (!nextFromAccount) {
        return draft;
      }

      const nextDraft = {
        ...draft,
        fromAccountId: nextFromAccount.id,
        toAccountId: nextToAccount?.id ?? "",
        currency: nextFromAccount.currency,
      };

      return nextDraft.fromAccountId === draft.fromAccountId &&
        nextDraft.toAccountId === draft.toAccountId &&
        nextDraft.currency === draft.currency
        ? draft
        : nextDraft;
    });
  }, [ledgerSummary.data?.accounts]);

  const createTeamMutation = useMutation(
    orpc.teams.create.mutationOptions({
      onSuccess: async (team) => {
        selectTeam(team.id);
        setNewTeamName("");
        await queryClient.invalidateQueries({ queryKey: orpc.teams.list.queryKey() });
        await queryClient.invalidateQueries({ queryKey: orpc.transactionReview.list.queryKey() });
      },
    }),
  );
  const inviteTeamMemberMutation = useMutation(
    orpc.teams.invite.mutationOptions({
      onSuccess: async () => {
        setInviteEmail("");
        setInviteRole("member");
        await queryClient.invalidateQueries({ queryKey: orpc.teams.directory.queryKey() });
      },
    }),
  );
  const updateTeamMemberRoleMutation = useMutation(
    orpc.teams.updateMemberRole.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.teams.directory.queryKey() });
        await queryClient.invalidateQueries({ queryKey: orpc.teams.list.queryKey() });
      },
    }),
  );
  const createAutomationRuleMutation = useMutation(
    orpc.automations.createRule.mutationOptions({
      onSuccess: async () => {
        setAutomationDraft((draft) => ({ ...draft, name: "", message: "" }));
        await queryClient.invalidateQueries({ queryKey: orpc.automations.list.queryKey() });
      },
    }),
  );
  const requestDataExportMutation = useMutation(
    orpc.operations.requestDataExport.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.operations.list.queryKey() });
      },
    }),
  );
  const requestDataDeletionMutation = useMutation(
    orpc.operations.requestDataDeletion.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.operations.list.queryKey() });
      },
    }),
  );
  const connectMockBankMutation = useMutation(
    orpc.banking.connectMock.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.banking.list.queryKey() });
        await queryClient.invalidateQueries({ queryKey: orpc.ledger.summary.queryKey() });
      },
    }),
  );
  const createSandboxBankSessionMutation = useMutation(
    orpc.banking.createSession.mutationOptions({
      onSuccess: (result) => {
        setSandboxBankSession({
          providerSessionId: result.session.providerSessionId,
          linkToken: result.session.linkToken,
          connectUrl: result.session.connectUrl,
        });
      },
    }),
  );
  const completeSandboxBankMutation = useMutation(
    orpc.banking.complete.mutationOptions({
      onSuccess: async () => {
        setSandboxBankSession(null);
        await queryClient.invalidateQueries({ queryKey: orpc.banking.list.queryKey() });
        await queryClient.invalidateQueries({ queryKey: orpc.ledger.summary.queryKey() });
      },
    }),
  );
  const syncBankConnectionMutation = useMutation(
    orpc.banking.sync.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.banking.list.queryKey() });
        await queryClient.invalidateQueries({ queryKey: orpc.ledger.summary.queryKey() });
        await queryClient.invalidateQueries({ queryKey: orpc.transactionReview.list.queryKey() });
      },
    }),
  );
  const disconnectBankConnectionMutation = useMutation(
    orpc.banking.disconnect.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.banking.list.queryKey() });
      },
    }),
  );
  const connectIntegrationMutation = useMutation(
    orpc.integrations.connect.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.integrations.list.queryKey() });
      },
    }),
  );
  const syncIntegrationMutation = useMutation(
    orpc.integrations.sync.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.integrations.list.queryKey() });
      },
    }),
  );
  const disableIntegrationMutation = useMutation(
    orpc.integrations.disable.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.integrations.list.queryKey() });
      },
    }),
  );
  const createCounterpartyMutation = useMutation(
    orpc.ledger.createCounterparty.mutationOptions({
      onSuccess: async () => {
        setCounterpartyName("");
        await queryClient.invalidateQueries({ queryKey: orpc.ledger.summary.queryKey() });
      },
    }),
  );
  const createTransactionTagMutation = useMutation(
    orpc.ledger.createTag.mutationOptions({
      onSuccess: async () => {
        setTransactionTagName("");
        await queryClient.invalidateQueries({ queryKey: orpc.ledger.summary.queryKey() });
      },
    }),
  );
  const createTransferPairMutation = useMutation(
    orpc.ledger.createTransferPair.mutationOptions({
      onSuccess: async () => {
        setTransferDraft((draft) => ({ ...draft, amount: "" }));
        await queryClient.invalidateQueries({ queryKey: orpc.ledger.summary.queryKey() });
        await queryClient.invalidateQueries({ queryKey: orpc.transactionReview.list.queryKey() });
      },
    }),
  );
  const csvPreviewMutation = useMutation(orpc.csvImport.preview.mutationOptions());
  const csvCommitMutation = useMutation(
    orpc.csvImport.commit.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.transactionReview.list.queryKey() });
        await queryClient.invalidateQueries({ queryKey: orpc.ledger.summary.queryKey() });
        await queryClient.invalidateQueries({ queryKey: orpc.operations.list.queryKey() });
      },
    }),
  );
  const csvImportDraftFingerprint = useMemo(
    () =>
      csvImportInputFingerprint({
        accountId: csvAccountId,
        csvText,
        mapping: csvMapping,
      }),
    [csvAccountId, csvMapping, csvText],
  );
  const hasCurrentCsvPreview =
    Boolean(csvPreviewMutation.data) && csvPreviewFingerprint === csvImportDraftFingerprint;
  const hasCsvCommitAcknowledgement =
    hasCurrentCsvPreview && csvCommitAcknowledgementFingerprint === csvImportDraftFingerprint;
  const hasCsvImportDraft =
    Boolean(csvFileName || csvText.trim() || csvPreviewMutation.data) && !csvCommitMutation.data;
  const csvRows = useMemo(() => {
    if (!csvText.trim()) {
      return [];
    }

    try {
      return parseCsvTransactionRows(csvText);
    } catch {
      return [];
    }
  }, [csvText]);
  const csvHeaders = useMemo(() => Object.keys(csvRows[0]?.values ?? {}), [csvRows]);

  useEffect(() => {
    setCsvCommitAcknowledgementFingerprint(null);
  }, [csvImportDraftFingerprint]);

  useBlocker({
    disabled: !hasCsvImportDraft,
    enableBeforeUnload: () => hasCsvImportDraft,
    shouldBlockFn: ({ current, next }) => {
      const currentSearch = current.search as { teamId?: unknown };
      const nextSearch = next.search as { teamId?: unknown };
      const sameOperationsWorkspace =
        current.pathname === next.pathname && currentSearch.teamId === nextSearch.teamId;

      if (sameOperationsWorkspace) {
        return false;
      }

      return !window.confirm("Leave Operations and discard the CSV import draft?");
    },
  });

  const operationalHealth = useMemo(
    () => [
      {
        label: "Queue depth",
        value: operations.data?.metrics.queueDepth ?? "...",
        detail: `${operations.data?.metrics.failedJobs ?? 0} failed jobs`,
        icon: WorkflowIcon,
      },
      {
        label: "Provider failures",
        value: operations.data?.metrics.providerFailures ?? "...",
        detail: `${operations.data?.metrics.integrationFailures ?? 0} integration failures`,
        icon: NetworkIcon,
      },
      {
        label: "Sync lag",
        value: formatSyncLag(operations.data?.metrics.syncLagSeconds),
        detail: `${banking.data?.connections.length ?? 0} bank connections`,
        icon: RefreshCcwIcon,
      },
      {
        label: "Audit trail",
        value: operations.data?.auditEvents.length ?? "...",
        detail: `${operations.data?.metrics.deadLetters ?? 0} dead letters`,
        icon: ShieldIcon,
      },
    ],
    [banking.data?.connections.length, operations.data],
  );
  const accountantPacketAuditEvents =
    packetAccessAudit.data?.auditEvents ?? operations.data?.auditEvents ?? [];

  return (
    <div className="mx-auto grid w-full max-w-[1728px] gap-8 py-8">
      <section className="grid gap-6 md:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid content-end gap-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <SlidersHorizontalIcon aria-hidden="true" className="size-3.5" />
            <span>Operations</span>
          </div>
          <div>
            <h1 className="font-serif text-[40px] leading-none tracking-normal md:text-[56px]">
              Control room
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
              Team access, automations, providers, ledger setup, imports, and data workflows live
              here instead of crowding the home view.
            </p>
          </div>
        </div>

        <div className="border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Current team</p>
          <p className="mt-3 truncate text-xl font-medium">
            {currentTeam?.name ?? transactionReview.data?.teamName ?? "Workspace"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {transactionReview.data?.role ?? "Resolving access"}
          </p>
          <select
            className="mt-4 h-9 w-full rounded-none border border-border bg-background px-2 text-sm"
            onChange={(event) => {
              const teamId = event.target.value;
              selectTeam(teamId);
            }}
            value={currentTeamId ?? ""}
          >
            {teams.data?.teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name} · {team.role}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="grid gap-px border border-border bg-border md:grid-cols-2 xl:grid-cols-4">
        {operationalHealth.map(({ detail, icon: Icon, label, value }) => (
          <div className="bg-background p-4" key={label}>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Icon aria-hidden="true" className="size-3.5" />
              <span>{label}</span>
            </div>
            <p className="mt-6 font-mono text-2xl text-foreground">{value}</p>
            <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Panel
          description="Create teams, invite members, and resolve the active actor role."
          icon={Building2Icon}
          title="Team access"
        >
          <div className="grid gap-3">
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <Input
                onChange={(event) => setNewTeamName(event.target.value)}
                placeholder="New team name"
                value={newTeamName}
              />
              <Button
                disabled={createTeamMutation.isPending || !newTeamName.trim()}
                onClick={() => createTeamMutation.mutate({ name: newTeamName })}
              >
                Create team
              </Button>
            </div>
            {canManageTeam ? (
              <div className="grid gap-2 sm:grid-cols-[1fr_136px_auto]">
                <Input
                  aria-label="Invite email"
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="teammate@example.com"
                  value={inviteEmail}
                />
                <select
                  aria-label="Invite role"
                  className="h-9 rounded-none border border-border bg-background px-2 text-sm"
                  onChange={(event) => setInviteRole(event.target.value as TeamInviteRole)}
                  value={inviteRole}
                >
                  {teamInviteRoles.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
                <Button
                  disabled={
                    inviteTeamMemberMutation.isPending ||
                    !inviteEmail.trim() ||
                    !transactionReview.data?.teamId
                  }
                  onClick={() => {
                    if (!transactionReview.data?.teamId) {
                      return;
                    }

                    inviteTeamMemberMutation.mutate({
                      teamId: transactionReview.data.teamId,
                      email: inviteEmail,
                      role: inviteRole,
                      idempotencyKey: crypto.randomUUID(),
                    });
                  }}
                  variant="outline"
                >
                  Invite
                </Button>
              </div>
            ) : null}
            <div className="grid gap-2">
              {teamDirectory.data?.members.slice(0, 6).map((member) => (
                <div
                  className="grid gap-3 border border-border p-3 sm:grid-cols-[1fr_160px] sm:items-center"
                  key={member.id}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {member.name ?? member.email ?? member.userId}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {member.email ?? member.userId}
                    </p>
                  </div>
                  <select
                    aria-label={`Role for ${member.email ?? member.userId}`}
                    className="h-9 rounded-none border border-border bg-background px-2 text-sm"
                    disabled={
                      updateTeamMemberRoleMutation.isPending ||
                      member.role === "owner" ||
                      member.userId === session.data?.user.id
                    }
                    onChange={(event) =>
                      updateTeamMemberRoleMutation.mutate({
                        teamId: teamDirectory.data.teamId,
                        userId: member.userId,
                        role: event.target.value as TeamInviteRole,
                        idempotencyKey: crypto.randomUUID(),
                      })
                    }
                    value={member.role}
                  >
                    {member.role === "owner" ? <option value="owner">owner</option> : null}
                    {teamInviteRoles.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              {teamDirectory.data?.pendingInvites.slice(0, 4).map((invite) => (
                <div className="border border-border p-3 text-sm" key={invite.id}>
                  <p className="font-medium">{invite.email}</p>
                  <p className="text-xs text-muted-foreground">pending · {invite.role}</p>
                </div>
              ))}
              {!teamDirectory.data?.members.length ? (
                <p className="text-sm text-muted-foreground">No team directory available.</p>
              ) : null}
            </div>
            <ErrorText error={createTeamMutation.error} />
            <ErrorText error={inviteTeamMemberMutation.error} />
            <ErrorText error={updateTeamMemberRoleMutation.error} />
          </div>
        </Panel>

        <Panel
          description="Event-triggered rules route through permissions, audit, and outbox."
          icon={WorkflowIcon}
          title="Automations"
        >
          <div className="grid gap-3">
            <div className="grid gap-2 md:grid-cols-3">
              <Input
                aria-label="Automation rule name"
                onChange={(event) =>
                  setAutomationDraft((draft) => ({ ...draft, name: event.target.value }))
                }
                placeholder="Rule name"
                value={automationDraft.name}
              />
              <select
                aria-label="Automation trigger event"
                className="h-9 border border-border bg-background px-3 text-sm"
                onChange={(event) =>
                  setAutomationDraft((draft) => ({
                    ...draft,
                    triggerEventType: event.target.value,
                  }))
                }
                value={automationDraft.triggerEventType}
              >
                <option value="transaction.created">Transaction created</option>
                <option value="document.extracted">Document extracted</option>
                <option value="invoice.sent">Invoice sent</option>
              </select>
              <select
                aria-label="Automation action"
                className="h-9 border border-border bg-background px-3 text-sm"
                onChange={(event) =>
                  setAutomationDraft((draft) => ({
                    ...draft,
                    actionType: event.target.value as typeof automationDraft.actionType,
                  }))
                }
                value={automationDraft.actionType}
              >
                <option value="create_notification">Notify</option>
                <option value="categorize_transaction">Categorize transaction</option>
                <option value="create_invoice_draft">Create draft invoice</option>
                <option value="request_accounting_export">Request accounting export</option>
              </select>
            </div>
            <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
              {automationDraft.actionType === "categorize_transaction" ? (
                <select
                  aria-label="Automation category"
                  className="h-9 border border-border bg-background px-3 text-sm"
                  onChange={(event) =>
                    setAutomationDraft((draft) => ({ ...draft, categoryId: event.target.value }))
                  }
                  value={automationDraft.categoryId}
                >
                  <option value="">Select category</option>
                  {transactionReview.data?.categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              ) : null}
              {automationDraft.actionType === "create_invoice_draft" ? (
                <>
                  <select
                    aria-label="Automation invoice customer"
                    className="h-9 border border-border bg-background px-3 text-sm"
                    onChange={(event) =>
                      setAutomationDraft((draft) => ({
                        ...draft,
                        customerId: event.target.value,
                      }))
                    }
                    value={automationDraft.customerId}
                  >
                    <option value="">Select customer</option>
                    {billing.data?.customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Automation invoice product"
                    className="h-9 border border-border bg-background px-3 text-sm"
                    onChange={(event) =>
                      setAutomationDraft((draft) => ({ ...draft, productId: event.target.value }))
                    }
                    value={automationDraft.productId}
                  >
                    <option value="">Select product/service</option>
                    {billing.data?.products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                </>
              ) : null}
              {automationDraft.actionType === "create_notification" ? (
                <Input
                  aria-label="Automation notification message"
                  onChange={(event) =>
                    setAutomationDraft((draft) => ({ ...draft, message: event.target.value }))
                  }
                  placeholder="Notification message"
                  value={automationDraft.message}
                />
              ) : null}
              {automationDraft.actionType === "request_accounting_export" ? (
                <Input
                  aria-label="Automation export type"
                  onChange={(event) =>
                    setAutomationDraft((draft) => ({ ...draft, exportType: event.target.value }))
                  }
                  placeholder="Export type"
                  value={automationDraft.exportType}
                />
              ) : null}
              <select
                aria-label="Automation approval policy"
                className="h-9 border border-border bg-background px-3 text-sm"
                onChange={(event) =>
                  setAutomationDraft((draft) => ({
                    ...draft,
                    approvalPolicy: event.target.value as typeof automationDraft.approvalPolicy,
                  }))
                }
                value={automationDraft.approvalPolicy}
              >
                <option value="require_approval">Require approval</option>
                <option value="auto_approve">Auto approve</option>
              </select>
              <Button
                disabled={
                  !currentTeamId ||
                  !automationDraft.name.trim() ||
                  createAutomationRuleMutation.isPending
                }
                onClick={() => {
                  if (!currentTeamId) {
                    return;
                  }

                  createAutomationRuleMutation.mutate({
                    teamId: currentTeamId,
                    name: automationDraft.name,
                    trigger: { type: "outbox_event", eventType: automationDraft.triggerEventType },
                    actionType: automationDraft.actionType,
                    actionConfig: buildAutomationActionConfig(automationDraft),
                    approvalPolicy: automationDraft.approvalPolicy,
                    idempotencyKey: crypto.randomUUID(),
                  });
                }}
              >
                Save rule
              </Button>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <ListBlock title="Rules">
                {automations.data?.rules.slice(0, 4).map((rule) => (
                  <RunLine
                    detail={`${rule.trigger.eventType} -> ${rule.actionType}`}
                    key={rule.id}
                    status={rule.approvalPolicy}
                    title={rule.name}
                  />
                ))}
                {!automations.data?.rules.length ? <Muted>No automation rules yet.</Muted> : null}
              </ListBlock>
              <ListBlock title="Recent runs">
                {automations.data?.recentRuns.slice(0, 4).map((run) => (
                  <RunLine
                    detail={run.error ?? new Date(run.startedAt).toLocaleString()}
                    key={run.id}
                    status={run.status}
                    title={run.actionType}
                  />
                ))}
                {!automations.data?.recentRuns.length ? (
                  <Muted>No automation runs yet.</Muted>
                ) : null}
              </ListBlock>
            </div>
            <ErrorText error={createAutomationRuleMutation.error} />
          </div>
        </Panel>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel
          description="Connections normalize provider state into ledger accounts and transactions."
          icon={LandmarkIcon}
          title="Bank connections"
        >
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                {banking.data?.connections.length ?? 0} connections ·{" "}
                {banking.data?.connections.reduce(
                  (total, connection) => total + connection.accounts.length,
                  0,
                ) ?? 0}{" "}
                accounts
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={!canManageBankConnections || !currentTeamId}
                  onClick={() =>
                    currentTeamId
                      ? connectMockBankMutation.mutate({
                          teamId: currentTeamId,
                          idempotencyKey: crypto.randomUUID(),
                        })
                      : undefined
                  }
                  size="sm"
                  variant="outline"
                >
                  Connect mock
                </Button>
                <Button
                  disabled={!canManageBankConnections || !currentTeamId}
                  onClick={() =>
                    currentTeamId
                      ? createSandboxBankSessionMutation.mutate({
                          teamId: currentTeamId,
                          provider: "sandbox-bank",
                          redirectUrl: window.location.href,
                          idempotencyKey: crypto.randomUUID(),
                        })
                      : undefined
                  }
                  size="sm"
                >
                  Start sandbox
                </Button>
              </div>
            </div>
            {sandboxBankSession && currentTeamId ? (
              <div className="grid gap-2 border border-border p-3 text-sm">
                <p className="font-medium">Sandbox callback ready</p>
                <p className="break-all text-muted-foreground">{sandboxBankSession.connectUrl}</p>
                <Button
                  className="w-fit"
                  disabled={completeSandboxBankMutation.isPending}
                  onClick={() =>
                    completeSandboxBankMutation.mutate({
                      teamId: currentTeamId,
                      provider: "sandbox-bank",
                      providerSessionId: sandboxBankSession.providerSessionId,
                      publicToken: "public-sandbox-token",
                      idempotencyKey: crypto.randomUUID(),
                    })
                  }
                  size="sm"
                >
                  Complete callback
                </Button>
              </div>
            ) : null}
            {banking.data?.connections
              .slice(0, 5)
              .map(({ connection, accounts, latestSyncRun }) => (
                <div className="grid gap-3 border border-border p-3" key={connection.id}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{connection.institutionName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {connection.provider} · {connection.status}
                        {connection.lastSyncAt ? ` · synced ${connection.lastSyncAt}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        disabled={
                          !canManageBankConnections ||
                          connection.status !== "connected" ||
                          syncBankConnectionMutation.isPending
                        }
                        onClick={() =>
                          syncBankConnectionMutation.mutate({
                            teamId: connection.teamId,
                            connectionId: connection.id,
                            idempotencyKey: crypto.randomUUID(),
                          })
                        }
                        size="sm"
                        variant="outline"
                      >
                        Sync
                      </Button>
                      <Button
                        disabled={
                          !canManageBankConnections ||
                          connection.status === "disconnected" ||
                          disconnectBankConnectionMutation.isPending
                        }
                        onClick={() =>
                          disconnectBankConnectionMutation.mutate({
                            teamId: connection.teamId,
                            connectionId: connection.id,
                            idempotencyKey: crypto.randomUUID(),
                          })
                        }
                        size="sm"
                        variant="destructive"
                      >
                        Disconnect
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {accounts.slice(0, 4).map((account) => (
                      <div className="border border-border p-2 text-xs" key={account.id}>
                        <p className="font-medium">{account.name}</p>
                        <p className="text-muted-foreground">
                          {account.currency} · {formatMoney(account.currentBalance)}
                        </p>
                      </div>
                    ))}
                  </div>
                  {latestSyncRun ? (
                    <p className="text-xs text-muted-foreground">
                      Last run: {latestSyncRun.status} · {latestSyncRun.transactionsImported}{" "}
                      imported
                    </p>
                  ) : null}
                </div>
              ))}
            {!banking.data?.connections.length ? <Muted>No bank connections yet.</Muted> : null}
            <ErrorText error={connectMockBankMutation.error} />
            <ErrorText error={createSandboxBankSessionMutation.error} />
            <ErrorText error={completeSandboxBankMutation.error} />
            <ErrorText error={syncBankConnectionMutation.error} />
            <ErrorText error={disconnectBankConnectionMutation.error} />
          </div>
        </Panel>

        <Panel
          description="Accounting, payment, messaging, and email adapters stay behind provider boundaries."
          icon={NetworkIcon}
          title="Integrations"
        >
          <div className="grid gap-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {integrations.data?.providers.map((provider) => {
                const connected = integrations.data.connections.find(
                  ({ connection }) =>
                    connection.provider === provider.provider && connection.status !== "disabled",
                );

                return (
                  <div
                    className="grid gap-2 border border-border p-3 text-sm"
                    key={provider.provider}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{provider.displayName}</p>
                        <p className="text-xs text-muted-foreground">{provider.category}</p>
                      </div>
                      <Badge variant={connected ? "outline" : "secondary"}>
                        {connected ? "Connected" : "Available"}
                      </Badge>
                    </div>
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {provider.capabilities.join(", ")}
                    </p>
                    <Button
                      disabled={
                        !canManageIntegrations ||
                        connectIntegrationMutation.isPending ||
                        !currentTeamId ||
                        Boolean(connected)
                      }
                      onClick={() =>
                        currentTeamId
                          ? connectIntegrationMutation.mutate({
                              teamId: currentTeamId,
                              provider: provider.provider,
                              idempotencyKey: crypto.randomUUID(),
                            })
                          : undefined
                      }
                      size="sm"
                      variant={connected ? "outline" : "default"}
                    >
                      {connected ? "Connected" : "Connect"}
                    </Button>
                  </div>
                );
              })}
            </div>
            {integrations.data?.connections.slice(0, 5).map(({ connection, latestSyncRun }) => (
              <div
                className="grid gap-3 border border-border p-3 text-sm sm:grid-cols-[1fr_auto]"
                key={connection.id}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{connection.displayName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {connection.provider} · {connection.status}
                    {latestSyncRun ? ` · ${latestSyncRun.recordsSynced} synced` : ""}
                  </p>
                  {connection.lastError ? (
                    <p className="text-xs text-destructive">{connection.lastError}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={
                      !canManageIntegrations ||
                      syncIntegrationMutation.isPending ||
                      connection.status === "disabled"
                    }
                    onClick={() =>
                      syncIntegrationMutation.mutate({
                        teamId: connection.teamId,
                        connectionId: connection.id,
                        idempotencyKey: crypto.randomUUID(),
                      })
                    }
                    size="sm"
                    variant="outline"
                  >
                    Sync
                  </Button>
                  <Button
                    disabled={
                      !canManageIntegrations ||
                      disableIntegrationMutation.isPending ||
                      connection.status === "disabled"
                    }
                    onClick={() =>
                      disableIntegrationMutation.mutate({
                        teamId: connection.teamId,
                        connectionId: connection.id,
                        idempotencyKey: crypto.randomUUID(),
                      })
                    }
                    size="sm"
                    variant="outline"
                  >
                    Disable
                  </Button>
                </div>
              </div>
            ))}
            <ErrorText error={connectIntegrationMutation.error} />
            <ErrorText error={syncIntegrationMutation.error} />
            <ErrorText error={disableIntegrationMutation.error} />
          </div>
        </Panel>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel
          description="Counterparties, tags, and owner transfers write through ledger application use cases."
          icon={DatabaseIcon}
          title="Ledger controls"
        >
          <div className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-2 border border-border p-3">
                <p className="text-sm font-medium">Transaction metadata</p>
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <Input
                    onChange={(event) => setCounterpartyName(event.target.value)}
                    placeholder="Counterparty"
                    value={counterpartyName}
                  />
                  <Button
                    disabled={
                      createCounterpartyMutation.isPending ||
                      !currentTeamId ||
                      !counterpartyName.trim()
                    }
                    onClick={() =>
                      currentTeamId
                        ? createCounterpartyMutation.mutate({
                            teamId: currentTeamId,
                            name: counterpartyName,
                            idempotencyKey: crypto.randomUUID(),
                          })
                        : undefined
                    }
                    variant="outline"
                  >
                    Create
                  </Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <Input
                    onChange={(event) => setTransactionTagName(event.target.value)}
                    placeholder="Tag"
                    value={transactionTagName}
                  />
                  <Button
                    disabled={
                      createTransactionTagMutation.isPending ||
                      !currentTeamId ||
                      !transactionTagName.trim()
                    }
                    onClick={() =>
                      currentTeamId
                        ? createTransactionTagMutation.mutate({
                            teamId: currentTeamId,
                            name: transactionTagName,
                            idempotencyKey: crypto.randomUUID(),
                          })
                        : undefined
                    }
                    variant="outline"
                  >
                    Create
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Counterparties:{" "}
                  {ledgerSummary.data?.counterparties.length
                    ? ledgerSummary.data.counterparties.map((item) => item.name).join(", ")
                    : "none"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Tags:{" "}
                  {ledgerSummary.data?.tags.length
                    ? ledgerSummary.data.tags.map((item) => item.name).join(", ")
                    : "none"}
                </p>
              </div>

              <div className="grid gap-2 border border-border p-3">
                <p className="text-sm font-medium">Transfer pair</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <select
                    aria-label="From account"
                    className="h-9 rounded-none border border-border bg-background px-2 text-sm"
                    onChange={(event) => {
                      const fromAccountId = event.target.value;
                      const fromAccount = ledgerSummary.data?.accounts.find(
                        (account) => account.id === fromAccountId,
                      );

                      setTransferDraft((draft) => ({
                        ...draft,
                        fromAccountId,
                        toAccountId:
                          draft.toAccountId === fromAccountId
                            ? (ledgerSummary.data?.accounts.find(
                                (account) => account.id !== fromAccountId,
                              )?.id ?? "")
                            : draft.toAccountId,
                        currency: fromAccount?.currency ?? draft.currency,
                      }));
                    }}
                    value={transferDraft.fromAccountId}
                  >
                    {ledgerSummary.data?.accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name} · {account.currency}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="To account"
                    className="h-9 rounded-none border border-border bg-background px-2 text-sm"
                    onChange={(event) =>
                      setTransferDraft((draft) => ({ ...draft, toAccountId: event.target.value }))
                    }
                    value={transferDraft.toAccountId}
                  >
                    {ledgerSummary.data?.accounts.map((account) => (
                      <option
                        disabled={account.id === transferDraft.fromAccountId}
                        key={account.id}
                        value={account.id}
                      >
                        {account.name} · {account.currency}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-2 sm:grid-cols-[1fr_96px_128px]">
                  <Input
                    inputMode="decimal"
                    onChange={(event) =>
                      setTransferDraft((draft) => ({ ...draft, amount: event.target.value }))
                    }
                    placeholder="50.00"
                    value={transferDraft.amount}
                  />
                  <Input
                    onChange={(event) =>
                      setTransferDraft((draft) => ({
                        ...draft,
                        currency: event.target.value.toUpperCase(),
                      }))
                    }
                    value={transferDraft.currency}
                  />
                  <select
                    aria-label="Transfer tag"
                    className="h-9 rounded-none border border-border bg-background px-2 text-sm"
                    onChange={(event) =>
                      setTransferDraft((draft) => ({ ...draft, tagId: event.target.value }))
                    }
                    value={transferDraft.tagId}
                  >
                    <option value="">No tag</option>
                    {ledgerSummary.data?.tags.map((tag) => (
                      <option key={tag.id} value={tag.id}>
                        {tag.name}
                      </option>
                    ))}
                  </select>
                </div>
                <Input
                  onChange={(event) =>
                    setTransferDraft((draft) => ({ ...draft, description: event.target.value }))
                  }
                  placeholder="Description"
                  value={transferDraft.description}
                />
                <Button
                  disabled={
                    createTransferPairMutation.isPending ||
                    !currentTeamId ||
                    (ledgerSummary.data?.accounts.length ?? 0) < 2 ||
                    !canCreateTransferPair(transferDraft)
                  }
                  onClick={() =>
                    currentTeamId
                      ? createTransferPairMutation.mutate({
                          teamId: currentTeamId,
                          fromAccountId: transferDraft.fromAccountId,
                          toAccountId: transferDraft.toAccountId,
                          postedAt: new Date().toISOString(),
                          description: transferDraft.description,
                          money: {
                            amountMinor: parseMoneyInputToMinor(transferDraft.amount),
                            currency: transferDraft.currency.trim().toUpperCase(),
                          },
                          tagIds: transferDraft.tagId ? [transferDraft.tagId] : undefined,
                          idempotencyKey: crypto.randomUUID(),
                        })
                      : undefined
                  }
                >
                  Create transfer
                </Button>
                {(ledgerSummary.data?.accounts.length ?? 0) < 2 ? (
                  <Muted>Add a second ledger account to create transfers.</Muted>
                ) : null}
              </div>
            </div>
            <ErrorText error={createCounterpartyMutation.error} />
            <ErrorText error={createTransactionTagMutation.error} />
            <ErrorText error={createTransferPairMutation.error} />
          </div>
        </Panel>

        <Panel
          description="Imported rows use ledger normalization, duplicate detection, audit, and outbox."
          icon={UploadIcon}
          title="CSV import"
        >
          <div className="grid gap-3">
            <div className="grid gap-3 md:grid-cols-[1fr_220px]">
              <Label className="flex flex-col gap-1 text-sm">
                CSV file
                <Input
                  accept=".csv,text/csv"
                  onChange={async (event) => {
                    const file = event.currentTarget.files?.[0];

                    if (!file) {
                      return;
                    }

                    const text = await file.text();

                    setCsvFileName(file.name);
                    setCsvText(text);
                    setCsvParseError(null);
                    try {
                      const rows = parseCsvTransactionRows(text);
                      const detected = mappingStateFromDetected(
                        detectCsvTransactionColumnMapping(rows),
                      );

                      setCsvMapping((mapping) => ({
                        ...detected,
                        categoryId: mapping.categoryId,
                      }));
                    } catch (error) {
                      setCsvParseError(
                        error instanceof Error ? error.message : "CSV import file is invalid",
                      );
                    }
                    csvPreviewMutation.reset();
                    csvCommitMutation.reset();
                    setCsvPreviewFingerprint(null);
                    setCsvCommitAcknowledgementFingerprint(null);
                  }}
                  type="file"
                />
              </Label>
              <Label className="flex flex-col gap-1 text-sm">
                Account
                <select
                  className="h-9 rounded-none border border-border bg-background px-2 text-sm"
                  onChange={(event) => setCsvAccountId(event.target.value)}
                  value={csvAccountId}
                >
                  {ledgerSummary.data?.accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} · {account.currency}
                    </option>
                  ))}
                </select>
              </Label>
            </div>
            {csvHeaders.length > 0 ? (
              <div className="grid gap-2 border border-border bg-card/30 p-3 text-xs text-muted-foreground md:grid-cols-4">
                <span>{csvHeaders.length} detected columns</span>
                <span>Date: {csvMapping.postedAt || "not mapped"}</span>
                <span>Description: {csvMapping.description || "not mapped"}</span>
                <span>
                  Amount:{" "}
                  {csvMapping.amount ||
                    [csvMapping.debit, csvMapping.credit].filter(Boolean).join(" / ") ||
                    "not mapped"}
                </span>
              </div>
            ) : null}
            <div className="grid gap-2 md:grid-cols-3">
              <ColumnSelect
                headers={csvHeaders}
                label="Date column"
                onChange={(value) => setCsvMapping((mapping) => ({ ...mapping, postedAt: value }))}
                required
                value={csvMapping.postedAt}
              />
              <ColumnSelect
                headers={csvHeaders}
                label="Description column"
                onChange={(value) =>
                  setCsvMapping((mapping) => ({ ...mapping, description: value }))
                }
                required
                value={csvMapping.description}
              />
              <ColumnSelect
                headers={csvHeaders}
                label="Signed amount"
                onChange={(value) => setCsvMapping((mapping) => ({ ...mapping, amount: value }))}
                value={csvMapping.amount}
              />
              <ColumnSelect
                headers={csvHeaders}
                label="Debit optional"
                onChange={(value) => setCsvMapping((mapping) => ({ ...mapping, debit: value }))}
                value={csvMapping.debit}
              />
              <ColumnSelect
                headers={csvHeaders}
                label="Credit optional"
                onChange={(value) => setCsvMapping((mapping) => ({ ...mapping, credit: value }))}
                value={csvMapping.credit}
              />
              <ColumnSelect
                headers={csvHeaders}
                label="Currency optional"
                onChange={(value) => setCsvMapping((mapping) => ({ ...mapping, currency: value }))}
                value={csvMapping.currency}
              />
              <select
                aria-label="CSV category"
                className="h-9 rounded-none border border-border bg-background px-2 text-sm"
                onChange={(event) =>
                  setCsvMapping((mapping) => ({ ...mapping, categoryId: event.target.value }))
                }
                value={csvMapping.categoryId}
              >
                <option value="">Uncategorized</option>
                {transactionReview.data?.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <label className="flex h-9 items-center gap-2 border border-border px-3 text-sm text-muted-foreground">
                <Checkbox
                  checked={csvMapping.invertAmount}
                  disabled={!csvMapping.amount}
                  onCheckedChange={(checked) =>
                    setCsvMapping((mapping) => ({
                      ...mapping,
                      invertAmount: Boolean(checked),
                    }))
                  }
                />
                Invert signed amount
              </label>
            </div>
            {csvParseError ? <p className="text-xs text-destructive">{csvParseError}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!currentTeamId || !canImportCsv(csvText, csvAccountId, csvMapping)}
                onClick={() => {
                  if (!currentTeamId) {
                    return;
                  }

                  const previewInput = {
                    teamId: currentTeamId,
                    accountId: csvAccountId,
                    csvText,
                    mapping: normalizedCsvMapping(csvMapping),
                  };
                  const previewFingerprint = csvImportDraftFingerprint;

                  setCsvPreviewFingerprint(null);
                  setCsvCommitAcknowledgementFingerprint(null);
                  csvPreviewMutation.reset();
                  csvCommitMutation.reset();
                  csvPreviewMutation.mutate(previewInput, {
                    onSuccess: () => setCsvPreviewFingerprint(previewFingerprint),
                  });
                }}
                variant="outline"
              >
                Preview import
              </Button>
              <Button
                disabled={
                  !currentTeamId ||
                  csvCommitMutation.isPending ||
                  !canImportCsv(csvText, csvAccountId, csvMapping) ||
                  !hasCurrentCsvPreview ||
                  !hasCsvCommitAcknowledgement ||
                  (csvPreviewMutation.data?.readyCount ?? 0) === 0
                }
                onClick={() => {
                  if (!currentTeamId) {
                    return;
                  }

                  csvCommitMutation.mutate({
                    teamId: currentTeamId,
                    accountId: csvAccountId,
                    csvText,
                    fileName: csvFileName,
                    mapping: normalizedCsvMapping(csvMapping),
                    idempotencyKey: crypto.randomUUID(),
                  });
                }}
              >
                Commit ready rows
              </Button>
            </div>
            {csvPreviewMutation.data && !hasCurrentCsvPreview ? (
              <p className="text-sm text-muted-foreground">
                Preview is stale after CSV, account, or mapping changes. Preview again before
                committing.
              </p>
            ) : null}
            {csvPreviewMutation.data && hasCurrentCsvPreview ? (
              <>
                <CsvImportPreview preview={csvPreviewMutation.data} />
                <label className="flex items-start gap-3 border border-border bg-card/30 p-3 text-sm">
                  <Checkbox
                    aria-label="Acknowledge CSV preview checks"
                    checked={hasCsvCommitAcknowledgement}
                    onCheckedChange={(checked) =>
                      setCsvCommitAcknowledgementFingerprint(
                        checked ? csvImportDraftFingerprint : null,
                      )
                    }
                  />
                  <span className="grid gap-1">
                    <span className="font-medium">Preview reviewed</span>
                    <span className="text-xs leading-5 text-muted-foreground">
                      Account, date range, amount signs, duplicate rows, and invalid rows are
                      understood for this CSV.
                    </span>
                  </span>
                </label>
              </>
            ) : null}
            {csvCommitMutation.data ? (
              <p className="text-sm text-muted-foreground">
                {csvCommitMutation.data.mode === "queued"
                  ? `Queued ${csvCommitMutation.data.preview.readyCount} ready rows for background import. ${csvCommitMutation.data.importSession.duplicateCount} duplicate, ${csvCommitMutation.data.importSession.invalidCount} invalid, ${csvCommitMutation.data.importSession.rowCount} total. Track the job in Operational trace.`
                  : `Imported ${csvCommitMutation.data.importSession.importedCount} transactions. ${csvCommitMutation.data.importSession.duplicateCount} duplicate, ${csvCommitMutation.data.importSession.invalidCount} invalid, ${csvCommitMutation.data.importSession.rowCount} total.`}
              </p>
            ) : null}
            <ErrorText error={csvPreviewMutation.error} />
            <ErrorText error={csvCommitMutation.error} />
          </div>
        </Panel>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <Panel
          description="Selected-period readiness uses transaction lifecycle state before the accountant packet is sent."
          icon={ShieldIcon}
          title="Accountant close"
        >
          <div className="grid gap-4">
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
              <Label className="flex flex-col gap-1 text-xs text-muted-foreground">
                From
                <Input
                  aria-label="Accountant close period from"
                  onChange={(event) =>
                    setAccountantClosePeriod((period) => ({
                      ...period,
                      from: event.target.value,
                    }))
                  }
                  type="date"
                  value={accountantClosePeriod.from}
                />
              </Label>
              <Label className="flex flex-col gap-1 text-xs text-muted-foreground">
                To
                <Input
                  aria-label="Accountant close period to"
                  onChange={(event) =>
                    setAccountantClosePeriod((period) => ({
                      ...period,
                      to: event.target.value,
                    }))
                  }
                  type="date"
                  value={accountantClosePeriod.to}
                />
              </Label>
              <Button
                className="self-end"
                onClick={() => setAccountantClosePeriod((period) => shiftMonthPeriod(period, -1))}
                variant="outline"
              >
                Previous
              </Button>
              <Button
                className="self-end"
                onClick={() => setAccountantClosePeriod(defaultAccountantClosePeriod())}
                variant="outline"
              >
                This month
              </Button>
            </div>

            {operations.data?.accountantClose ? (
              <div className="grid gap-3">
                <div className="flex flex-wrap items-start justify-between gap-3 border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">
                      {formatDateRange(
                        operations.data.accountantClose.period.from,
                        operations.data.accountantClose.period.to,
                      )}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {operations.data.accountantClose.nextStep}
                    </p>
                  </div>
                  <Badge variant={closeStatusVariant(operations.data.accountantClose.status)}>
                    {statusLabel(operations.data.accountantClose.status)}
                  </Badge>
                </div>
                <div className="grid gap-px border border-border bg-border sm:grid-cols-3">
                  {[
                    ["Transactions", operations.data.accountantClose.transactionCount],
                    ["Ready", operations.data.accountantClose.readyToExportCount],
                    ["Exported", operations.data.accountantClose.exportedCount],
                    ["Missing receipts", operations.data.accountantClose.missingReceiptCount],
                    ["Needs review", operations.data.accountantClose.needsReviewCount],
                    ["Failed exports", operations.data.accountantClose.exportFailedCount],
                  ].map(([label, value]) => (
                    <div className="bg-background p-3" key={label}>
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="mt-2 font-mono text-lg">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <Muted>
                Select a valid close period and load Operations access to see accountant readiness.
              </Muted>
            )}
          </div>
        </Panel>

        <Panel
          description="Stored accountant packets, generation actors, status, and access audit events."
          icon={DatabaseIcon}
          title="Export history"
        >
          <div className="grid gap-3">
            {packetExports.data?.packets.slice(0, 8).map((packet) => {
              const accessEvents = accountantPacketAuditEvents.filter(
                (event) =>
                  event.entityType === "accountant_packet" &&
                  event.entityId === packet.packetId &&
                  event.action !== "accountant_packet.exported",
              );

              return (
                <div className="grid gap-3 border border-border p-3 text-sm" key={packet.packetId}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{packet.fileName}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Generated by {packet.actorId} · {formatDateTime(packet.createdAt)}
                      </p>
                    </div>
                    <Badge variant={packetStatusVariant(packet.status)}>
                      {statusLabel(packet.status)}
                    </Badge>
                  </div>
                  <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                    <span>{packet.manifest.transactionCount} transactions</span>
                    <span>
                      {packet.manifest.attachmentCount} attachments ·{" "}
                      {packet.manifest.skippedAttachmentCount} skipped
                    </span>
                    <span>{formatBytes(packet.byteSize)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatDateRange(packet.manifest.filters.from, packet.manifest.filters.to)} ·{" "}
                    {packet.manifest.settings.formats.join(" + ").toUpperCase()} · delimiter{" "}
                    {packet.manifest.settings.csvDelimiter === "\t"
                      ? "tab"
                      : packet.manifest.settings.csvDelimiter}
                  </p>
                  <div className="grid gap-2">
                    <p className="text-xs font-medium">Access activity</p>
                    {accessEvents.slice(0, 3).map((event) => (
                      <RunLine
                        detail={formatPacketAccessDetail(event)}
                        key={event.id}
                        status={formatDateTime(event.occurredAt)}
                        title={accountantPacketAuditLabel(event.action)}
                      />
                    ))}
                    {accessEvents.length === 0 ? (
                      <Muted>No access events in the current operations window.</Muted>
                    ) : null}
                  </div>
                  {packet.status === "revoked" ? (
                    <p className="text-xs text-muted-foreground">
                      Revoked by {packet.revokedByActorId ?? "unknown"} ·{" "}
                      {formatDateTime(packet.revokedAt)}
                      {packet.revokeReason ? ` · ${packet.revokeReason}` : ""}
                    </p>
                  ) : null}
                </div>
              );
            })}
            {canExportPackets && packetExports.isLoading ? (
              <Muted>Loading stored accountant packet exports...</Muted>
            ) : null}
            {canExportPackets && packetExports.isError ? (
              <Muted>Packet export history is unavailable. Check packet export migrations.</Muted>
            ) : null}
            {canExportPackets && packetExports.data && packetExports.data.packets.length === 0 ? (
              <Muted>No stored accountant packet exports yet.</Muted>
            ) : null}
            {!canExportPackets ? (
              <Muted>Accountant packet export permission is required to view history.</Muted>
            ) : null}
            <ErrorText error={packetExports.error} />
            <ErrorText error={packetAccessAudit.error} />
          </div>
        </Panel>
      </section>

      <Panel
        description="Queue, outbox, provider, webhook, automation, audit, and data workflow state."
        icon={ActivityIcon}
        title="Operational trace"
      >
        <div className="grid gap-4">
          <div className="grid gap-px border border-border bg-border md:grid-cols-4">
            {[
              ["Failed jobs", operations.data?.metrics.failedJobs],
              ["Dead letters", operations.data?.metrics.deadLetters],
              ["Webhooks", operations.data?.metrics.webhookFailures],
              ["Automations", operations.data?.metrics.automationFailures],
            ].map(([label, value]) => (
              <div className="bg-background p-4" key={label}>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-3 font-mono text-xl">{value ?? "..."}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <ListBlock title="Outbox and jobs">
              {operations.data?.recentOutboxEvents.slice(0, 4).map((event) => (
                <RunLine
                  detail={`${event.dispatchAttempts} attempts · ${new Date(
                    event.occurredAt,
                  ).toLocaleString()}`}
                  key={event.id}
                  status={event.status}
                  title={event.type}
                />
              ))}
              {operations.data?.recentJobRuns.slice(0, 2).map((run) => (
                <RunLine
                  detail={run.error ?? new Date(run.createdAt).toLocaleString()}
                  key={run.id}
                  status={run.status}
                  title={run.jobType}
                />
              ))}
              {!operations.data?.recentOutboxEvents.length &&
              !operations.data?.recentJobRuns.length ? (
                <Muted>No outbox or job runs yet.</Muted>
              ) : null}
            </ListBlock>
            <ListBlock title="Job guidance">
              {operations.data?.jobRunActions.slice(0, 4).map((action) => (
                <div className="grid gap-2 border border-border p-3 text-sm" key={action.jobRunId}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate font-medium">{action.jobType}</span>
                    <Badge variant={jobActionVariant(action.status)}>
                      {statusLabel(action.status)}
                    </Badge>
                  </div>
                  <p className="break-words text-xs text-muted-foreground">{action.reason}</p>
                  <p className="break-words text-xs text-muted-foreground">{action.nextStep}</p>
                  {action.nextAttemptAt ? (
                    <p className="text-xs text-muted-foreground">
                      Next attempt: {formatDateTime(action.nextAttemptAt)}
                    </p>
                  ) : null}
                </div>
              ))}
              {!operations.data?.jobRunActions.length ? (
                <Muted>No queued, retryable, or dead-lettered jobs.</Muted>
              ) : null}
            </ListBlock>
            <ListBlock title="Providers">
              {operations.data?.recentProviderSyncRuns.slice(0, 2).map((run) => (
                <RunLine
                  detail={run.error ?? `${run.transactionsImported} transactions`}
                  key={run.id}
                  status={run.status}
                  title={`Bank ${run.connectionId}`}
                />
              ))}
              {operations.data?.recentIntegrationSyncRuns.slice(0, 2).map((run) => (
                <RunLine
                  detail={run.error ?? `${run.recordsSynced} records`}
                  key={run.id}
                  status={run.status}
                  title={`${run.category} · ${run.provider}`}
                />
              ))}
              {!operations.data?.recentProviderSyncRuns.length &&
              !operations.data?.recentIntegrationSyncRuns.length ? (
                <Muted>No provider activity yet.</Muted>
              ) : null}
            </ListBlock>
            <ListBlock title="Data workflows">
              {operations.data?.dataWorkflows.map((workflow) => (
                <div className="grid gap-2 border border-border p-3 text-sm" key={workflow.type}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">{workflow.type.replaceAll("_", " ")}</span>
                    <span className="text-xs text-muted-foreground">{workflow.status}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{workflow.nextStep}</p>
                  {workflow.type === "team_data_export" ? (
                    <Button
                      className="w-fit"
                      disabled={!currentTeamId || requestDataExportMutation.isPending}
                      onClick={() =>
                        currentTeamId
                          ? requestDataExportMutation.mutate({
                              teamId: currentTeamId,
                              idempotencyKey: crypto.randomUUID(),
                            })
                          : undefined
                      }
                      size="sm"
                      variant="outline"
                    >
                      Queue export
                    </Button>
                  ) : null}
                  {workflow.type === "team_data_deletion" ? (
                    <Button
                      className="w-fit"
                      disabled={!currentTeamId || requestDataDeletionMutation.isPending}
                      onClick={() =>
                        currentTeamId
                          ? requestDataDeletionMutation.mutate({
                              teamId: currentTeamId,
                              confirmTeamId: currentTeamId,
                              idempotencyKey: crypto.randomUUID(),
                            })
                          : undefined
                      }
                      size="sm"
                      variant="destructive"
                    >
                      Queue deletion
                    </Button>
                  ) : null}
                </div>
              ))}
            </ListBlock>
          </div>
          <ErrorText error={operations.error} />
          <ErrorText error={requestDataExportMutation.error} />
          <ErrorText error={requestDataDeletionMutation.error} />
        </div>
      </Panel>
    </div>
  );
}

function Panel({
  children,
  description,
  icon: Icon,
  title,
}: {
  children: React.ReactNode;
  description: string;
  icon: typeof ActivityIcon;
  title: string;
}) {
  return (
    <section className="grid gap-4 border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-medium">{title}</h2>
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
        <ArrowUpRightIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
      </div>
      {children}
    </section>
  );
}

function ListBlock({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div className="grid content-start gap-2">
      <p className="text-sm font-medium">{title}</p>
      {children}
    </div>
  );
}

function RunLine({ detail, status, title }: { detail: string; status: string; title: string }) {
  return (
    <div className="grid gap-1 border border-border p-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="truncate font-medium">{title}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{status}</span>
      </div>
      <p className="break-words text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

function ErrorText({ error }: { error: unknown }) {
  if (!error) {
    return null;
  }

  return <p className="text-sm text-destructive">{errorMessage(error)}</p>;
}

function canCreateTransferPair(state: {
  fromAccountId: string;
  toAccountId: string;
  amount: string;
  currency: string;
  description: string;
}) {
  return (
    state.fromAccountId.length > 0 &&
    state.toAccountId.length > 0 &&
    state.fromAccountId !== state.toAccountId &&
    state.description.trim().length > 0 &&
    /^[A-Z]{3}$/.test(state.currency.trim().toUpperCase()) &&
    /^\d+(?:\.\d{0,2})?$/.test(state.amount.trim()) &&
    parseMoneyInputToMinor(state.amount) > 0
  );
}

function canImportCsv(csvText: string, accountId: string, mapping: CsvImportMappingState) {
  return (
    csvText.trim().length > 0 &&
    accountId.length > 0 &&
    mapping.postedAt.trim().length > 0 &&
    mapping.description.trim().length > 0 &&
    (mapping.amount.trim().length > 0 ||
      mapping.debit.trim().length > 0 ||
      mapping.credit.trim().length > 0)
  );
}

function normalizedCsvMapping(mapping: CsvImportMappingState) {
  return {
    postedAt: mapping.postedAt.trim(),
    description: mapping.description.trim(),
    amount: mapping.amount.trim() || null,
    debit: mapping.debit.trim() || null,
    credit: mapping.credit.trim() || null,
    currency: mapping.currency.trim() || null,
    invertAmount: mapping.invertAmount,
    categoryId: mapping.categoryId || null,
  };
}

function csvImportInputFingerprint(input: {
  accountId: string;
  csvText: string;
  mapping: CsvImportMappingState;
}) {
  return JSON.stringify({
    accountId: input.accountId,
    csvText: input.csvText,
    mapping: normalizedCsvMapping(input.mapping),
  });
}

function mappingStateFromDetected(mapping: {
  postedAt?: string | null;
  description?: string | null;
  amount?: string | null;
  debit?: string | null;
  credit?: string | null;
  currency?: string | null;
  invertAmount?: boolean | null;
}): CsvImportMappingState {
  return {
    postedAt: mapping.postedAt ?? "",
    description: mapping.description ?? "",
    amount: mapping.amount ?? "",
    debit: mapping.debit ?? "",
    credit: mapping.credit ?? "",
    currency: mapping.currency ?? "",
    invertAmount: Boolean(mapping.invertAmount),
    categoryId: "",
  };
}

function ColumnSelect({
  headers,
  label,
  onChange,
  required = false,
  value,
}: {
  headers: string[];
  label: string;
  onChange: (value: string) => void;
  required?: boolean;
  value: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <select
        aria-label={`CSV ${label}`}
        className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="">{required ? "Select column" : "Not mapped"}</option>
        {headers.map((header) => (
          <option key={header} value={header}>
            {header}
          </option>
        ))}
      </select>
    </label>
  );
}

function CsvImportPreview({ preview }: { preview: CsvImportPreviewData }) {
  const detected = mappingStateFromDetected(preview.detectedMapping);

  return (
    <div className="grid gap-2 border border-border p-3">
      <div className="grid gap-2 text-sm sm:grid-cols-4">
        <p>
          <span className="font-medium">{preview.readyCount}</span> ready
        </p>
        <p>
          <span className="font-medium">{preview.duplicateCount}</span> duplicate
        </p>
        <p>
          <span className="font-medium">{preview.invalidCount}</span> invalid
        </p>
        <p>
          <span className="font-medium">{preview.totalRows}</span> total
        </p>
      </div>
      <div className="grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
        <span>{preview.headers.length} columns scanned</span>
        <span>Date: {detected.postedAt || "not detected"}</span>
        <span>Amount: {detected.amount || detected.debit || "not detected"}</span>
      </div>
      <div className="grid gap-2 border border-border/70 p-2 text-xs sm:grid-cols-3">
        <p>
          <span className="block text-muted-foreground">Ready date range</span>
          <span className="font-medium">
            {preview.summary.readyDateRange
              ? formatDateRange(
                  preview.summary.readyDateRange.from,
                  preview.summary.readyDateRange.to,
                )
              : "No ready rows"}
          </span>
        </p>
        <p>
          <span className="block text-muted-foreground">Ready signed total</span>
          <span className="font-medium">{csvPreviewTotalsLabel(preview.summary)}</span>
        </p>
        <p>
          <span className="block text-muted-foreground">Ready row signs</span>
          <span className="font-medium">
            {preview.summary.readyExpenseCount} expense · {preview.summary.readyIncomeCount} income
            {preview.summary.readyZeroAmountCount > 0
              ? ` · ${preview.summary.readyZeroAmountCount} zero`
              : ""}
          </span>
        </p>
      </div>
      {detected.amount && detected.invertAmount ? (
        <p className="text-xs text-warning">Amount column is inverted for preview normalization.</p>
      ) : null}
      <div className="max-h-64 overflow-auto border border-border">
        {preview.rows.slice(0, 25).map((row) => (
          <div
            className="grid gap-2 border-b border-border p-2 text-sm last:border-b-0 md:grid-cols-[auto_auto_1fr]"
            key={row.rowNumber}
          >
            <span className="font-mono text-xs">#{row.rowNumber}</span>
            <span className="capitalize text-muted-foreground">{row.status}</span>
            <span>
              {row.errors.length > 0
                ? row.errors.join(", ")
                : `${mappedCsvValue(row.values, detected.description, "transaction")} · ${mappedCsvValue(
                    row.values,
                    detected.amount || detected.debit || detected.credit,
                    "",
                  )}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function csvPreviewTotalsLabel(previewSummary: CsvImportPreviewData["summary"]) {
  const totals = Object.values(previewSummary.readyCurrencyTotals);

  if (totals.length === 0) {
    return "No ready rows";
  }

  return totals.map((money) => formatMoney(money)).join(" · ");
}

function mappedCsvValue(values: Record<string, string>, column: string, fallback: string) {
  return column ? values[column] || fallback : fallback;
}

function defaultAccountantClosePeriod(): AccountantClosePeriodState {
  return monthPeriodFromDate(new Date());
}

function shiftMonthPeriod(period: AccountantClosePeriodState, offset: number) {
  const [year = "0", month = "1"] = period.from.split("-");
  const date = new Date(Date.UTC(Number.parseInt(year, 10), Number.parseInt(month, 10) - 1, 1));

  if (!Number.isFinite(date.getTime())) {
    return defaultAccountantClosePeriod();
  }

  date.setUTCMonth(date.getUTCMonth() + offset);

  return monthPeriodFromDate(date);
}

function monthPeriodFromDate(date: Date): AccountantClosePeriodState {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const from = new Date(Date.UTC(year, month, 1));
  const to = new Date(Date.UTC(year, month + 1, 0));

  return {
    from: isoDateInputValue(from),
    to: isoDateInputValue(to),
  };
}

function accountantClosePeriodInput(period: AccountantClosePeriodState) {
  if (!period.from || !period.to) {
    return null;
  }

  const from = new Date(`${period.from}T00:00:00.000Z`);
  const to = new Date(`${period.to}T23:59:59.999Z`);

  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) {
    return null;
  }

  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

function isoDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDateRange(from: string, to: string) {
  return `${formatDateOnly(from)} to ${formatDateOnly(to)}`;
}

function formatDateOnly(value?: string | null) {
  if (!value) {
    return "n/a";
  }

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString();
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "n/a";
  }

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function closeStatusVariant(status: string) {
  if (status === "ready") {
    return "success" as const;
  }

  if (status === "blocked") {
    return "error" as const;
  }

  if (status === "needs_work") {
    return "warning" as const;
  }

  return "secondary" as const;
}

function packetStatusVariant(status: string) {
  return status === "available" ? ("success" as const) : ("warning" as const);
}

function jobActionVariant(status: string) {
  if (status === "dead_lettered") {
    return "error" as const;
  }

  if (status === "retryable") {
    return "warning" as const;
  }

  return "secondary" as const;
}

function accountantPacketAuditLabel(action: string) {
  if (action === "accountant_packet.download_link_created") {
    return "Download link";
  }

  if (action === "accountant_packet.email_sent") {
    return "Email sent";
  }

  if (action === "accountant_packet.email_failed") {
    return "Email failed";
  }

  if (action === "accountant_packet.revoked") {
    return "Revoked";
  }

  return statusLabel(action.replace(/^accountant_packet\./, ""));
}

function formatPacketAccessDetail(event: { actorId: string; metadata: Record<string, unknown> }) {
  const toEmail = typeof event.metadata.toEmail === "string" ? event.metadata.toEmail : null;
  const copiedRequesterEmail =
    typeof event.metadata.copiedRequesterEmail === "string"
      ? event.metadata.copiedRequesterEmail
      : null;
  const expiresAt = typeof event.metadata.expiresAt === "string" ? event.metadata.expiresAt : null;
  const providerMessageId =
    typeof event.metadata.providerMessageId === "string" ? event.metadata.providerMessageId : null;
  const details = [`Actor ${event.actorId}`];

  if (toEmail) {
    details.push(`to ${toEmail}`);
  }

  if (copiedRequesterEmail) {
    details.push(`cc ${copiedRequesterEmail}`);
  }

  if (providerMessageId) {
    details.push(`message ${providerMessageId}`);
  }

  if (expiresAt) {
    details.push(`expires ${formatDateTime(expiresAt)}`);
  }

  return details.join(" · ");
}

function parseMoneyInputToMinor(value: string) {
  const normalized = value.trim();
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(normalized);

  if (!match) {
    throw new Error("Money amount is invalid");
  }

  return (
    Number.parseInt(match[1] ?? "0", 10) * 100 +
    Number.parseInt((match[2] ?? "").padEnd(2, "0"), 10)
  );
}

function formatSyncLag(seconds?: number | null) {
  if (seconds == null) {
    return "n/a";
  }

  if (seconds < 60) {
    return `${seconds}s`;
  }

  if (seconds < 60 * 60) {
    return `${Math.floor(seconds / 60)}m`;
  }

  return `${Math.floor(seconds / (60 * 60))}h`;
}

function buildAutomationActionConfig(input: {
  actionType:
    | "categorize_transaction"
    | "create_notification"
    | "create_invoice_draft"
    | "request_accounting_export";
  categoryId: string;
  customerId: string;
  productId: string;
  message: string;
  exportType: string;
}) {
  if (input.actionType === "categorize_transaction") {
    return { categoryId: input.categoryId };
  }

  if (input.actionType === "create_invoice_draft") {
    return {
      customerId: input.customerId,
      productId: input.productId,
    };
  }

  if (input.actionType === "request_accounting_export") {
    return { exportType: input.exportType || "transactions" };
  }

  return { message: input.message };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Operation failed";
}
