import { Button } from "@dawn/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dawn/ui/components/card";
import { formatMoney, type Money } from "@dawn/domain";
import type { TransactionSyncRecord } from "@dawn/sync";
import { Input } from "@dawn/ui/components/input";
import { Label } from "@dawn/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";

import { authClient } from "@/lib/auth-client";
import { useTransactionSync } from "@/sync/transactions";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/dashboard")({
  component: RouteComponent,
});

function RouteComponent() {
  const { session, customerState } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const [selectedTeamId, setSelectedTeamId] = useState<string | undefined>(
    () => localStorage.getItem("dawn:selected-team-id") ?? undefined,
  );
  const [newTeamName, setNewTeamName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamInviteRole>("member");
  const [csvText, setCsvText] = useState("");
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [csvAccountId, setCsvAccountId] = useState("");
  const [csvMapping, setCsvMapping] = useState({
    postedAt: "Date",
    description: "Description",
    amount: "Amount",
    currency: "",
    categoryId: "",
  });
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [extractionCorrections, setExtractionCorrections] = useState<
    Record<string, ExtractionCorrectionState>
  >({});
  const [customerDraft, setCustomerDraft] = useState({
    name: "",
    email: "",
    contactName: "",
    contactEmail: "",
  });
  const [productDraft, setProductDraft] = useState({
    name: "",
    type: "service" as "product" | "service",
    unitPrice: "",
    currency: "USD",
    taxRate: "0",
  });
  const [invoiceDraft, setInvoiceDraft] = useState({
    invoiceId: "",
    customerId: "",
    invoiceNumber: "",
    dueDate: "",
    productId: "",
    quantity: "1",
    discountRate: "0",
  });
  const [invoiceActionDraft, setInvoiceActionDraft] = useState({
    paymentAmount: "",
    recurringFrequency: "monthly" as "weekly" | "monthly" | "quarterly" | "yearly",
    recurringNextRunAt: "",
  });
  const [invoicePreview, setInvoicePreview] = useState<{
    invoiceNumber: string;
    fileName: string;
    bodyBase64: string;
  } | null>(null);
  const [projectDraft, setProjectDraft] = useState({
    customerId: "",
    name: "",
    billableRate: "",
    currency: "USD",
  });
  const [timeDraft, setTimeDraft] = useState({
    projectId: "",
    description: "",
    durationMinutes: "",
    billableStatus: "billable" as "billable" | "non_billable",
  });
  const [timeInvoiceDraft, setTimeInvoiceDraft] = useState({
    timeEntryId: "",
    invoiceNumber: "",
  });
  const [assistantPrompt, setAssistantPrompt] = useState("");
  const [assistantThreadId, setAssistantThreadId] = useState<string | null>(null);
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
  const [desktopCaptureMessage, setDesktopCaptureMessage] = useState<string | null>(null);
  const [syncReviewError, setSyncReviewError] = useState<string | null>(null);
  const [syncReviewingId, setSyncReviewingId] = useState<string | null>(null);

  const teams = useQuery(orpc.teams.list.queryOptions({ input: { teamId: selectedTeamId } }));
  const currentTeamId = selectedTeamId ?? teams.data?.currentTeamId;
  const currentTeam = teams.data?.teams.find((team) => team.id === currentTeamId);
  useEffect(() => {
    const teamId = new URLSearchParams(window.location.search).get("teamId");

    if (teamId && teamId !== selectedTeamId) {
      setSelectedTeamId(teamId);
      localStorage.setItem("dawn:selected-team-id", teamId);
    }
  }, [selectedTeamId]);
  const transactionSync = useTransactionSync(currentTeamId);
  const transactionReview = useQuery(
    orpc.transactionReview.list.queryOptions({ input: { teamId: currentTeamId } }),
  );
  const syncedTransactions = useMemo(
    () =>
      [...transactionSync.transactions].sort(
        (left, right) =>
          new Date(right.postedAt).getTime() - new Date(left.postedAt).getTime() ||
          new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
      ),
    [transactionSync.transactions],
  );
  const visibleTransactions =
    syncedTransactions.length > 0 || transactionSync.isReady
      ? syncedTransactions
      : (transactionReview.data?.transactions ?? []);
  const ledgerSummary = useQuery({
    ...orpc.ledger.summary.queryOptions({ input: { teamId: currentTeamId } }),
    enabled: Boolean(currentTeamId),
  });
  const canManageTeam = transactionReview.data?.permissions.includes("team.manage") ?? false;
  const canManageBankConnections =
    transactionReview.data?.permissions.includes("bank_connections.manage") ?? false;
  const canManageIntegrations =
    transactionReview.data?.permissions.includes("integrations.write") ?? false;
  const canReadOperations =
    transactionReview.data?.permissions.includes("operations.read") ?? false;
  const banking = useQuery({
    ...orpc.banking.list.queryOptions({ input: { teamId: currentTeamId } }),
    enabled: Boolean(currentTeamId),
  });
  const integrations = useQuery({
    ...orpc.integrations.list.queryOptions({ input: { teamId: currentTeamId } }),
    enabled: Boolean(currentTeamId),
  });
  const documents = useQuery({
    ...orpc.documents.list.queryOptions({ input: { teamId: currentTeamId } }),
    enabled: Boolean(currentTeamId),
  });
  const inbox = useQuery({
    ...orpc.inbox.list.queryOptions({ input: { teamId: currentTeamId } }),
    enabled: Boolean(currentTeamId),
  });
  const billing = useQuery({
    ...orpc.billing.list.queryOptions({ input: { teamId: currentTeamId } }),
    enabled: Boolean(currentTeamId),
  });
  const projects = useQuery({
    ...orpc.projects.list.queryOptions({ input: { teamId: currentTeamId } }),
    enabled: Boolean(currentTeamId),
  });
  const reports = useQuery({
    ...orpc.reports.overview.queryOptions({ input: { teamId: currentTeamId } }),
    enabled: Boolean(currentTeamId),
  });
  const assistant = useQuery({
    ...orpc.assistant.list.queryOptions({ input: { teamId: currentTeamId } }),
    enabled: Boolean(currentTeamId),
  });
  const automations = useQuery({
    ...orpc.automations.list.queryOptions({ input: { teamId: currentTeamId } }),
    enabled: Boolean(currentTeamId),
  });
  const operations = useQuery({
    ...orpc.operations.list.queryOptions({ input: { teamId: currentTeamId, limit: 8 } }),
    enabled: canReadOperations && Boolean(currentTeamId),
  });
  const teamDirectory = useQuery({
    ...orpc.teams.directory.queryOptions({ input: { teamId: currentTeamId } }),
    enabled: canManageTeam && Boolean(currentTeamId),
  });
  const reviewMutation = useMutation(
    orpc.transactionReview.review.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: orpc.transactionReview.list.queryKey(),
        });
        await transactionSync.refetch();
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
  const createTeamMutation = useMutation(
    orpc.teams.create.mutationOptions({
      onSuccess: async (team) => {
        setSelectedTeamId(team.id);
        localStorage.setItem("dawn:selected-team-id", team.id);
        setNewTeamName("");
        await queryClient.invalidateQueries({ queryKey: orpc.teams.list.queryKey() });
        await queryClient.invalidateQueries({ queryKey: orpc.transactionReview.list.queryKey() });
      },
    }),
  );
  const csvPreviewMutation = useMutation(orpc.csvImport.preview.mutationOptions());
  const connectMockBankMutation = useMutation(
    orpc.banking.connectMock.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.banking.list.queryKey() });
      },
    }),
  );
  const syncBankConnectionMutation = useMutation(
    orpc.banking.sync.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.banking.list.queryKey() });
        await queryClient.invalidateQueries({ queryKey: orpc.ledger.summary.queryKey() });
        await transactionSync.refetch();
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
  const documentUploadMutation = useMutation({
    mutationFn: async (input: { teamId: string; file: File }) => {
      const prepared = await client.documents.createUpload({
        teamId: input.teamId,
        fileName: input.file.name,
        contentType: input.file.type || "application/octet-stream",
        byteSize: input.file.size,
        idempotencyKey: crypto.randomUUID(),
      });
      const upload = await fetch(prepared.uploadUrl, {
        method: "PUT",
        headers: {
          "content-type": input.file.type || "application/octet-stream",
        },
        body: await input.file.arrayBuffer(),
      });

      if (!upload.ok) {
        throw new Error(await upload.text());
      }

      return prepared;
    },
    onSuccess: async () => {
      setDocumentFile(null);
      await queryClient.invalidateQueries({ queryKey: orpc.documents.list.queryKey() });
      await queryClient.invalidateQueries({ queryKey: orpc.inbox.list.queryKey() });
    },
  });
  const documentDownloadMutation = useMutation({
    mutationFn: async (input: { teamId: string; documentId: string }) => {
      return client.documents.download(input);
    },
    onSuccess: (result) => {
      window.location.assign(result.downloadUrl);
    },
  });
  useEffect(() => {
    const listener = (event: Event) => {
      const payload = desktopCapturePayload(event);
      const teamId = payload?.teamId ?? currentTeamId;

      if (!payload) {
        return;
      }

      if (!teamId) {
        setDesktopCaptureMessage("Choose a team before capturing files from the desktop app.");
        return;
      }

      const file = fileFromDesktopCapture(payload);
      setDesktopCaptureMessage(`Uploading ${file.name} from the desktop app.`);
      documentUploadMutation.mutate(
        { teamId, file },
        {
          onError: (error) =>
            setDesktopCaptureMessage(
              error instanceof Error ? error.message : "Desktop capture upload failed.",
            ),
          onSuccess: () => setDesktopCaptureMessage(`${file.name} was sent to the inbox.`),
        },
      );
    };

    window.addEventListener("dawn:desktop-capture", listener);
    return () => window.removeEventListener("dawn:desktop-capture", listener);
  }, [currentTeamId, documentUploadMutation]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const focusType = params.get("desktopFocusType");
    const focusId = params.get("desktopFocusId");

    if (!focusType || !focusId) {
      return;
    }

    const timeout = window.setTimeout(() => {
      const target = [...document.querySelectorAll("[data-desktop-record-id]")].find(
        (element) =>
          element.getAttribute("data-desktop-record-type") === focusType &&
          element.getAttribute("data-desktop-record-id") === focusId,
      );
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [billing.data, documents.data, inbox.data, visibleTransactions]);
  const extractionCorrectionMutation = useMutation(
    orpc.inbox.correctExtraction.mutationOptions({
      onSuccess: async (result) => {
        setExtractionCorrections((corrections) => {
          const next = { ...corrections };
          delete next[result.inboxItem.id];
          return next;
        });
        await queryClient.invalidateQueries({ queryKey: orpc.inbox.list.queryKey() });
      },
    }),
  );
  const suggestInboxMatchesMutation = useMutation(
    orpc.inbox.suggestMatches.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.inbox.list.queryKey() });
      },
    }),
  );
  const acceptInboxMatchMutation = useMutation(
    orpc.inbox.acceptMatch.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.inbox.list.queryKey() });
        await queryClient.invalidateQueries({ queryKey: orpc.transactionReview.list.queryKey() });
        await transactionSync.refetch();
      },
    }),
  );
  const rejectInboxMatchMutation = useMutation(
    orpc.inbox.rejectMatch.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.inbox.list.queryKey() });
      },
    }),
  );
  const createCustomerMutation = useMutation(
    orpc.billing.createCustomer.mutationOptions({
      onSuccess: async () => {
        setCustomerDraft({ name: "", email: "", contactName: "", contactEmail: "" });
        await queryClient.invalidateQueries({ queryKey: orpc.billing.list.queryKey() });
      },
    }),
  );
  const createProductMutation = useMutation(
    orpc.billing.createProduct.mutationOptions({
      onSuccess: async () => {
        setProductDraft({
          name: "",
          type: "service",
          unitPrice: "",
          currency: "USD",
          taxRate: "0",
        });
        await queryClient.invalidateQueries({ queryKey: orpc.billing.list.queryKey() });
      },
    }),
  );
  const createDraftInvoiceMutation = useMutation(
    orpc.billing.createDraftInvoice.mutationOptions({
      onSuccess: async () => {
        setInvoiceDraft({
          invoiceId: "",
          customerId: "",
          invoiceNumber: "",
          dueDate: "",
          productId: "",
          quantity: "1",
          discountRate: "0",
        });
        await queryClient.invalidateQueries({ queryKey: orpc.billing.list.queryKey() });
      },
    }),
  );
  const updateDraftInvoiceMutation = useMutation(
    orpc.billing.updateDraftInvoice.mutationOptions({
      onSuccess: async () => {
        setInvoiceDraft({
          invoiceId: "",
          customerId: "",
          invoiceNumber: "",
          dueDate: "",
          productId: "",
          quantity: "1",
          discountRate: "0",
        });
        await queryClient.invalidateQueries({ queryKey: orpc.billing.list.queryKey() });
      },
    }),
  );
  const previewInvoicePdfMutation = useMutation({
    mutationFn: (input: { teamId: string; invoiceId: string }) =>
      client.billing.previewInvoicePdf(input),
    onSuccess: (result) => {
      setInvoicePreview({
        invoiceNumber: result.invoice.invoiceNumber,
        fileName: result.pdf.fileName,
        bodyBase64: result.pdf.bodyBase64,
      });
    },
  });
  const sendInvoiceMutation = useMutation(
    orpc.billing.sendInvoice.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.billing.list.queryKey() });
      },
    }),
  );
  const recordInvoicePaymentMutation = useMutation(
    orpc.billing.recordPayment.mutationOptions({
      onSuccess: async () => {
        setInvoiceActionDraft((draft) => ({ ...draft, paymentAmount: "" }));
        await queryClient.invalidateQueries({ queryKey: orpc.billing.list.queryKey() });
      },
    }),
  );
  const createRecurringScheduleMutation = useMutation(
    orpc.billing.createRecurringSchedule.mutationOptions({
      onSuccess: async () => {
        setInvoiceActionDraft((draft) => ({ ...draft, recurringNextRunAt: "" }));
        await queryClient.invalidateQueries({ queryKey: orpc.billing.list.queryKey() });
      },
    }),
  );
  const createProjectMutation = useMutation(
    orpc.projects.createProject.mutationOptions({
      onSuccess: async () => {
        setProjectDraft({ customerId: "", name: "", billableRate: "", currency: "USD" });
        await queryClient.invalidateQueries({ queryKey: orpc.projects.list.queryKey() });
      },
    }),
  );
  const createTimeEntryMutation = useMutation(
    orpc.projects.createTimeEntry.mutationOptions({
      onSuccess: async () => {
        setTimeDraft({
          projectId: "",
          description: "",
          durationMinutes: "",
          billableStatus: "billable",
        });
        await queryClient.invalidateQueries({ queryKey: orpc.projects.list.queryKey() });
      },
    }),
  );
  const createTimeInvoiceMutation = useMutation(
    orpc.projects.createInvoiceFromTimeEntries.mutationOptions({
      onSuccess: async () => {
        setTimeInvoiceDraft({ timeEntryId: "", invoiceNumber: "" });
        await queryClient.invalidateQueries({ queryKey: orpc.projects.list.queryKey() });
        await queryClient.invalidateQueries({ queryKey: orpc.billing.list.queryKey() });
      },
    }),
  );
  const csvCommitMutation = useMutation(
    orpc.csvImport.commit.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: orpc.transactionReview.list.queryKey(),
        });
        await queryClient.invalidateQueries({ queryKey: orpc.ledger.summary.queryKey() });
        await transactionSync.refetch();
      },
    }),
  );
  const assistantAskMutation = useMutation(
    orpc.assistant.ask.mutationOptions({
      onSuccess: async (result) => {
        setAssistantPrompt("");
        setAssistantThreadId(result.thread.id);
        await queryClient.invalidateQueries({ queryKey: orpc.assistant.list.queryKey() });
      },
    }),
  );
  const approveAssistantActionMutation = useMutation(
    orpc.assistant.approveAction.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.assistant.list.queryKey() });
        await queryClient.invalidateQueries({ queryKey: orpc.billing.list.queryKey() });
        await queryClient.invalidateQueries({ queryKey: orpc.transactionReview.list.queryKey() });
        await transactionSync.refetch();
      },
    }),
  );
  const rejectAssistantActionMutation = useMutation(
    orpc.assistant.rejectAction.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.assistant.list.queryKey() });
      },
    }),
  );
  const createAutomationRuleMutation = useMutation(
    orpc.automations.createRule.mutationOptions({
      onSuccess: async () => {
        setAutomationDraft((draft) => ({
          ...draft,
          name: "",
          message: "",
        }));
        await queryClient.invalidateQueries({ queryKey: orpc.automations.list.queryKey() });
      },
    }),
  );

  useEffect(() => {
    if (!teams.data || !selectedTeamId) {
      return;
    }

    const selectedTeamExists = teams.data.teams.some((team) => team.id === selectedTeamId);

    if (!selectedTeamExists) {
      setSelectedTeamId(teams.data.currentTeamId);
      localStorage.setItem("dawn:selected-team-id", teams.data.currentTeamId);
    }
  }, [selectedTeamId, teams.data]);

  useEffect(() => {
    const firstAccountId = ledgerSummary.data?.accounts[0]?.id;

    if (!csvAccountId && firstAccountId) {
      setCsvAccountId(firstAccountId);
    }
  }, [csvAccountId, ledgerSummary.data?.accounts]);

  const hasProSubscription = (customerState?.activeSubscriptions?.length ?? 0) > 0;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {session.data?.user.name ? `${session.data.user.name}'s workspace` : "Workspace"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">
            Plan: {hasProSubscription ? "Pro" : "Free"}
          </p>
          {hasProSubscription ? (
            <Button onClick={async () => await authClient.customer.portal()}>
              Manage Subscription
            </Button>
          ) : (
            <Button onClick={async () => await authClient.checkout({ slug: "pro" })}>
              Upgrade to Pro
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Team context</CardTitle>
          <CardDescription>
            Team memberships resolve the current actor role before application use cases run.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Label className="flex flex-1 flex-col gap-1 text-sm">
              Current team
              <select
                className="h-9 rounded-none border bg-background px-2 text-sm"
                onChange={(event) => {
                  const teamId = event.target.value;
                  setSelectedTeamId(teamId);
                  localStorage.setItem("dawn:selected-team-id", teamId);
                }}
                value={currentTeamId ?? ""}
              >
                {teams.data?.teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name} · {team.role}
                  </option>
                ))}
              </select>
            </Label>
            <Label className="flex flex-1 flex-col gap-1 text-sm">
              New team
              <Input
                onChange={(event) => setNewTeamName(event.target.value)}
                placeholder="Team name"
                value={newTeamName}
              />
            </Label>
            <Button
              disabled={createTeamMutation.isPending || !newTeamName.trim()}
              onClick={() => createTeamMutation.mutate({ name: newTeamName })}
            >
              Create team
            </Button>
          </div>
          {createTeamMutation.error ? (
            <p className="mt-2 text-sm text-destructive">{createTeamMutation.error.message}</p>
          ) : null}
          {transactionReview.data ? (
            <div className="mt-4 grid gap-3 border-t pt-4 md:grid-cols-[1fr_1fr]">
              <div>
                <p className="text-sm font-medium">Resolved access</p>
                <p className="text-sm text-muted-foreground">
                  {currentTeam?.name ?? transactionReview.data.teamName} ·{" "}
                  {transactionReview.data.role}
                </p>
              </div>
              {canManageTeam ? (
                <div className="flex flex-col gap-3">
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                    <Input
                      aria-label="Invite email"
                      onChange={(event) => setInviteEmail(event.target.value)}
                      placeholder="teammate@example.com"
                      value={inviteEmail}
                    />
                    <select
                      aria-label="Invite role"
                      className="h-9 rounded-none border bg-background px-2 text-sm"
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
                        !transactionReview.data.teamId
                      }
                      onClick={() =>
                        inviteTeamMemberMutation.mutate({
                          teamId: transactionReview.data.teamId,
                          email: inviteEmail,
                          role: inviteRole,
                          idempotencyKey: crypto.randomUUID(),
                        })
                      }
                    >
                      Invite
                    </Button>
                  </div>
                  {teamDirectory.data ? (
                    <div className="grid gap-2 text-sm">
                      {teamDirectory.data.members.map((member) => (
                        <div
                          className="grid gap-2 border p-2 sm:grid-cols-[1fr_auto]"
                          key={member.id}
                        >
                          <div>
                            <p className="font-medium">
                              {member.name ?? member.email ?? member.userId}
                            </p>
                            <p className="text-muted-foreground">{member.email ?? member.userId}</p>
                          </div>
                          <select
                            aria-label={`Role for ${member.email ?? member.userId}`}
                            className="h-9 rounded-none border bg-background px-2 text-sm"
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
                      {teamDirectory.data.pendingInvites.map((invite) => (
                        <div className="border p-2" key={invite.id}>
                          <p className="font-medium">{invite.email}</p>
                          <p className="text-muted-foreground">pending · {invite.role}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
          {inviteTeamMemberMutation.error ? (
            <p className="mt-2 text-sm text-destructive">
              {inviteTeamMemberMutation.error.message}
            </p>
          ) : null}
          {updateTeamMemberRoleMutation.error ? (
            <p className="mt-2 text-sm text-destructive">
              {updateTeamMemberRoleMutation.error.message}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Overview</CardTitle>
          <CardDescription>
            Business health is computed from source records, invoices, inbox, and time entries.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {reports.data ? (
            <div className="grid gap-4">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="border p-3">
                  <p className="text-xs text-muted-foreground">Cashflow</p>
                  <p className="text-lg font-semibold">
                    {formatMoney(reports.data.report.cashflow)}
                  </p>
                </div>
                <div className="border p-3">
                  <p className="text-xs text-muted-foreground">Profit</p>
                  <p className="text-lg font-semibold">
                    {formatMoney(reports.data.report.totals.profit)}
                  </p>
                </div>
                <div className="border p-3">
                  <p className="text-xs text-muted-foreground">Unpaid invoices</p>
                  <p className="text-lg font-semibold">
                    {reports.data.report.unpaidInvoices.length}
                  </p>
                </div>
                <div className="border p-3">
                  <p className="text-xs text-muted-foreground">Utilization</p>
                  <p className="text-lg font-semibold">
                    {formatBasisPoints(reports.data.report.timeUtilization.utilizationBasisPoints)}%
                  </p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="grid gap-2 border p-3">
                  <p className="text-sm font-medium">Revenue by customer</p>
                  {reports.data.report.revenueByCustomer.slice(0, 3).map((bucket) => (
                    <div className="flex justify-between gap-3 text-sm" key={bucket.id}>
                      <span>{bucket.label}</span>
                      <span className="font-medium">{formatMoney(bucket.amount)}</span>
                    </div>
                  ))}
                </div>
                <div className="grid gap-2 border p-3">
                  <p className="text-sm font-medium">Expenses by category</p>
                  {reports.data.report.expensesByCategory.slice(0, 3).map((bucket) => (
                    <div className="flex justify-between gap-3 text-sm" key={bucket.id}>
                      <span>{bucket.label}</span>
                      <span className="font-medium">{formatMoney(bucket.amount)}</span>
                    </div>
                  ))}
                </div>
                <div className="grid gap-2 border p-3">
                  <p className="text-sm font-medium">Inbox backlog</p>
                  <p className="text-sm">
                    {reports.data.report.inboxBacklog.pendingExtraction} pending extraction
                  </p>
                  <p className="text-sm">
                    {reports.data.report.inboxBacklog.needsReview} need review
                  </p>
                  <p className="text-sm">
                    {reports.data.report.inboxBacklog.suggestedMatches} suggested matches
                  </p>
                </div>
              </div>

              <div className="grid gap-2">
                <p className="text-sm font-medium">Insights</p>
                {reports.data.insights.length ? (
                  reports.data.insights.slice(0, 3).map((insight) => (
                    <div className="grid gap-2 border p-3 text-sm" key={insight.id}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">{insight.title}</p>
                        <span className="text-xs text-muted-foreground">{insight.severity}</span>
                      </div>
                      <p className="text-muted-foreground">{insight.summary}</p>
                      {insight.sourceRefs.length ? (
                        <div className="flex flex-wrap gap-2">
                          {insight.sourceRefs.slice(0, 5).map((source) => (
                            <a
                              className="text-xs underline"
                              href={sourceHref(source.type)}
                              key={`${source.type}:${source.id}`}
                            >
                              {source.label}
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Weekly insights appear after the scheduled job generates them.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Loading overview...</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Assistant</CardTitle>
          <CardDescription>
            Grounded answers run through permissioned read and suggestion tools.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            <div className="grid gap-2 md:grid-cols-[1fr_auto]">
              <Input
                aria-label="Assistant question"
                onChange={(event) => setAssistantPrompt(event.target.value)}
                placeholder="Ask about cashflow, invoices, documents, projects, or suggestions"
                value={assistantPrompt}
              />
              <Button
                disabled={
                  !currentTeamId || !assistantPrompt.trim() || assistantAskMutation.isPending
                }
                onClick={() => {
                  if (!currentTeamId) {
                    return;
                  }

                  assistantAskMutation.mutate({
                    teamId: currentTeamId,
                    threadId: assistantThreadId,
                    message: assistantPrompt,
                  });
                }}
              >
                Ask
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_220px]">
              <div className="grid gap-3">
                {assistantAskMutation.data ? (
                  assistantAskMutation.data.messages.slice(-2).map((message) => (
                    <div className="grid gap-2 border p-3 text-sm" key={message.id}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium">
                          {message.role === "user" ? "You" : "Dawn assistant"}
                        </p>
                        <span className="text-xs text-muted-foreground">
                          {new Date(message.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap text-muted-foreground">{message.content}</p>
                      {message.sourceRefs.length ? (
                        <div className="flex flex-wrap gap-2">
                          {message.sourceRefs.slice(0, 6).map((source) => (
                            <a
                              className="text-xs underline"
                              href={sourceHref(source.type)}
                              key={`${source.type}:${source.id}`}
                            >
                              {source.label}
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Ask a question to create a persisted assistant thread.
                  </p>
                )}
                {assistantAskMutation.error ? (
                  <p className="text-sm text-destructive">
                    {errorMessage(assistantAskMutation.error)}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-3 border p-3 text-sm">
                <div>
                  <p className="font-medium">Threads</p>
                  <p className="text-muted-foreground">
                    {assistant.data?.threads.length ?? 0} persisted
                  </p>
                </div>
                <div>
                  <p className="font-medium">Tool calls</p>
                  <div className="mt-2 grid gap-1">
                    {assistantAskMutation.data?.toolCalls.slice(-5).map((toolCall) => (
                      <div className="flex items-center justify-between gap-2" key={toolCall.id}>
                        <span className="truncate">{toolCall.toolName}</span>
                        <span className="text-xs text-muted-foreground">{toolCall.risk}</span>
                      </div>
                    )) ?? <p className="text-muted-foreground">No calls yet</p>}
                  </div>
                </div>
                <div>
                  <p className="font-medium">Pending approvals</p>
                  <div className="mt-2 grid gap-2">
                    {assistant.data?.pendingApprovals.length ? (
                      assistant.data.pendingApprovals.slice(0, 3).map((approval) => (
                        <div className="grid gap-2 border p-2" key={approval.id}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate">{approval.toolName}</span>
                            <span className="text-xs text-muted-foreground">{approval.risk}</span>
                          </div>
                          <p className="break-words text-xs text-muted-foreground">
                            {formatApprovalPreview(approval.preview)}
                          </p>
                          <div className="flex gap-2">
                            <Button
                              disabled={approveAssistantActionMutation.isPending}
                              onClick={() => {
                                if (!currentTeamId) {
                                  return;
                                }

                                approveAssistantActionMutation.mutate({
                                  teamId: currentTeamId,
                                  approvalId: approval.id,
                                  idempotencyKey: crypto.randomUUID(),
                                });
                              }}
                            >
                              Approve
                            </Button>
                            <Button
                              disabled={rejectAssistantActionMutation.isPending}
                              onClick={() => {
                                if (!currentTeamId) {
                                  return;
                                }

                                rejectAssistantActionMutation.mutate({
                                  teamId: currentTeamId,
                                  approvalId: approval.id,
                                });
                              }}
                            >
                              Reject
                            </Button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-muted-foreground">No pending approvals</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Automations</CardTitle>
          <CardDescription>
            Event-triggered rules run through the same app use cases, permissions, audit, and outbox
            path.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-3">
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
                className="h-9 border bg-background px-3 text-sm"
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
                className="h-9 border bg-background px-3 text-sm"
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

            <div className="grid gap-3 md:grid-cols-4">
              {automationDraft.actionType === "categorize_transaction" ? (
                <select
                  aria-label="Automation category"
                  className="h-9 border bg-background px-3 text-sm"
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
                    className="h-9 border bg-background px-3 text-sm"
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
                    className="h-9 border bg-background px-3 text-sm"
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
                className="h-9 border bg-background px-3 text-sm"
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
                    trigger: {
                      type: "outbox_event",
                      eventType: automationDraft.triggerEventType,
                    },
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

            {createAutomationRuleMutation.error ? (
              <p className="text-sm text-destructive">
                {errorMessage(createAutomationRuleMutation.error)}
              </p>
            ) : null}

            <div className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-2">
                <p className="text-sm font-medium">Rules</p>
                {automations.data?.rules.length ? (
                  automations.data.rules.slice(0, 4).map((rule) => (
                    <div className="grid gap-1 border p-3 text-sm" key={rule.id}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{rule.name}</span>
                        <span className="text-xs text-muted-foreground">{rule.approvalPolicy}</span>
                      </div>
                      <p className="text-muted-foreground">
                        {rule.trigger.eventType} {"->"} {rule.actionType}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No automation rules yet.</p>
                )}
              </div>
              <div className="grid gap-2">
                <p className="text-sm font-medium">Recent runs</p>
                {automations.data?.recentRuns.length ? (
                  automations.data.recentRuns.slice(0, 4).map((run) => (
                    <div className="grid gap-1 border p-3 text-sm" key={run.id}>
                      <div className="flex items-center justify-between gap-2">
                        <span>{run.actionType}</span>
                        <span className="text-xs text-muted-foreground">{run.status}</span>
                      </div>
                      {run.error ? (
                        <p className="text-xs text-destructive">{run.error}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {new Date(run.startedAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No automation runs yet.</p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {canReadOperations ? (
        <Card id="operations">
          <CardHeader>
            <CardTitle>Operations</CardTitle>
            <CardDescription>
              Trace request, queue, provider, webhook, automation, audit, and data workflow state
              from one team-scoped view.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <OperationMetric label="Queue depth" value={operations.data?.metrics.queueDepth} />
                <OperationMetric label="Failed jobs" value={operations.data?.metrics.failedJobs} />
                <OperationMetric
                  label="Dead letters"
                  value={operations.data?.metrics.deadLetters}
                />
                <OperationMetric
                  label="Provider failures"
                  value={operations.data?.metrics.providerFailures}
                />
                <OperationMetric
                  label="Integration failures"
                  value={operations.data?.metrics.integrationFailures}
                />
                <OperationMetric
                  label="Webhook failures"
                  value={operations.data?.metrics.webhookFailures}
                />
                <OperationMetric
                  label="Automation failures"
                  value={operations.data?.metrics.automationFailures}
                />
                <OperationMetric
                  label="Sync lag"
                  value={formatSyncLag(operations.data?.metrics.syncLagSeconds)}
                />
              </div>

              {operations.data?.requestTrace ? (
                <p className="text-xs text-muted-foreground">
                  Request {operations.data.requestTrace.requestId} ·{" "}
                  {operations.data.requestTrace.actorType} {operations.data.requestTrace.actorId}
                </p>
              ) : null}

              <div className="grid gap-3 lg:grid-cols-3">
                <div className="grid gap-2">
                  <p className="text-sm font-medium">Outbox and jobs</p>
                  {operations.data?.recentOutboxEvents.length ||
                  operations.data?.recentJobRuns.length ? (
                    <div className="grid gap-2">
                      {operations.data?.recentOutboxEvents.slice(0, 4).map((event) => (
                        <div className="grid gap-1 border p-3 text-sm" key={event.id}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate">{event.type}</span>
                            <span className="text-xs text-muted-foreground">{event.status}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {event.dispatchAttempts} attempts ·{" "}
                            {new Date(event.occurredAt).toLocaleString()}
                          </p>
                          {event.lastError ? (
                            <p className="break-words text-xs text-destructive">
                              {event.lastError}
                            </p>
                          ) : null}
                        </div>
                      ))}
                      {operations.data?.recentJobRuns.slice(0, 2).map((run) => (
                        <div className="grid gap-1 border p-3 text-sm" key={run.id}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate">{run.jobType}</span>
                            <span className="text-xs text-muted-foreground">{run.status}</span>
                          </div>
                          {run.error ? (
                            <p className="break-words text-xs text-destructive">{run.error}</p>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              {new Date(run.createdAt).toLocaleString()}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No outbox or job runs yet.</p>
                  )}
                </div>

                <div className="grid gap-2">
                  <p className="text-sm font-medium">Provider activity</p>
                  {operations.data?.recentProviderSyncRuns.length ||
                  operations.data?.recentIntegrationSyncRuns.length ||
                  operations.data?.recentWebhookDeliveries.length ? (
                    <div className="grid gap-2">
                      {operations.data?.recentProviderSyncRuns.slice(0, 2).map((run) => (
                        <OperationRun
                          detail={`${run.transactionsImported} transactions`}
                          error={run.error}
                          key={run.id}
                          label={`Bank ${run.connectionId}`}
                          status={run.status}
                        />
                      ))}
                      {operations.data?.recentIntegrationSyncRuns.slice(0, 2).map((run) => (
                        <OperationRun
                          detail={`${run.recordsSynced} records`}
                          error={run.error}
                          key={run.id}
                          label={`${run.category} · ${run.provider}`}
                          status={run.status}
                        />
                      ))}
                      {operations.data?.recentWebhookDeliveries.slice(0, 2).map((delivery) => (
                        <OperationRun
                          detail={`attempt ${delivery.attempt}`}
                          error={delivery.error}
                          key={delivery.id}
                          label={`Webhook ${delivery.subscriptionId}`}
                          status={delivery.status}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No provider activity yet.</p>
                  )}
                </div>

                <div className="grid gap-2">
                  <p className="text-sm font-medium">Audit and data workflows</p>
                  {operations.data?.auditEvents.length ? (
                    <div className="grid gap-2">
                      {operations.data.auditEvents.slice(0, 3).map((event) => (
                        <div className="grid gap-1 border p-3 text-sm" key={event.id}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate">{event.action}</span>
                            <span className="text-xs text-muted-foreground">
                              {event.entityType}
                            </span>
                          </div>
                          <p className="break-words text-xs text-muted-foreground">
                            {event.requestId} · {event.entityId}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No audit records yet.</p>
                  )}
                  <div className="grid gap-2">
                    {operations.data?.dataWorkflows.map((workflow) => (
                      <div className="grid gap-1 border p-3 text-sm" key={workflow.type}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{workflow.type.replaceAll("_", " ")}</span>
                          <span className="text-xs text-muted-foreground">{workflow.status}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{workflow.nextStep}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {operations.error ? (
                <p className="text-sm text-destructive">{errorMessage(operations.error)}</p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Bank connections</CardTitle>
          <CardDescription>
            Mock provider sync normalizes accounts and transactions through the same ledger,
            duplicate, raw payload, audit, and outbox path real providers will use.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {transactionReview.data ? (
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
                <Button
                  disabled={
                    !canManageBankConnections ||
                    connectMockBankMutation.isPending ||
                    !transactionReview.data.teamId
                  }
                  onClick={() =>
                    connectMockBankMutation.mutate({
                      teamId: transactionReview.data.teamId,
                      idempotencyKey: crypto.randomUUID(),
                    })
                  }
                >
                  Connect mock bank
                </Button>
              </div>
              {banking.data?.connections.map(({ connection, accounts, latestSyncRun }) => (
                <div className="grid gap-3 border p-3" key={connection.id}>
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-medium">{connection.institutionName}</p>
                      <p className="text-sm text-muted-foreground">
                        {connection.provider} · {connection.status}
                        {connection.lastSyncAt ? ` · synced ${connection.lastSyncAt}` : ""}
                      </p>
                    </div>
                    <Button
                      disabled={!canManageBankConnections || syncBankConnectionMutation.isPending}
                      onClick={() =>
                        syncBankConnectionMutation.mutate({
                          teamId: connection.teamId,
                          connectionId: connection.id,
                          idempotencyKey: crypto.randomUUID(),
                        })
                      }
                      variant="outline"
                    >
                      Sync now
                    </Button>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {accounts.map((account) => (
                      <div className="border p-2 text-sm" key={account.id}>
                        <p className="font-medium">{account.name}</p>
                        <p className="text-muted-foreground">
                          {account.providerAccountId} · {account.currency} ·{" "}
                          {formatMoney(account.currentBalance)}
                        </p>
                      </div>
                    ))}
                  </div>
                  {latestSyncRun ? (
                    <p className="text-sm text-muted-foreground">
                      Last run: {latestSyncRun.status} · {latestSyncRun.accountsSynced} accounts ·{" "}
                      {latestSyncRun.transactionsImported} imported · {latestSyncRun.duplicateCount}{" "}
                      duplicates
                    </p>
                  ) : null}
                </div>
              ))}
              {connectMockBankMutation.error ? (
                <p className="text-sm text-destructive">{connectMockBankMutation.error.message}</p>
              ) : null}
              {syncBankConnectionMutation.error ? (
                <p className="text-sm text-destructive">
                  {syncBankConnectionMutation.error.message}
                </p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
          <CardDescription>
            Accounting, payment, messaging, and email adapters expose connection status,
            capabilities, and sync failures behind one provider boundary.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {transactionReview.data ? (
            <div className="grid gap-4">
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                {integrations.data?.providers.map((provider) => {
                  const connected = integrations.data.connections.find(
                    ({ connection }) =>
                      connection.provider === provider.provider && connection.status !== "disabled",
                  );

                  return (
                    <div className="grid gap-2 border p-3 text-sm" key={provider.provider}>
                      <div>
                        <p className="font-medium">{provider.displayName}</p>
                        <p className="text-muted-foreground">{provider.category}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {provider.capabilities.join(", ")}
                      </p>
                      <Button
                        disabled={
                          !canManageIntegrations ||
                          connectIntegrationMutation.isPending ||
                          !transactionReview.data.teamId ||
                          Boolean(connected)
                        }
                        onClick={() =>
                          connectIntegrationMutation.mutate({
                            teamId: transactionReview.data.teamId,
                            provider: provider.provider,
                            idempotencyKey: crypto.randomUUID(),
                          })
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

              <div className="grid gap-2">
                {integrations.data?.connections.length ? (
                  integrations.data.connections.map(({ connection, latestSyncRun }) => (
                    <div className="grid gap-2 border p-3 text-sm" key={connection.id}>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-medium">{connection.displayName}</p>
                          <p className="text-muted-foreground">
                            {connection.provider} · {connection.status} · token{" "}
                            {connection.tokenKeyId}:{connection.tokenLastFour}
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
                      {latestSyncRun ? (
                        <p className="text-xs text-muted-foreground">
                          Last run: {latestSyncRun.status} · {latestSyncRun.recordsSynced} records
                          {latestSyncRun.error ? ` · ${latestSyncRun.error}` : ""}
                        </p>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No integrations connected yet.</p>
                )}
              </div>

              {connectIntegrationMutation.error ? (
                <p className="text-sm text-destructive">
                  {connectIntegrationMutation.error.message}
                </p>
              ) : null}
              {syncIntegrationMutation.error ? (
                <p className="text-sm text-destructive">{syncIntegrationMutation.error.message}</p>
              ) : null}
              {disableIntegrationMutation.error ? (
                <p className="text-sm text-destructive">
                  {disableIntegrationMutation.error.message}
                </p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card id="documents">
        <CardHeader>
          <CardTitle>Documents</CardTitle>
          <CardDescription>
            Team files are prepared through app use cases, stored in R2, and downloaded through
            signed team-scoped URLs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {transactionReview.data ? (
            <div className="grid gap-3">
              <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                <Label className="flex flex-col gap-1 text-sm">
                  Business document
                  <Input
                    type="file"
                    onChange={(event) => setDocumentFile(event.currentTarget.files?.[0] ?? null)}
                  />
                </Label>
                <Button
                  disabled={
                    documentUploadMutation.isPending ||
                    !documentFile ||
                    !transactionReview.data.teamId
                  }
                  onClick={() => {
                    if (!documentFile || !transactionReview.data) {
                      return;
                    }

                    documentUploadMutation.mutate({
                      teamId: transactionReview.data.teamId,
                      file: documentFile,
                    });
                  }}
                >
                  Upload document
                </Button>
              </div>
              {desktopCaptureMessage ? (
                <p className="text-sm text-muted-foreground">{desktopCaptureMessage}</p>
              ) : null}
              <div className="overflow-hidden border">
                {documents.data?.documents.map((document) => (
                  <div
                    className="grid gap-3 border-b p-3 last:border-b-0 md:grid-cols-[1fr_auto_auto] md:items-center"
                    data-desktop-record-id={document.id}
                    data-desktop-record-type="document"
                    key={document.id}
                  >
                    <div>
                      <p className="font-medium">{document.title}</p>
                      <p className="text-muted-foreground">
                        {document.currentVersion?.fileName ?? "Upload pending"} · {document.status}
                        {document.currentVersion
                          ? ` · ${formatBytes(document.currentVersion.byteSize)}`
                          : ""}
                      </p>
                    </div>
                    <p className="font-mono text-xs text-muted-foreground">
                      {new Date(document.updatedAt).toLocaleString()}
                    </p>
                    <Button
                      disabled={
                        document.status !== "uploaded" ||
                        documentDownloadMutation.isPending ||
                        !transactionReview.data.teamId
                      }
                      onClick={() =>
                        documentDownloadMutation.mutate({
                          teamId: transactionReview.data.teamId,
                          documentId: document.id,
                        })
                      }
                      variant="outline"
                    >
                      Download
                    </Button>
                  </div>
                ))}
                {documents.data?.documents.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">No documents uploaded yet.</p>
                ) : null}
              </div>
              {documentUploadMutation.error ? (
                <p className="text-sm text-destructive">{documentUploadMutation.error.message}</p>
              ) : null}
              {documentDownloadMutation.error ? (
                <p className="text-sm text-destructive">{documentDownloadMutation.error.message}</p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card id="inbox">
        <CardHeader>
          <CardTitle>Inbox review</CardTitle>
          <CardDescription>
            Uploaded documents become reviewable inbox items after asynchronous extraction.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {transactionReview.data ? (
            <div className="grid gap-3">
              <div className="overflow-hidden border">
                {inbox.data?.inboxItems.map((item) => {
                  const draft =
                    extractionCorrections[item.id] ??
                    extractionFieldsToCorrectionState(item.latestExtraction?.fields);

                  return (
                    <div
                      className="grid gap-3 border-b p-3 last:border-b-0"
                      data-desktop-record-id={item.id}
                      data-desktop-record-type="inbox_item"
                      key={item.id}
                    >
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-medium">{item.document?.title ?? item.documentId}</p>
                          <p className="text-muted-foreground">
                            {item.sourceType.replace("_", " ")} · {item.status.replace("_", " ")} ·{" "}
                            extraction {item.extractionStatus}
                          </p>
                        </div>
                        <p className="font-mono text-xs text-muted-foreground">
                          {item.latestExtraction
                            ? `v${item.latestExtraction.extractionVersion} · ${item.latestExtraction.source.replace("_", " ")}`
                            : "pending"}
                        </p>
                      </div>
                      <div className="grid gap-2 md:grid-cols-4">
                        <CorrectionInput
                          itemId={item.id}
                          initial={draft}
                          label="Merchant"
                          onChange={setExtractionCorrections}
                          value={draft.merchantName}
                          field="merchantName"
                        />
                        <CorrectionInput
                          itemId={item.id}
                          initial={draft}
                          label="Date"
                          onChange={setExtractionCorrections}
                          value={draft.issuedAt}
                          field="issuedAt"
                        />
                        <CorrectionInput
                          itemId={item.id}
                          initial={draft}
                          label="Amount"
                          onChange={setExtractionCorrections}
                          value={draft.totalAmount}
                          field="totalAmount"
                        />
                        <CorrectionInput
                          itemId={item.id}
                          initial={draft}
                          label="Currency"
                          onChange={setExtractionCorrections}
                          value={draft.currency}
                          field="currency"
                        />
                      </div>
                      {item.latestExtraction ? (
                        <p className="text-xs text-muted-foreground">
                          Confidence: {formatExtractionConfidence(item.latestExtraction.confidence)}
                        </p>
                      ) : null}
                      <div className="grid gap-2">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-sm font-medium">Match suggestions</p>
                          <Button
                            disabled={
                              suggestInboxMatchesMutation.isPending ||
                              !transactionReview.data.teamId ||
                              item.extractionStatus !== "completed"
                            }
                            onClick={() =>
                              suggestInboxMatchesMutation.mutate({
                                teamId: transactionReview.data.teamId,
                                inboxItemId: item.id,
                              })
                            }
                            size="sm"
                            variant="outline"
                          >
                            Find matches
                          </Button>
                        </div>
                        {item.matchSuggestions?.length ? (
                          <div className="grid gap-2">
                            {item.matchSuggestions.map((suggestion) => (
                              <div
                                className="grid gap-2 border p-2 text-sm md:grid-cols-[1fr_auto]"
                                key={suggestion.id}
                              >
                                <div className="grid gap-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-medium">
                                      {suggestion.transaction?.description ??
                                        suggestion.transactionId}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      {formatMatchScore(suggestion.score)} · {suggestion.confidence}{" "}
                                      · {suggestion.status}
                                    </span>
                                  </div>
                                  {suggestion.transaction ? (
                                    <p className="text-muted-foreground">
                                      {formatMoney(suggestion.transaction.money)} ·{" "}
                                      {new Date(
                                        suggestion.transaction.postedAt,
                                      ).toLocaleDateString()}
                                    </p>
                                  ) : null}
                                  <p className="text-xs text-muted-foreground">
                                    {suggestion.explanation.join(" · ")}
                                  </p>
                                </div>
                                <div className="flex items-start justify-end gap-2">
                                  <Button
                                    disabled={
                                      acceptInboxMatchMutation.isPending ||
                                      suggestion.status !== "suggested"
                                    }
                                    onClick={() =>
                                      acceptInboxMatchMutation.mutate({
                                        teamId: transactionReview.data.teamId,
                                        suggestionId: suggestion.id,
                                        idempotencyKey: crypto.randomUUID(),
                                      })
                                    }
                                    size="sm"
                                  >
                                    Accept
                                  </Button>
                                  <Button
                                    disabled={
                                      rejectInboxMatchMutation.isPending ||
                                      suggestion.status !== "suggested"
                                    }
                                    onClick={() =>
                                      rejectInboxMatchMutation.mutate({
                                        teamId: transactionReview.data.teamId,
                                        suggestionId: suggestion.id,
                                        idempotencyKey: crypto.randomUUID(),
                                      })
                                    }
                                    size="sm"
                                    variant="outline"
                                  >
                                    Reject
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            No suggestions generated for this item.
                          </p>
                        )}
                      </div>
                      <div className="flex justify-end">
                        <Button
                          disabled={
                            extractionCorrectionMutation.isPending || !transactionReview.data.teamId
                          }
                          onClick={() =>
                            extractionCorrectionMutation.mutate({
                              teamId: transactionReview.data.teamId,
                              inboxItemId: item.id,
                              fields: correctionStateToExtractionFields(draft),
                              idempotencyKey: crypto.randomUUID(),
                            })
                          }
                          variant="outline"
                        >
                          Save corrections
                        </Button>
                      </div>
                    </div>
                  );
                })}
                {inbox.data?.inboxItems.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">No inbox items yet.</p>
                ) : null}
              </div>
              {extractionCorrectionMutation.error ? (
                <p className="text-sm text-destructive">
                  {extractionCorrectionMutation.error.message}
                </p>
              ) : null}
              {suggestInboxMatchesMutation.error ? (
                <p className="text-sm text-destructive">
                  {suggestInboxMatchesMutation.error.message}
                </p>
              ) : null}
              {acceptInboxMatchMutation.error ? (
                <p className="text-sm text-destructive">{acceptInboxMatchMutation.error.message}</p>
              ) : null}
              {rejectInboxMatchMutation.error ? (
                <p className="text-sm text-destructive">{rejectInboxMatchMutation.error.message}</p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card id="billing">
        <CardHeader>
          <CardTitle>Billing drafts</CardTitle>
          <CardDescription>
            Create customers, reusable products or services, and draft invoices before delivery.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {transactionReview.data ? (
            <div className="grid gap-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="grid gap-2 border p-3">
                  <p className="text-sm font-medium">Customer</p>
                  <Input
                    onChange={(event) =>
                      setCustomerDraft((draft) => ({ ...draft, name: event.target.value }))
                    }
                    placeholder="Customer name"
                    value={customerDraft.name}
                  />
                  <Input
                    onChange={(event) =>
                      setCustomerDraft((draft) => ({ ...draft, email: event.target.value }))
                    }
                    placeholder="Billing email"
                    value={customerDraft.email}
                  />
                  <Input
                    onChange={(event) =>
                      setCustomerDraft((draft) => ({ ...draft, contactName: event.target.value }))
                    }
                    placeholder="Contact name"
                    value={customerDraft.contactName}
                  />
                  <Input
                    onChange={(event) =>
                      setCustomerDraft((draft) => ({ ...draft, contactEmail: event.target.value }))
                    }
                    placeholder="Contact email"
                    value={customerDraft.contactEmail}
                  />
                  <Button
                    disabled={
                      createCustomerMutation.isPending ||
                      !transactionReview.data.teamId ||
                      !customerDraft.name.trim()
                    }
                    onClick={() =>
                      createCustomerMutation.mutate({
                        teamId: transactionReview.data.teamId,
                        name: customerDraft.name,
                        email: customerDraft.email || null,
                        contactName: customerDraft.contactName || null,
                        contactEmail: customerDraft.contactEmail || null,
                        idempotencyKey: crypto.randomUUID(),
                      })
                    }
                    size="sm"
                  >
                    Create customer
                  </Button>
                </div>

                <div className="grid gap-2 border p-3">
                  <p className="text-sm font-medium">Product or service</p>
                  <Input
                    onChange={(event) =>
                      setProductDraft((draft) => ({ ...draft, name: event.target.value }))
                    }
                    placeholder="Name"
                    value={productDraft.name}
                  />
                  <select
                    className="h-9 rounded-none border bg-background px-2 text-sm"
                    onChange={(event) =>
                      setProductDraft((draft) => ({
                        ...draft,
                        type: event.target.value as "product" | "service",
                      }))
                    }
                    value={productDraft.type}
                  >
                    <option value="service">Service</option>
                    <option value="product">Product</option>
                  </select>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Input
                      onChange={(event) =>
                        setProductDraft((draft) => ({ ...draft, unitPrice: event.target.value }))
                      }
                      placeholder="Price"
                      value={productDraft.unitPrice}
                    />
                    <Input
                      onChange={(event) =>
                        setProductDraft((draft) => ({
                          ...draft,
                          currency: event.target.value.toUpperCase(),
                        }))
                      }
                      placeholder="USD"
                      value={productDraft.currency}
                    />
                    <Input
                      onChange={(event) =>
                        setProductDraft((draft) => ({ ...draft, taxRate: event.target.value }))
                      }
                      placeholder="Tax %"
                      value={productDraft.taxRate}
                    />
                  </div>
                  <Button
                    disabled={
                      createProductMutation.isPending ||
                      !transactionReview.data.teamId ||
                      !productDraft.name.trim() ||
                      !productDraft.unitPrice.trim()
                    }
                    onClick={() =>
                      createProductMutation.mutate({
                        teamId: transactionReview.data.teamId,
                        name: productDraft.name,
                        type: productDraft.type,
                        unitPrice: {
                          amountMinor: parseMoneyInputToMinor(productDraft.unitPrice),
                          currency: productDraft.currency.trim().toUpperCase(),
                        },
                        defaultTaxRateBasisPoints: parsePercentToBasisPoints(productDraft.taxRate),
                        idempotencyKey: crypto.randomUUID(),
                      })
                    }
                    size="sm"
                  >
                    Create item
                  </Button>
                </div>

                <div className="grid gap-2 border p-3">
                  <p className="text-sm font-medium">Draft invoice</p>
                  <select
                    className="h-9 rounded-none border bg-background px-2 text-sm"
                    onChange={(event) => {
                      const invoice = billing.data?.draftInvoices.find(
                        (draft) => draft.id === event.target.value,
                      );

                      if (!invoice) {
                        setInvoiceDraft({
                          invoiceId: "",
                          customerId: billing.data?.customers[0]?.id ?? "",
                          invoiceNumber: "",
                          dueDate: "",
                          productId: billing.data?.products[0]?.id ?? "",
                          quantity: "1",
                          discountRate: "0",
                        });
                        return;
                      }

                      setInvoiceDraft({
                        invoiceId: invoice.id,
                        customerId: invoice.customerId,
                        invoiceNumber: invoice.invoiceNumber,
                        dueDate: invoice.dueDate ? invoice.dueDate.slice(0, 10) : "",
                        productId: invoice.lines[0]?.productId ?? "",
                        quantity: formatQuantityMilli(invoice.lines[0]?.quantityMilli ?? 1_000),
                        discountRate: formatBasisPoints(invoice.discountBasisPoints),
                      });
                    }}
                    value={invoiceDraft.invoiceId}
                  >
                    <option value="">New draft</option>
                    {billing.data?.draftInvoices.map((invoice) => (
                      <option key={invoice.id} value={invoice.id}>
                        {invoice.invoiceNumber} · {formatMoney(invoice.totals.total)}
                      </option>
                    ))}
                  </select>
                  <select
                    className="h-9 rounded-none border bg-background px-2 text-sm"
                    onChange={(event) =>
                      setInvoiceDraft((draft) => ({ ...draft, customerId: event.target.value }))
                    }
                    value={invoiceDraft.customerId}
                  >
                    <option value="">Select customer</option>
                    {billing.data?.customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name}
                      </option>
                    ))}
                  </select>
                  <Input
                    onChange={(event) =>
                      setInvoiceDraft((draft) => ({ ...draft, invoiceNumber: event.target.value }))
                    }
                    placeholder="Invoice number"
                    value={invoiceDraft.invoiceNumber}
                  />
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Input
                      onChange={(event) =>
                        setInvoiceDraft((draft) => ({ ...draft, dueDate: event.target.value }))
                      }
                      type="date"
                      value={invoiceDraft.dueDate}
                    />
                    <Input
                      onChange={(event) =>
                        setInvoiceDraft((draft) => ({ ...draft, quantity: event.target.value }))
                      }
                      placeholder="Qty"
                      value={invoiceDraft.quantity}
                    />
                    <Input
                      onChange={(event) =>
                        setInvoiceDraft((draft) => ({
                          ...draft,
                          discountRate: event.target.value,
                        }))
                      }
                      placeholder="Discount %"
                      value={invoiceDraft.discountRate}
                    />
                  </div>
                  <select
                    className="h-9 rounded-none border bg-background px-2 text-sm"
                    onChange={(event) =>
                      setInvoiceDraft((draft) => ({ ...draft, productId: event.target.value }))
                    }
                    value={invoiceDraft.productId}
                  >
                    <option value="">Select product/service</option>
                    {billing.data?.products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} · {formatMoney(product.unitPrice)}
                      </option>
                    ))}
                  </select>
                  <Button
                    disabled={
                      createDraftInvoiceMutation.isPending ||
                      updateDraftInvoiceMutation.isPending ||
                      !transactionReview.data.teamId ||
                      !invoiceDraft.customerId ||
                      !invoiceDraft.invoiceNumber.trim() ||
                      !invoiceDraft.productId
                    }
                    onClick={() => {
                      const product = billing.data?.products.find(
                        (item) => item.id === invoiceDraft.productId,
                      );

                      if (!product) {
                        return;
                      }

                      const payload = {
                        teamId: transactionReview.data.teamId,
                        customerId: invoiceDraft.customerId,
                        invoiceNumber: invoiceDraft.invoiceNumber,
                        issueDate: new Date().toISOString(),
                        dueDate: invoiceDraft.dueDate
                          ? new Date(`${invoiceDraft.dueDate}T00:00:00.000Z`).toISOString()
                          : null,
                        currency: product.unitPrice.currency,
                        discountBasisPoints: parsePercentToBasisPoints(invoiceDraft.discountRate),
                        lines: [
                          {
                            productId: product.id,
                            description: product.name,
                            quantityMilli: parseQuantityToMilli(invoiceDraft.quantity),
                            unitPrice: product.unitPrice,
                            taxRateBasisPoints: product.defaultTaxRateBasisPoints,
                          },
                        ],
                        idempotencyKey: crypto.randomUUID(),
                      };

                      if (invoiceDraft.invoiceId) {
                        updateDraftInvoiceMutation.mutate({
                          ...payload,
                          invoiceId: invoiceDraft.invoiceId,
                        });
                      } else {
                        createDraftInvoiceMutation.mutate(payload);
                      }
                    }}
                    size="sm"
                  >
                    {invoiceDraft.invoiceId ? "Update draft" : "Create draft"}
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 text-sm md:grid-cols-3">
                <p>
                  <span className="font-medium">{billing.data?.customers.length ?? 0}</span>{" "}
                  customers
                </p>
                <p>
                  <span className="font-medium">{billing.data?.products.length ?? 0}</span>{" "}
                  products/services
                </p>
                <p>
                  <span className="font-medium">{billing.data?.draftInvoices.length ?? 0}</span>{" "}
                  draft invoices
                </p>
              </div>
              <div className="grid gap-2">
                <p className="text-sm font-medium">Invoice operations</p>
                {invoicePreview ? (
                  <a
                    className="text-sm underline"
                    download={invoicePreview.fileName}
                    href={`data:application/pdf;base64,${invoicePreview.bodyBase64}`}
                  >
                    Preview {invoicePreview.invoiceNumber} PDF
                  </a>
                ) : null}
                {billing.data?.invoices.length ? (
                  <div className="grid gap-2">
                    {billing.data.invoices.map((invoice) => (
                      <div
                        className="grid gap-2 border p-3 text-sm md:grid-cols-[1fr_auto]"
                        data-desktop-record-id={invoice.id}
                        data-desktop-record-type="invoice"
                        key={invoice.id}
                      >
                        <div>
                          <p className="font-medium">
                            {invoice.invoiceNumber} · {invoice.status}
                          </p>
                          <p className="text-muted-foreground">
                            {formatMoney(invoice.amountPaid)} paid of{" "}
                            {formatMoney(invoice.totals.total)}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            disabled={previewInvoicePdfMutation.isPending}
                            onClick={() =>
                              previewInvoicePdfMutation.mutate({
                                teamId: invoice.teamId,
                                invoiceId: invoice.id,
                              })
                            }
                            size="sm"
                            variant="outline"
                          >
                            Preview PDF
                          </Button>
                          <Button
                            disabled={
                              sendInvoiceMutation.isPending ||
                              (invoice.status !== "draft" && invoice.status !== "scheduled")
                            }
                            onClick={() =>
                              sendInvoiceMutation.mutate({
                                teamId: invoice.teamId,
                                invoiceId: invoice.id,
                                confirm: true,
                                idempotencyKey: crypto.randomUUID(),
                              })
                            }
                            size="sm"
                            variant="outline"
                          >
                            Send
                          </Button>
                        </div>
                        <div className="grid gap-2 md:col-span-2 md:grid-cols-[1fr_auto_1fr_auto]">
                          <Input
                            onChange={(event) =>
                              setInvoiceActionDraft((draft) => ({
                                ...draft,
                                paymentAmount: event.target.value,
                              }))
                            }
                            placeholder="Payment amount"
                            value={invoiceActionDraft.paymentAmount}
                          />
                          <Button
                            disabled={
                              recordInvoicePaymentMutation.isPending ||
                              !invoiceActionDraft.paymentAmount.trim() ||
                              invoice.status === "draft" ||
                              invoice.status === "scheduled" ||
                              invoice.status === "paid" ||
                              invoice.status === "void"
                            }
                            onClick={() =>
                              recordInvoicePaymentMutation.mutate({
                                teamId: invoice.teamId,
                                invoiceId: invoice.id,
                                amount: {
                                  amountMinor: parseMoneyInputToMinor(
                                    invoiceActionDraft.paymentAmount,
                                  ),
                                  currency: invoice.currency,
                                },
                                paidAt: new Date().toISOString(),
                                idempotencyKey: crypto.randomUUID(),
                              })
                            }
                            size="sm"
                          >
                            Record payment
                          </Button>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <select
                              className="h-9 rounded-none border bg-background px-2 text-sm"
                              onChange={(event) =>
                                setInvoiceActionDraft((draft) => ({
                                  ...draft,
                                  recurringFrequency: event.target
                                    .value as typeof draft.recurringFrequency,
                                }))
                              }
                              value={invoiceActionDraft.recurringFrequency}
                            >
                              <option value="weekly">Weekly</option>
                              <option value="monthly">Monthly</option>
                              <option value="quarterly">Quarterly</option>
                              <option value="yearly">Yearly</option>
                            </select>
                            <Input
                              onChange={(event) =>
                                setInvoiceActionDraft((draft) => ({
                                  ...draft,
                                  recurringNextRunAt: event.target.value,
                                }))
                              }
                              type="date"
                              value={invoiceActionDraft.recurringNextRunAt}
                            />
                          </div>
                          <Button
                            disabled={
                              createRecurringScheduleMutation.isPending ||
                              !invoiceActionDraft.recurringNextRunAt
                            }
                            onClick={() =>
                              createRecurringScheduleMutation.mutate({
                                teamId: invoice.teamId,
                                sourceInvoiceId: invoice.id,
                                frequency: invoiceActionDraft.recurringFrequency,
                                nextRunAt: new Date(
                                  `${invoiceActionDraft.recurringNextRunAt}T00:00:00.000Z`,
                                ).toISOString(),
                                idempotencyKey: crypto.randomUUID(),
                              })
                            }
                            size="sm"
                            variant="outline"
                          >
                            Make recurring
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No invoices yet.</p>
                )}
              </div>
              {createCustomerMutation.error ? (
                <p className="text-sm text-destructive">{createCustomerMutation.error.message}</p>
              ) : null}
              {createProductMutation.error ? (
                <p className="text-sm text-destructive">{createProductMutation.error.message}</p>
              ) : null}
              {createDraftInvoiceMutation.error ? (
                <p className="text-sm text-destructive">
                  {createDraftInvoiceMutation.error.message}
                </p>
              ) : null}
              {updateDraftInvoiceMutation.error ? (
                <p className="text-sm text-destructive">
                  {updateDraftInvoiceMutation.error.message}
                </p>
              ) : null}
              {previewInvoicePdfMutation.error ? (
                <p className="text-sm text-destructive">
                  {previewInvoicePdfMutation.error.message}
                </p>
              ) : null}
              {sendInvoiceMutation.error ? (
                <p className="text-sm text-destructive">{sendInvoiceMutation.error.message}</p>
              ) : null}
              {recordInvoicePaymentMutation.error ? (
                <p className="text-sm text-destructive">
                  {recordInvoicePaymentMutation.error.message}
                </p>
              ) : null}
              {createRecurringScheduleMutation.error ? (
                <p className="text-sm text-destructive">
                  {createRecurringScheduleMutation.error.message}
                </p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card id="projects">
        <CardHeader>
          <CardTitle>Projects and time</CardTitle>
          <CardDescription>
            Billable work stays customer-linked and can become invoice draft lines.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {transactionReview.data ? (
            <div className="grid gap-3">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="grid gap-2 border p-3">
                  <p className="text-sm font-medium">Project</p>
                  <select
                    className="h-9 rounded-none border bg-background px-2 text-sm"
                    onChange={(event) =>
                      setProjectDraft((draft) => ({ ...draft, customerId: event.target.value }))
                    }
                    value={projectDraft.customerId}
                  >
                    <option value="">Select customer</option>
                    {billing.data?.customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name}
                      </option>
                    ))}
                  </select>
                  <Input
                    onChange={(event) =>
                      setProjectDraft((draft) => ({ ...draft, name: event.target.value }))
                    }
                    placeholder="Project name"
                    value={projectDraft.name}
                  />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      onChange={(event) =>
                        setProjectDraft((draft) => ({
                          ...draft,
                          billableRate: event.target.value,
                        }))
                      }
                      placeholder="Hourly rate"
                      value={projectDraft.billableRate}
                    />
                    <Input
                      onChange={(event) =>
                        setProjectDraft((draft) => ({
                          ...draft,
                          currency: event.target.value.toUpperCase(),
                        }))
                      }
                      placeholder="USD"
                      value={projectDraft.currency}
                    />
                  </div>
                  <Button
                    disabled={
                      createProjectMutation.isPending ||
                      !transactionReview.data.teamId ||
                      !projectDraft.customerId ||
                      !projectDraft.name.trim() ||
                      !projectDraft.billableRate.trim()
                    }
                    onClick={() =>
                      createProjectMutation.mutate({
                        teamId: transactionReview.data.teamId,
                        customerId: projectDraft.customerId,
                        name: projectDraft.name,
                        billableRate: {
                          amountMinor: parseMoneyInputToMinor(projectDraft.billableRate),
                          currency: projectDraft.currency.trim().toUpperCase(),
                        },
                        idempotencyKey: crypto.randomUUID(),
                      })
                    }
                    size="sm"
                  >
                    Create project
                  </Button>
                </div>

                <div className="grid gap-2 border p-3">
                  <p className="text-sm font-medium">Time entry</p>
                  <select
                    className="h-9 rounded-none border bg-background px-2 text-sm"
                    onChange={(event) =>
                      setTimeDraft((draft) => ({ ...draft, projectId: event.target.value }))
                    }
                    value={timeDraft.projectId}
                  >
                    <option value="">Select project</option>
                    {projects.data?.projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                  <Input
                    onChange={(event) =>
                      setTimeDraft((draft) => ({ ...draft, description: event.target.value }))
                    }
                    placeholder="Work description"
                    value={timeDraft.description}
                  />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      onChange={(event) =>
                        setTimeDraft((draft) => ({
                          ...draft,
                          durationMinutes: event.target.value,
                        }))
                      }
                      placeholder="Minutes"
                      value={timeDraft.durationMinutes}
                    />
                    <select
                      className="h-9 rounded-none border bg-background px-2 text-sm"
                      onChange={(event) =>
                        setTimeDraft((draft) => ({
                          ...draft,
                          billableStatus: event.target.value as typeof draft.billableStatus,
                        }))
                      }
                      value={timeDraft.billableStatus}
                    >
                      <option value="billable">Billable</option>
                      <option value="non_billable">Non-billable</option>
                    </select>
                  </div>
                  <Button
                    disabled={
                      createTimeEntryMutation.isPending ||
                      !transactionReview.data.teamId ||
                      !timeDraft.projectId ||
                      !timeDraft.description.trim() ||
                      !timeDraft.durationMinutes.trim()
                    }
                    onClick={() =>
                      createTimeEntryMutation.mutate({
                        teamId: transactionReview.data.teamId,
                        projectId: timeDraft.projectId,
                        description: timeDraft.description,
                        occurredOn: new Date().toISOString(),
                        durationMinutes: Number.parseInt(timeDraft.durationMinutes, 10),
                        billableStatus: timeDraft.billableStatus,
                        idempotencyKey: crypto.randomUUID(),
                      })
                    }
                    size="sm"
                  >
                    Track time
                  </Button>
                </div>

                <div className="grid gap-2 border p-3">
                  <p className="text-sm font-medium">Invoice time</p>
                  <select
                    className="h-9 rounded-none border bg-background px-2 text-sm"
                    onChange={(event) =>
                      setTimeInvoiceDraft((draft) => ({
                        ...draft,
                        timeEntryId: event.target.value,
                      }))
                    }
                    value={timeInvoiceDraft.timeEntryId}
                  >
                    <option value="">Select billable time</option>
                    {projects.data?.timeEntries
                      .filter((entry) => entry.billableStatus === "billable")
                      .map((entry) => {
                        const project = projects.data?.projects.find(
                          (item) => item.id === entry.projectId,
                        );

                        return (
                          <option key={entry.id} value={entry.id}>
                            {project?.name ?? "Project"} · {entry.durationMinutes}m
                          </option>
                        );
                      })}
                  </select>
                  <Input
                    onChange={(event) =>
                      setTimeInvoiceDraft((draft) => ({
                        ...draft,
                        invoiceNumber: event.target.value,
                      }))
                    }
                    placeholder="Invoice number"
                    value={timeInvoiceDraft.invoiceNumber}
                  />
                  <Button
                    disabled={
                      createTimeInvoiceMutation.isPending ||
                      !transactionReview.data.teamId ||
                      !timeInvoiceDraft.timeEntryId ||
                      !timeInvoiceDraft.invoiceNumber.trim()
                    }
                    onClick={() => {
                      const entry = projects.data?.timeEntries.find(
                        (item) => item.id === timeInvoiceDraft.timeEntryId,
                      );
                      const project = projects.data?.projects.find(
                        (item) => item.id === entry?.projectId,
                      );

                      if (!entry || !project) {
                        return;
                      }

                      createTimeInvoiceMutation.mutate({
                        teamId: transactionReview.data.teamId,
                        customerId: project.customerId,
                        invoiceNumber: timeInvoiceDraft.invoiceNumber,
                        issueDate: new Date().toISOString(),
                        timeEntryIds: [entry.id],
                        idempotencyKey: crypto.randomUUID(),
                      });
                    }}
                    size="sm"
                    variant="outline"
                  >
                    Create invoice draft
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 text-sm md:grid-cols-4">
                <p>
                  <span className="font-medium">{projects.data?.projects.length ?? 0}</span>{" "}
                  projects
                </p>
                <p>
                  <span className="font-medium">{projects.data?.report.totalMinutes ?? 0}</span>{" "}
                  tracked minutes
                </p>
                <p>
                  <span className="font-medium">{projects.data?.report.billableMinutes ?? 0}</span>{" "}
                  billable minutes
                </p>
                <p>
                  <span className="font-medium">
                    {formatMoney(
                      projects.data?.report.billableValue ?? { amountMinor: 0, currency: "USD" },
                    )}
                  </span>{" "}
                  billable value
                </p>
              </div>

              {projects.data?.timeEntries.length ? (
                <div className="grid gap-2 text-sm">
                  {projects.data.timeEntries.slice(0, 5).map((entry) => {
                    const project = projects.data.projects.find(
                      (item) => item.id === entry.projectId,
                    );

                    return (
                      <div
                        className="flex items-center justify-between gap-3 border p-2"
                        key={entry.id}
                      >
                        <span>
                          {project?.name ?? "Project"} · {entry.description}
                        </span>
                        <span className="text-muted-foreground">
                          {entry.durationMinutes}m · {entry.billableStatus}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {createProjectMutation.error ? (
                <p className="text-sm text-destructive">{createProjectMutation.error.message}</p>
              ) : null}
              {createTimeEntryMutation.error ? (
                <p className="text-sm text-destructive">{createTimeEntryMutation.error.message}</p>
              ) : null}
              {createTimeInvoiceMutation.error ? (
                <p className="text-sm text-destructive">
                  {createTimeInvoiceMutation.error.message}
                </p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>CSV transaction import</CardTitle>
          <CardDescription>
            Imported rows use the same ledger normalization, duplicate detection, audit, and outbox
            path as provider transactions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {transactionReview.data ? (
            <div className="grid gap-3">
              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <Label className="flex flex-col gap-1 text-sm">
                  CSV file
                  <Input
                    accept=".csv,text/csv"
                    type="file"
                    onChange={async (event) => {
                      const file = event.currentTarget.files?.[0];

                      if (!file) {
                        return;
                      }

                      setCsvFileName(file.name);
                      setCsvText(await file.text());
                      csvPreviewMutation.reset();
                      csvCommitMutation.reset();
                    }}
                  />
                </Label>
                <Label className="flex flex-col gap-1 text-sm">
                  Account
                  <select
                    className="h-8 min-w-40 rounded-none border bg-background px-2 text-xs"
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
              <div className="grid gap-2 md:grid-cols-5">
                <Label className="flex flex-col gap-1 text-sm">
                  Date column
                  <Input
                    onChange={(event) =>
                      setCsvMapping((mapping) => ({ ...mapping, postedAt: event.target.value }))
                    }
                    value={csvMapping.postedAt}
                  />
                </Label>
                <Label className="flex flex-col gap-1 text-sm">
                  Description column
                  <Input
                    onChange={(event) =>
                      setCsvMapping((mapping) => ({
                        ...mapping,
                        description: event.target.value,
                      }))
                    }
                    value={csvMapping.description}
                  />
                </Label>
                <Label className="flex flex-col gap-1 text-sm">
                  Amount column
                  <Input
                    onChange={(event) =>
                      setCsvMapping((mapping) => ({ ...mapping, amount: event.target.value }))
                    }
                    value={csvMapping.amount}
                  />
                </Label>
                <Label className="flex flex-col gap-1 text-sm">
                  Currency column
                  <Input
                    onChange={(event) =>
                      setCsvMapping((mapping) => ({ ...mapping, currency: event.target.value }))
                    }
                    placeholder="Optional"
                    value={csvMapping.currency}
                  />
                </Label>
                <Label className="flex flex-col gap-1 text-sm">
                  Category
                  <select
                    className="h-8 rounded-none border bg-background px-2 text-xs"
                    onChange={(event) =>
                      setCsvMapping((mapping) => ({ ...mapping, categoryId: event.target.value }))
                    }
                    value={csvMapping.categoryId}
                  >
                    <option value="">Uncategorized</option>
                    {transactionReview.data.categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </Label>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={!canImportCsv(csvText, csvAccountId, csvMapping)}
                  onClick={() => {
                    if (!transactionReview.data) {
                      return;
                    }

                    csvPreviewMutation.mutate({
                      teamId: transactionReview.data.teamId,
                      accountId: csvAccountId,
                      csvText,
                      mapping: normalizedCsvMapping(csvMapping),
                    });
                  }}
                  variant="outline"
                >
                  Preview import
                </Button>
                <Button
                  disabled={
                    csvCommitMutation.isPending ||
                    !transactionReview.data.teamId ||
                    (csvPreviewMutation.data?.readyCount ?? 0) === 0
                  }
                  onClick={() => {
                    if (!transactionReview.data) {
                      return;
                    }

                    csvCommitMutation.mutate({
                      teamId: transactionReview.data.teamId,
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
              {csvPreviewMutation.data ? (
                <CsvImportPreview preview={csvPreviewMutation.data} />
              ) : null}
              {csvCommitMutation.data ? (
                <p className="text-sm text-muted-foreground">
                  Imported {csvCommitMutation.data.importSession.importedCount} transactions.
                </p>
              ) : null}
              {csvPreviewMutation.error ? (
                <p className="text-sm text-destructive">{csvPreviewMutation.error.message}</p>
              ) : null}
              {csvCommitMutation.error ? (
                <p className="text-sm text-destructive">{csvCommitMutation.error.message}</p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card id="transactions">
        <CardHeader>
          <CardTitle>Transaction review tracer</CardTitle>
          <CardDescription>
            Team-scoped transaction review powered by API → app use case → domain rule → Postgres
            persistence, audit, and outbox.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {transactionReview.isLoading ? <p>Loading transactions…</p> : null}
          {transactionReview.data ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{transactionReview.data.teamName}</span>
                <span className="text-muted-foreground">
                  Sync: {transactionReview.data.sync.collection} ·{" "}
                  {transactionReview.data.sync.conflictPolicy} · {transactionSync.status} ·{" "}
                  {transactionSync.realtimeStatus}
                </span>
              </div>
              <div className="overflow-hidden border">
                {visibleTransactions.map((transaction) => (
                  <TransactionReviewRow
                    key={transaction.id}
                    categories={transactionReview.data.categories}
                    disabled={reviewMutation.isPending || syncReviewingId === transaction.id}
                    onReview={async (categoryId) => {
                      const syncedRecord =
                        transactionSync.collection?.get(transaction.id) ?? transaction;

                      if (isTransactionSyncRecord(syncedRecord)) {
                        setSyncReviewError(null);
                        setSyncReviewingId(transaction.id);

                        try {
                          await transactionSync.reviewTransaction(syncedRecord, categoryId);
                          await queryClient.invalidateQueries({
                            queryKey: orpc.ledger.summary.queryKey(),
                          });
                        } catch (error) {
                          setSyncReviewError(errorMessage(error));
                          await transactionSync.refetch();
                        } finally {
                          setSyncReviewingId(null);
                        }

                        return;
                      }

                      reviewMutation.mutate({
                        transactionId: transaction.id,
                        categoryId,
                        idempotencyKey: crypto.randomUUID(),
                        teamId: transactionReview.data.teamId,
                      });
                    }}
                    transaction={transaction}
                  />
                ))}
              </div>
              {syncReviewError ? (
                <p className="text-sm text-destructive">{syncReviewError}</p>
              ) : null}
              {reviewMutation.error ? (
                <p className="text-sm text-destructive">{reviewMutation.error.message}</p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

const teamInviteRoles = ["admin", "member", "accountant", "viewer"] as const;
type TeamInviteRole = (typeof teamInviteRoles)[number];

type CsvImportMappingState = {
  postedAt: string;
  description: string;
  amount: string;
  currency: string;
  categoryId: string;
};

type CsvImportPreviewData = {
  totalRows: number;
  readyCount: number;
  duplicateCount: number;
  invalidCount: number;
  rows: {
    rowNumber: number;
    status: "ready" | "duplicate" | "invalid";
    errors: string[];
    values: Record<string, string>;
  }[];
};

type ExtractionCorrectionState = {
  merchantName: string;
  issuedAt: string;
  totalAmount: string;
  currency: string;
};

type ExtractionCorrectionField = keyof ExtractionCorrectionState;

function canImportCsv(csvText: string, accountId: string, mapping: CsvImportMappingState) {
  return (
    csvText.trim().length > 0 &&
    accountId.length > 0 &&
    mapping.postedAt.trim().length > 0 &&
    mapping.description.trim().length > 0 &&
    mapping.amount.trim().length > 0
  );
}

function normalizedCsvMapping(mapping: CsvImportMappingState) {
  return {
    postedAt: mapping.postedAt.trim(),
    description: mapping.description.trim(),
    amount: mapping.amount.trim(),
    currency: mapping.currency.trim() || null,
    categoryId: mapping.categoryId || null,
  };
}

function extractionFieldsToCorrectionState(
  fields?: {
    merchantName?: string | null;
    issuedAt?: string | null;
    totalAmountMinor?: number | null;
    currency?: string | null;
  } | null,
): ExtractionCorrectionState {
  return {
    merchantName: fields?.merchantName ?? "",
    issuedAt: fields?.issuedAt ?? "",
    totalAmount:
      typeof fields?.totalAmountMinor === "number"
        ? (fields.totalAmountMinor / 100).toFixed(2)
        : "",
    currency: fields?.currency ?? "",
  };
}

function correctionStateToExtractionFields(state: ExtractionCorrectionState) {
  return {
    merchantName: state.merchantName.trim() || null,
    issuedAt: state.issuedAt.trim() || null,
    totalAmountMinor: decimalInputToMinor(state.totalAmount),
    currency: state.currency.trim().toUpperCase() || null,
  };
}

function decimalInputToMinor(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const [major = "0", minor = ""] = trimmed.replace(",", ".").split(".");
  const sign = major.startsWith("-") ? -1 : 1;
  const majorDigits = major.replace(/[^0-9]/g, "");
  const minorDigits = minor
    .replace(/[^0-9]/g, "")
    .padEnd(2, "0")
    .slice(0, 2);

  return sign * (Number(majorDigits || "0") * 100 + Number(minorDigits || "0"));
}

function formatExtractionConfidence(confidence: Record<string, number | undefined>) {
  const entries = Object.entries(confidence).filter(([, value]) => typeof value === "number");

  if (entries.length === 0) {
    return "none";
  }

  return entries.map(([key, value]) => `${key}: ${Math.round((value ?? 0) * 100)}%`).join(" · ");
}

function formatBytes(byteSize: number) {
  if (byteSize < 1024) {
    return `${byteSize} B`;
  }

  if (byteSize < 1024 * 1024) {
    return `${(byteSize / 1024).toFixed(1)} KB`;
  }

  return `${(byteSize / (1024 * 1024)).toFixed(1)} MB`;
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

function CorrectionInput({
  field,
  initial,
  itemId,
  label,
  onChange,
  value,
}: {
  field: ExtractionCorrectionField;
  initial: ExtractionCorrectionState;
  itemId: string;
  label: string;
  onChange: Dispatch<SetStateAction<Record<string, ExtractionCorrectionState>>>;
  value: string;
}) {
  return (
    <Label className="flex flex-col gap-1 text-sm">
      {label}
      <Input
        onChange={(event) =>
          onChange((corrections) => ({
            ...corrections,
            [itemId]: {
              ...(corrections[itemId] ?? initial),
              [field]: event.target.value,
            },
          }))
        }
        value={value}
      />
    </Label>
  );
}

function CsvImportPreview({ preview }: { preview: CsvImportPreviewData }) {
  return (
    <div className="grid gap-2 border p-3">
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
      <div className="max-h-64 overflow-auto border">
        {preview.rows.slice(0, 25).map((row) => (
          <div
            className="grid gap-2 border-b p-2 text-sm last:border-b-0 md:grid-cols-[auto_auto_1fr]"
            key={row.rowNumber}
          >
            <span className="font-mono text-xs">#{row.rowNumber}</span>
            <span className="capitalize text-muted-foreground">{row.status}</span>
            <span>
              {row.errors.length > 0
                ? row.errors.join(", ")
                : `${row.values.Description ?? row.values.description ?? "transaction"} · ${
                    row.values.Amount ?? row.values.amount ?? ""
                  }`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function OperationMetric({ label, value }: { label: string; value?: number | string | null }) {
  return (
    <div className="grid gap-1 border p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono text-lg">{value ?? "..."}</span>
    </div>
  );
}

function OperationRun({
  detail,
  error,
  label,
  status,
}: {
  detail: string;
  error?: string | null;
  label: string;
  status: string;
}) {
  return (
    <div className="grid gap-1 border p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate">{label}</span>
        <span className="text-xs text-muted-foreground">{status}</span>
      </div>
      {error ? (
        <p className="break-words text-xs text-destructive">{error}</p>
      ) : (
        <p className="text-xs text-muted-foreground">{detail}</p>
      )}
    </div>
  );
}

type TransactionReviewRowProps = {
  categories: { id: string; name: string }[];
  disabled: boolean;
  onReview: (categoryId: string) => void | Promise<void>;
  transaction: {
    id: string;
    description: string;
    postedAt: string;
    money: Money;
    categoryId: string | null;
    reviewState: "needs_review" | "reviewed";
    updatedAt?: string | null;
  };
};

function TransactionReviewRow({
  categories,
  disabled,
  onReview,
  transaction,
}: TransactionReviewRowProps) {
  const [categoryId, setCategoryId] = useState(transaction.categoryId ?? categories[0]?.id ?? "");
  const selectedCategory = categories.find((category) => category.id === transaction.categoryId);
  const canReview = transaction.reviewState !== "reviewed" && categoryId.length > 0;

  return (
    <div
      className="grid gap-3 border-b p-3 last:border-b-0 md:grid-cols-[1fr_auto_auto_auto] md:items-center"
      data-desktop-record-id={transaction.id}
      data-desktop-record-type="transaction"
    >
      <div>
        <p className="font-medium">{transaction.description}</p>
        <p className="text-muted-foreground">
          {new Date(transaction.postedAt).toLocaleDateString()} ·{" "}
          {selectedCategory?.name ?? "Uncategorized"}
        </p>
      </div>
      <p className="font-mono text-sm">{formatMoney(transaction.money)}</p>
      <span className="text-sm capitalize text-muted-foreground">
        {transaction.reviewState.replace("_", " ")}
      </span>
      <div className="flex gap-2">
        <select
          className="h-9 rounded-none border bg-background px-2 text-sm"
          disabled={disabled || transaction.reviewState === "reviewed"}
          onChange={(event) => setCategoryId(event.target.value)}
          value={categoryId}
        >
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <Button disabled={disabled || !canReview} onClick={() => void onReview(categoryId)}>
          Review
        </Button>
      </div>
    </div>
  );
}

function isTransactionSyncRecord(transaction: {
  updatedAt?: string | null;
}): transaction is TransactionSyncRecord {
  return typeof transaction.updatedAt === "string" && transaction.updatedAt.length > 0;
}

function formatMatchScore(score: number) {
  return `${Math.round(score * 100)}%`;
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

function parseQuantityToMilli(value: string) {
  const normalized = value.trim();
  const match = /^(\d+)(?:\.(\d{0,3}))?$/.exec(normalized);

  if (!match) {
    throw new Error("Quantity is invalid");
  }

  return (
    Number.parseInt(match[1] ?? "0", 10) * 1_000 +
    Number.parseInt((match[2] ?? "").padEnd(3, "0"), 10)
  );
}

function parsePercentToBasisPoints(value: string) {
  const normalized = value.trim() || "0";
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(normalized);

  if (!match) {
    throw new Error("Percentage is invalid");
  }

  return (
    Number.parseInt(match[1] ?? "0", 10) * 100 +
    Number.parseInt((match[2] ?? "").padEnd(2, "0"), 10)
  );
}

function formatQuantityMilli(quantityMilli: number) {
  const whole = Math.trunc(quantityMilli / 1_000);
  const fraction = `${quantityMilli % 1_000}`.padStart(3, "0").replace(/0+$/, "");

  return fraction ? `${whole}.${fraction}` : `${whole}`;
}

function formatBasisPoints(basisPoints: number) {
  const whole = Math.trunc(basisPoints / 100);
  const fraction = `${basisPoints % 100}`.padStart(2, "0").replace(/0+$/, "");

  return fraction ? `${whole}.${fraction}` : `${whole}`;
}

function sourceHref(type: string) {
  if (type === "transaction") {
    return "#transactions";
  }

  if (type === "invoice" || type === "customer" || type === "product") {
    return "#billing";
  }

  if (type === "document") {
    return "#documents";
  }

  if (type === "project" || type === "time_entry") {
    return "#projects";
  }

  if (type === "inbox_item") {
    return "#inbox";
  }

  return "#";
}

type DesktopCapturePayload = {
  fileName: string;
  contentType: string;
  bodyBase64: string;
  byteSize: number;
  teamId?: string | null;
};

function desktopCapturePayload(event: Event): DesktopCapturePayload | null {
  const detail = (event as CustomEvent<unknown>).detail;

  if (
    !detail ||
    typeof detail !== "object" ||
    typeof (detail as DesktopCapturePayload).fileName !== "string" ||
    typeof (detail as DesktopCapturePayload).contentType !== "string" ||
    typeof (detail as DesktopCapturePayload).bodyBase64 !== "string" ||
    typeof (detail as DesktopCapturePayload).byteSize !== "number"
  ) {
    return null;
  }

  return detail as DesktopCapturePayload;
}

function fileFromDesktopCapture(payload: DesktopCapturePayload) {
  const binary = atob(payload.bodyBase64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new File([bytes], payload.fileName, { type: payload.contentType });
}

function formatApprovalPreview(preview: Record<string, unknown>) {
  const values = Object.values(preview)
    .filter((value) => typeof value === "string" || typeof value === "number")
    .slice(0, 3);

  return values.length ? values.join(" · ") : "Review action details before approving.";
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
  return error instanceof Error ? error.message : "Transaction review failed";
}
