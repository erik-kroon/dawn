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
import { useEffect, useMemo, useState } from "react";

import { authClient } from "@/lib/auth-client";
import { useTransactionSync } from "@/sync/transactions";
import { orpc } from "@/utils/orpc";

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
  const [syncReviewError, setSyncReviewError] = useState<string | null>(null);
  const [syncReviewingId, setSyncReviewingId] = useState<string | null>(null);

  const teams = useQuery(orpc.teams.list.queryOptions({ input: { teamId: selectedTeamId } }));
  const currentTeamId = selectedTeamId ?? teams.data?.currentTeamId;
  const currentTeam = teams.data?.teams.find((team) => team.id === currentTeamId);
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

      <Card>
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
                  {transactionReview.data.sync.conflictPolicy} · {transactionSync.status}
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
    <div className="grid gap-3 border-b p-3 last:border-b-0 md:grid-cols-[1fr_auto_auto_auto] md:items-center">
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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Transaction review failed";
}
