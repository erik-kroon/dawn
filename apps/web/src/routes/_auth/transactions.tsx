import { Button } from "@dawn/ui/components/button";
import { Badge } from "@dawn/ui/components/badge";
import { Checkbox } from "@dawn/ui/components/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@dawn/ui/components/dropdown-menu";
import { Input } from "@dawn/ui/components/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@dawn/ui/components/table";
import { formatMoney, type Transaction, type TransactionAccountantStatus } from "@dawn/domain";
import type { TransactionSyncRecord } from "@dawn/sync";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  CheckIcon,
  ChevronDownIcon,
  DownloadIcon,
  ListFilterIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useTransactionSync } from "@/sync/transactions";
import { orpc } from "@/utils/orpc";

import { ensureCurrentTeam, optionalStringSearchParam } from "../-team-routing";
import { requireParkedSurfaceFlag } from "./-parked-surface";

type TransactionTab = "all" | "review";
type TransactionQueueFilter =
  | "queue"
  | "ready"
  | "missing_receipt"
  | "export_failed"
  | "exported"
  | "excluded"
  | "archived";
type UpdateTransactionAccountantStatusAction =
  | "exclude"
  | "archive"
  | "unarchive"
  | "mark_exporting"
  | "mark_exported"
  | "mark_export_failed"
  | "retry_export";
type QueueBadgeVariant =
  | "default"
  | "secondary"
  | "outline"
  | "success"
  | "warning"
  | "destructive";

type TransactionsSearch = {
  q?: string;
  tab?: TransactionTab;
  status?: TransactionQueueFilter;
};

type AccountantPacketExportSummary = {
  fileName: string;
  transactionCount: number;
  attachmentCount: number;
  skippedAttachmentCount: number;
  formats: string[];
  csvDelimiter: string;
  from: string | null;
  to: string | null;
};

type AccountantPacketPeriodDraft = {
  selectionKey: string;
  from: string;
  to: string;
};

const transactionQueueFilters = [
  { value: "queue", label: "Queue" },
  { value: "ready", label: "Ready" },
  { value: "missing_receipt", label: "Missing receipt" },
  { value: "export_failed", label: "Failed" },
  { value: "exported", label: "Exported" },
  { value: "excluded", label: "Excluded" },
  { value: "archived", label: "Archived" },
] as const satisfies readonly { value: TransactionQueueFilter; label: string }[];

const defaultQueueStatuses = new Set<TransactionAccountantStatus>([
  "needs_review",
  "receipt_found",
  "missing_receipt",
  "ready_to_export",
  "exporting",
  "export_failed",
]);

const queueFilterStatus: Record<
  Exclude<TransactionQueueFilter, "queue" | "ready">,
  TransactionAccountantStatus
> = {
  missing_receipt: "missing_receipt",
  export_failed: "export_failed",
  exported: "exported",
  excluded: "excluded",
  archived: "archived",
};

export const Route = createFileRoute("/_auth/transactions")({
  component: TransactionsRoute,
  validateSearch: (search: Record<string, unknown>): TransactionsSearch => ({
    q: optionalStringSearchParam(search.q),
    tab: search.tab === "all" || search.tab === "review" ? search.tab : undefined,
    status: isTransactionQueueFilter(search.status) ? search.status : undefined,
  }),
  loaderDeps: ({ search }) => ({ teamId: search.teamId }),
  loader: async ({ context, deps }) => {
    requireParkedSurfaceFlag(deps.teamId);
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
    meta: [{ title: "Transactions | Dawn" }],
  }),
});

const categorySwatches = [
  "bg-lime-300",
  "bg-blue-500",
  "bg-orange-400",
  "bg-cyan-300",
  "bg-emerald-400",
  "bg-red-400",
  "bg-zinc-500",
] as const;

function TransactionsRoute() {
  const { currentTeamId } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();
  const query = search.q ?? "";
  const tab = search.tab ?? "review";
  const statusFilter = search.status ?? "queue";
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [categoryDrafts, setCategoryDrafts] = useState<Record<string, string>>({});
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [packetPeriodDraft, setPacketPeriodDraft] = useState<AccountantPacketPeriodDraft>({
    selectionKey: "",
    from: "",
    to: "",
  });
  const [lastExportSummary, setLastExportSummary] = useState<AccountantPacketExportSummary | null>(
    null,
  );

  const teams = useQuery(orpc.teams.list.queryOptions({ input: { teamId: currentTeamId } }));
  const transactionSync = useTransactionSync(currentTeamId);
  const transactionReview = useQuery(
    orpc.transactionReview.list.queryOptions({ input: { teamId: currentTeamId } }),
  );
  const reviewMutation = useMutation(
    orpc.transactionReview.review.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: orpc.transactionReview.list.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: orpc.ledger.summary.queryKey(),
        });
        await transactionSync.refetch();
      },
    }),
  );
  const exportMutation = useMutation(orpc.transactionReview.exportPacket.mutationOptions());
  const accountantStatusMutation = useMutation(
    orpc.transactionReview.updateAccountantStatus.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: orpc.transactionReview.list.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: orpc.ledger.summary.queryKey(),
        });
        await transactionSync.refetch();
      },
    }),
  );

  function updateSearch(next: TransactionsSearch) {
    void navigate({
      replace: true,
      search: (previous) => ({
        ...previous,
        ...next,
      }),
    });
  }

  const syncedTransactions = useMemo(
    () =>
      [...transactionSync.transactions].sort(
        (left, right) =>
          new Date(right.postedAt).getTime() - new Date(left.postedAt).getTime() ||
          new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
      ),
    [transactionSync.transactions],
  );

  const transactions =
    syncedTransactions.length > 0 || transactionSync.isReady
      ? syncedTransactions
      : (transactionReview.data?.transactions ?? []);
  const categories = transactionReview.data?.categories ?? [];
  const queueCounts = useMemo(() => createQueueCounts(transactions), [transactions]);
  const monthLabel = monthChip(transactions[0]?.postedAt);

  const visibleTransactions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return transactions.filter((transaction) => {
      if (tab === "review" && !transactionMatchesQueueFilter(transaction, statusFilter)) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const category = categories.find((item) => item.id === transaction.categoryId);
      return [
        transaction.description,
        transaction.providerTransactionId,
        category?.name,
        accountantStatusLabel(accountantStatusFor(transaction)),
        formatMoney(transaction.money),
        formatDate(transaction.postedAt),
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalizedQuery));
    });
  }, [categories, query, statusFilter, tab, transactions]);
  const selectedTransactions = useMemo(
    () => transactions.filter((transaction) => selectedTransactionIds.has(transaction.id)),
    [selectedTransactionIds, transactions],
  );
  const selectedReadyTransactions = useMemo(
    () =>
      selectedTransactions.filter(
        (transaction) => accountantStatusFor(transaction) === "ready_to_export",
      ),
    [selectedTransactions],
  );
  const selectedReadyTransactionKey = useMemo(
    () =>
      selectedReadyTransactions
        .map((transaction) => transaction.id)
        .sort()
        .join("|"),
    [selectedReadyTransactions],
  );
  const selectedReadyPeriodDefaults = useMemo(
    () => dateInputRangeForTransactions(selectedReadyTransactions),
    [selectedReadyTransactions],
  );
  const selectedNonReadyTransactionCount =
    selectedTransactionIds.size - selectedReadyTransactions.length;
  const selectedReadyDateRange = useMemo(
    () => dateRangeLabelForTransactions(selectedReadyTransactions),
    [selectedReadyTransactions],
  );
  const packetPeriodFromIso = dateInputToUtcStart(packetPeriodDraft.from);
  const packetPeriodToIso = dateInputToUtcEnd(packetPeriodDraft.to);
  const hasValidPacketPeriod =
    packetPeriodFromIso !== null &&
    packetPeriodToIso !== null &&
    Date.parse(packetPeriodFromIso) <= Date.parse(packetPeriodToIso);
  const selectedReadyTransactionsWithinPacketPeriod =
    packetPeriodFromIso !== null &&
    packetPeriodToIso !== null &&
    transactionsAreWithinDateRange(
      selectedReadyTransactions,
      packetPeriodFromIso,
      packetPeriodToIso,
    );
  const canExportSelectedTransactions =
    selectedReadyTransactions.length > 0 &&
    selectedReadyTransactions.length === selectedTransactionIds.size &&
    hasValidPacketPeriod &&
    selectedReadyTransactionsWithinPacketPeriod;

  const allVisibleSelected =
    visibleTransactions.length > 0 &&
    visibleTransactions.every((transaction) => selectedTransactionIds.has(transaction.id));
  const activeTeamName =
    transactionReview.data?.teamName ?? teams.data?.teams[0]?.name ?? "Workspace";

  useEffect(() => {
    setPacketPeriodDraft((current) => {
      if (current.selectionKey === selectedReadyTransactionKey) {
        return current;
      }

      return {
        selectionKey: selectedReadyTransactionKey,
        from: selectedReadyPeriodDefaults.from,
        to: selectedReadyPeriodDefaults.to,
      };
    });
  }, [
    selectedReadyPeriodDefaults.from,
    selectedReadyPeriodDefaults.to,
    selectedReadyTransactionKey,
  ]);

  async function reviewTransaction(transaction: Transaction | TransactionSyncRecord) {
    if (!transactionReview.data) {
      return;
    }

    const categoryId =
      categoryDrafts[transaction.id] ??
      transaction.categoryId ??
      transactionReview.data.categories[0]?.id ??
      "";

    if (!categoryId || transaction.reviewState === "reviewed") {
      return;
    }

    setReviewError(null);
    setReviewingId(transaction.id);

    try {
      const syncedRecord = transactionSync.collection?.get(transaction.id);
      const record = isTransactionSyncRecord(syncedRecord)
        ? syncedRecord
        : isTransactionSyncRecord(transaction)
          ? transaction
          : null;

      if (record) {
        await transactionSync.reviewTransaction(record, categoryId);
        await queryClient.invalidateQueries({
          queryKey: orpc.ledger.summary.queryKey(),
        });
        return;
      }

      await reviewMutation.mutateAsync({
        teamId: transactionReview.data.teamId,
        transactionId: transaction.id,
        categoryId,
        idempotencyKey: crypto.randomUUID(),
      });
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "Transaction review failed");
      await transactionSync.refetch();
    } finally {
      setReviewingId(null);
    }
  }

  async function exportSelectedTransactions() {
    if (!transactionReview.data || selectedTransactionIds.size === 0) {
      return;
    }

    if (selectedReadyTransactions.length !== selectedTransactionIds.size) {
      setExportError("Only ready-to-export transactions can be exported.");
      return;
    }

    if (!packetPeriodFromIso || !packetPeriodToIso || !hasValidPacketPeriod) {
      setExportError("Choose a valid packet period before exporting.");
      return;
    }

    if (!selectedReadyTransactionsWithinPacketPeriod) {
      setExportError("Packet period must include every selected ready transaction.");
      return;
    }

    setExportError(null);
    setLastExportSummary(null);

    try {
      const result = await exportMutation.mutateAsync({
        teamId: transactionReview.data.teamId,
        from: packetPeriodFromIso,
        to: packetPeriodToIso,
        transactionIds: selectedReadyTransactions.map((transaction) => transaction.id),
        formats: ["csv", "xlsx"],
        idempotencyKey: crypto.randomUUID(),
      });

      downloadBase64File(result.bodyBase64, result.contentType, result.fileName);
      setLastExportSummary({
        fileName: result.fileName,
        transactionCount: result.manifest.transactionCount,
        attachmentCount: result.manifest.attachmentCount,
        skippedAttachmentCount: result.manifest.skippedAttachmentCount,
        formats: result.manifest.settings.formats,
        csvDelimiter: result.manifest.settings.csvDelimiter,
        from: result.manifest.filters.from,
        to: result.manifest.filters.to,
      });
      await queryClient.invalidateQueries({
        queryKey: orpc.transactionReview.list.queryKey(),
      });
      await queryClient.invalidateQueries({
        queryKey: orpc.ledger.summary.queryKey(),
      });
      await transactionSync.refetch();
      setSelectedTransactionIds(new Set());
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Accountant packet export failed");
    }
  }

  async function updateAccountantStatus(
    transaction: Transaction | TransactionSyncRecord,
    action: UpdateTransactionAccountantStatusAction,
    reason?: string,
  ) {
    if (!transactionReview.data) {
      return;
    }

    setExportError(null);

    try {
      await accountantStatusMutation.mutateAsync({
        teamId: transactionReview.data.teamId,
        transactionId: transaction.id,
        action,
        reason,
        idempotencyKey: crypto.randomUUID(),
      });
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Accountant status update failed");
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1728px] flex-col gap-5 py-8 md:py-10">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <label className="relative min-w-0 flex-1 md:max-w-[440px] lg:max-w-[520px]">
            <span className="sr-only">Search transactions</span>
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/80"
            />
            <Input
              className="h-10 border-border bg-transparent pl-11 pr-11 text-sm"
              onChange={(event) =>
                updateSearch({ q: optionalStringSearchParam(event.target.value) })
              }
              placeholder="Search or filter"
              type="search"
              value={query}
            />
            <ListFilterIcon
              aria-hidden="true"
              className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/80"
            />
          </label>
          <Button
            className="hidden h-10 gap-2 border-border px-4 text-muted-foreground md:inline-flex"
            variant="outline"
          >
            {monthLabel}
            <ChevronDownIcon aria-hidden="true" className="size-3.5" />
          </Button>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-px md:overflow-visible">
          <Button
            aria-label="Transaction columns"
            className="border-border"
            size="icon-lg"
            variant="outline"
          >
            <SlidersHorizontalIcon aria-hidden="true" className="size-4" />
          </Button>
          <Button
            aria-label="Add transaction"
            className="border-border"
            size="icon-lg"
            variant="outline"
          >
            <PlusIcon aria-hidden="true" className="size-4" />
          </Button>
          <div className="flex h-10 shrink-0 border border-border">
            <button
              className="min-w-16 border-r border-border px-4 text-sm text-foreground transition-colors hover:bg-muted/30 data-[active=true]:bg-card active:scale-[0.98]"
              data-active={tab === "all"}
              onClick={() => updateSearch({ tab: "all", status: undefined })}
              type="button"
            >
              All
            </button>
            <button
              className="min-w-32 px-4 text-sm text-muted-foreground transition-colors hover:bg-muted/30 data-[active=true]:bg-card data-[active=true]:text-foreground active:scale-[0.98]"
              data-active={tab === "review"}
              onClick={() => updateSearch({ tab: "review", status: undefined })}
              type="button"
            >
              Review queue ({queueCounts.queue})
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-px" aria-label="Transaction queue filters">
        {transactionQueueFilters.map((filter) => {
          const isActive = tab === "review" && statusFilter === filter.value;
          const count = queueCounts[filter.value];

          return (
            <Button
              className="gap-2 border-border px-3 data-[active=true]:border-foreground data-[active=true]:bg-card data-[active=true]:text-foreground"
              data-active={isActive}
              key={filter.value}
              onClick={() => updateSearch({ tab: "review", status: filter.value })}
              size="sm"
              type="button"
              variant="outline"
            >
              {filter.label}
              <span className="font-mono text-[11px] text-muted-foreground">{count}</span>
            </Button>
          );
        })}
      </div>

      <section
        aria-label={`${activeTeamName} transactions`}
        className="relative overflow-hidden border border-border bg-background"
      >
        <Table className="min-w-[1120px] table-fixed">
          <TableHeader className="bg-background">
            <TableRow className="h-[45px] hover:bg-transparent">
              <TableHead className="w-14 text-foreground">
                <Checkbox
                  aria-label="Select all visible transactions"
                  checked={allVisibleSelected}
                  onCheckedChange={(checked) => {
                    setSelectedTransactionIds((current) => {
                      const next = new Set(current);

                      for (const transaction of visibleTransactions) {
                        if (checked) {
                          next.add(transaction.id);
                        } else {
                          next.delete(transaction.id);
                        }
                      }

                      return next;
                    });
                  }}
                />
              </TableHead>
              <TableHead className="w-28 text-sm text-foreground">Date</TableHead>
              <TableHead className="w-[30%] text-sm text-foreground">Description</TableHead>
              <TableHead className="w-44 text-sm text-foreground">Amount</TableHead>
              <TableHead className="w-44 text-sm text-foreground">Tax amount</TableHead>
              <TableHead className="w-64 text-foreground">Category</TableHead>
              <TableHead className="w-44 text-sm text-foreground">Status</TableHead>
              <TableHead className="w-24 text-center text-sm text-foreground">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactionReview.isLoading || transactionSync.isLoading ? (
              <TableRow>
                <TableCell
                  className="h-[calc(100svh-300px)] min-h-[360px] text-center text-sm text-muted-foreground"
                  colSpan={8}
                >
                  Loading transactions...
                </TableCell>
              </TableRow>
            ) : visibleTransactions.length === 0 ? (
              <TableRow>
                <TableCell
                  className="h-[calc(100svh-300px)] min-h-[360px] text-center text-sm text-muted-foreground"
                  colSpan={8}
                >
                  No transactions match this view.
                </TableCell>
              </TableRow>
            ) : (
              visibleTransactions.map((transaction, index) => {
                const categoryId =
                  categoryDrafts[transaction.id] ??
                  transaction.categoryId ??
                  categories[0]?.id ??
                  "";
                const canReview = transaction.reviewState !== "reviewed" && categoryId.length > 0;
                const isSelected = selectedTransactionIds.has(transaction.id);
                const accountantStatus = accountantStatusFor(transaction);
                const statusMeta = accountantStatusMeta(accountantStatus);

                return (
                  <TableRow
                    className="h-[58px]"
                    data-state={isSelected ? "selected" : undefined}
                    key={transaction.id}
                  >
                    <TableCell>
                      <Checkbox
                        aria-label={`Select ${transaction.description}`}
                        checked={isSelected}
                        onCheckedChange={(checked) => {
                          setSelectedTransactionIds((current) => {
                            const next = new Set(current);

                            if (checked) {
                              next.add(transaction.id);
                            } else {
                              next.delete(transaction.id);
                            }

                            return next;
                          });
                        }}
                      />
                    </TableCell>
                    <TableCell className="text-sm text-foreground">
                      {formatDate(transaction.postedAt)}
                    </TableCell>
                    <TableCell>
                      <div className="truncate text-sm text-foreground">
                        {transaction.description}
                      </div>
                      {transaction.providerTransactionId ? (
                        <div className="truncate text-xs text-muted-foreground">
                          {transaction.providerTransactionId}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell
                      className={
                        transaction.money.amountMinor > 0
                          ? "font-mono text-sm text-emerald-400"
                          : "font-mono text-sm text-foreground"
                      }
                    >
                      {formatMoney(transaction.money)}
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {formatMoney({ amountMinor: 0, currency: transaction.money.currency })}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span
                          aria-hidden="true"
                          className={`size-3 shrink-0 ${categorySwatches[index % categorySwatches.length]}`}
                        />
                        <select
                          aria-label={`Category for ${transaction.description}`}
                          className="h-8 min-w-0 flex-1 appearance-none border border-transparent bg-transparent text-sm text-foreground outline-none transition-colors hover:border-border focus:border-ring"
                          disabled={
                            transaction.reviewState === "reviewed" || reviewingId === transaction.id
                          }
                          onChange={(event) =>
                            setCategoryDrafts((drafts) => ({
                              ...drafts,
                              [transaction.id]: event.target.value,
                            }))
                          }
                          value={categoryId}
                        >
                          {categories.length === 0 ? <option value="">Uncategorized</option> : null}
                          {categories.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-foreground">
                      <div className="flex min-w-0 flex-col gap-1">
                        <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                        {transaction.accountantStatusReason ? (
                          <span className="truncate text-xs text-muted-foreground">
                            {transaction.accountantStatusReason}
                          </span>
                        ) : transaction.reviewState === "reviewed" ? (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <CheckIcon aria-hidden="true" className="size-3" />
                            Reviewed
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              aria-label={`Actions for ${transaction.description}`}
                              className="mx-auto border-transparent text-foreground"
                              size="icon-sm"
                              variant="ghost"
                            />
                          }
                        >
                          <MoreHorizontalIcon aria-hidden="true" className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44 border border-border">
                          <DropdownMenuItem
                            disabled={!canReview || reviewingId === transaction.id}
                            onClick={() => void reviewTransaction(transaction)}
                          >
                            Mark reviewed
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {accountantStatus === "export_failed" ? (
                            <DropdownMenuItem
                              disabled={accountantStatusMutation.isPending}
                              onClick={() =>
                                void updateAccountantStatus(transaction, "retry_export")
                              }
                            >
                              Retry export
                            </DropdownMenuItem>
                          ) : null}
                          {accountantStatus === "exporting" ? (
                            <DropdownMenuItem
                              disabled={accountantStatusMutation.isPending}
                              onClick={() =>
                                void updateAccountantStatus(
                                  transaction,
                                  "mark_export_failed",
                                  "Marked failed from transaction queue",
                                )
                              }
                            >
                              Mark failed
                            </DropdownMenuItem>
                          ) : null}
                          {accountantStatus === "ready_to_export" ||
                          accountantStatus === "exporting" ||
                          accountantStatus === "export_failed" ? (
                            <DropdownMenuItem
                              disabled={accountantStatusMutation.isPending}
                              onClick={() =>
                                void updateAccountantStatus(transaction, "mark_exported")
                              }
                            >
                              Mark exported
                            </DropdownMenuItem>
                          ) : null}
                          {accountantStatus === "archived" ? (
                            <DropdownMenuItem
                              disabled={accountantStatusMutation.isPending}
                              onClick={() => void updateAccountantStatus(transaction, "unarchive")}
                            >
                              Unarchive
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              disabled={accountantStatusMutation.isPending}
                              onClick={() => void updateAccountantStatus(transaction, "archive")}
                            >
                              Archive
                            </DropdownMenuItem>
                          )}
                          {accountantStatus === "excluded" ? (
                            <DropdownMenuItem
                              disabled={accountantStatusMutation.isPending}
                              onClick={() => void updateAccountantStatus(transaction, "unarchive")}
                            >
                              Restore to queue
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              disabled={accountantStatusMutation.isPending}
                              onClick={() => void updateAccountantStatus(transaction, "exclude")}
                            >
                              Exclude
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() =>
                              setSelectedTransactionIds((current) => {
                                const next = new Set(current);
                                next.add(transaction.id);
                                return next;
                              })
                            }
                          >
                            Select row
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </section>

      <div className="flex flex-col gap-2 text-xs text-muted-foreground/70 md:flex-row md:items-center md:justify-between">
        <span>
          Sync: {transactionReview.data?.sync.collection ?? "transactions"} ·{" "}
          {transactionReview.data?.sync.conflictPolicy ?? "server_wins_for_financial_state"} ·{" "}
          {transactionSync.status} · {transactionSync.realtimeStatus}
        </span>
        <span>
          {selectedTransactionIds.size} selected · {visibleTransactions.length} shown ·{" "}
          {transactions.length} total
        </span>
      </div>
      {reviewError ? <p className="text-xs text-destructive">{reviewError}</p> : null}
      {exportError ? <p className="text-xs text-destructive">{exportError}</p> : null}
      {lastExportSummary ? (
        <div className="grid gap-2 border border-border bg-card/40 p-3 text-xs text-muted-foreground sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              Downloaded {lastExportSummary.fileName}
            </p>
            <p className="mt-1">
              {formatNullableDateRange(lastExportSummary.from, lastExportSummary.to)} ·{" "}
              {lastExportSummary.formats.join(" + ").toUpperCase()} · delimiter{" "}
              {lastExportSummary.csvDelimiter === "\t" ? "tab" : lastExportSummary.csvDelimiter}
            </p>
          </div>
          <div className="flex flex-wrap gap-3 font-mono text-foreground sm:justify-end">
            <span>{lastExportSummary.transactionCount} tx</span>
            <span>{lastExportSummary.attachmentCount} attachments</span>
            <span>{lastExportSummary.skippedAttachmentCount} skipped</span>
          </div>
        </div>
      ) : null}
      {reviewMutation.error ? (
        <p className="text-xs text-destructive">{reviewMutation.error.message}</p>
      ) : null}
      {exportMutation.error ? (
        <p className="text-xs text-destructive">{exportMutation.error.message}</p>
      ) : null}
      {accountantStatusMutation.error ? (
        <p className="text-xs text-destructive">{accountantStatusMutation.error.message}</p>
      ) : null}
      {selectedTransactionIds.size > 0 ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center bg-gradient-to-t from-background via-background/85 to-transparent px-4 py-7">
          <div
            aria-live="polite"
            className="pointer-events-auto flex min-h-11 w-full max-w-3xl flex-col gap-3 border border-border bg-card px-3 py-3 text-sm shadow-[0_-16px_48px_rgba(0,0,0,0.45)] sm:flex-row sm:items-center sm:justify-between"
          >
            <span className="min-w-0 text-muted-foreground">
              <span className="block truncate">
                {selectedTransactionIds.size} selected · {selectedReadyTransactions.length} ready
                {selectedReadyDateRange ? ` · ${selectedReadyDateRange}` : ""}
              </span>
              {selectedNonReadyTransactionCount > 0 ? (
                <span className="block truncate text-[11px] text-destructive">
                  {selectedNonReadyTransactionCount} non-ready selected
                </span>
              ) : null}
            </span>
            <div className="flex flex-wrap items-end gap-2">
              <label className="grid gap-1 text-[11px] text-muted-foreground">
                <span>From</span>
                <Input
                  className="h-8 w-36 px-2 text-xs"
                  disabled={selectedReadyTransactions.length === 0}
                  onChange={(event) =>
                    setPacketPeriodDraft((current) => ({
                      ...current,
                      from: event.target.value,
                    }))
                  }
                  type="date"
                  value={packetPeriodDraft.from}
                />
              </label>
              <label className="grid gap-1 text-[11px] text-muted-foreground">
                <span>To</span>
                <Input
                  className="h-8 w-36 px-2 text-xs"
                  disabled={selectedReadyTransactions.length === 0}
                  onChange={(event) =>
                    setPacketPeriodDraft((current) => ({
                      ...current,
                      to: event.target.value,
                    }))
                  }
                  type="date"
                  value={packetPeriodDraft.to}
                />
              </label>
              <Button
                className="gap-2 border-border px-3 text-muted-foreground"
                onClick={() => setSelectedTransactionIds(new Set())}
                size="sm"
                type="button"
                variant="outline"
              >
                Deselect all
                <XIcon aria-hidden="true" className="size-3.5" />
              </Button>
              <Button
                className="gap-2 px-3"
                disabled={exportMutation.isPending || !canExportSelectedTransactions}
                onClick={() => void exportSelectedTransactions()}
                size="sm"
                type="button"
              >
                {exportMutation.isPending ? "Exporting" : "Export"}
                <DownloadIcon aria-hidden="true" className="size-3.5" />
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function isTransactionQueueFilter(value: unknown): value is TransactionQueueFilter {
  return transactionQueueFilters.some((filter) => filter.value === value);
}

function accountantStatusFor(
  transaction: Pick<Transaction, "reviewState" | "accountantStatus">,
): TransactionAccountantStatus {
  return (
    transaction.accountantStatus ??
    (transaction.reviewState === "reviewed" ? "missing_receipt" : "needs_review")
  );
}

function transactionMatchesQueueFilter(
  transaction: Pick<Transaction, "reviewState" | "accountantStatus">,
  filter: TransactionQueueFilter,
) {
  const status = accountantStatusFor(transaction);

  if (filter === "queue") {
    return defaultQueueStatuses.has(status);
  }

  if (filter === "ready") {
    return status === "ready_to_export";
  }

  return status === queueFilterStatus[filter];
}

function createQueueCounts(
  transactions: readonly Pick<Transaction, "reviewState" | "accountantStatus">[],
) {
  const counts: Record<TransactionQueueFilter, number> = {
    queue: 0,
    ready: 0,
    missing_receipt: 0,
    export_failed: 0,
    exported: 0,
    excluded: 0,
    archived: 0,
  };

  for (const transaction of transactions) {
    const status = accountantStatusFor(transaction);

    if (defaultQueueStatuses.has(status)) {
      counts.queue += 1;
    }

    if (status === "ready_to_export") {
      counts.ready += 1;
    } else if (status === "missing_receipt") {
      counts.missing_receipt += 1;
    } else if (status === "export_failed") {
      counts.export_failed += 1;
    } else if (status === "exported") {
      counts.exported += 1;
    } else if (status === "excluded") {
      counts.excluded += 1;
    } else if (status === "archived") {
      counts.archived += 1;
    }
  }

  return counts;
}

function accountantStatusLabel(status: TransactionAccountantStatus) {
  return accountantStatusMeta(status).label;
}

function accountantStatusMeta(status: TransactionAccountantStatus): {
  label: string;
  variant: QueueBadgeVariant;
} {
  if (status === "ready_to_export") {
    return { label: "Ready to export", variant: "success" };
  }

  if (status === "receipt_found") {
    return { label: "Receipt found", variant: "secondary" };
  }

  if (status === "missing_receipt") {
    return { label: "Missing receipt", variant: "warning" };
  }

  if (status === "exporting") {
    return { label: "Exporting", variant: "secondary" };
  }

  if (status === "exported") {
    return { label: "Exported", variant: "secondary" };
  }

  if (status === "export_failed") {
    return { label: "Export failed", variant: "destructive" };
  }

  if (status === "excluded") {
    return { label: "Excluded", variant: "outline" };
  }

  if (status === "archived") {
    return { label: "Archived", variant: "outline" };
  }

  return { label: "Needs review", variant: "outline" };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function formatNullableDateRange(from: string | null, to: string | null) {
  if (from && to) {
    return `${formatDate(from)} - ${formatDate(to)}`;
  }

  if (from) {
    return `From ${formatDate(from)}`;
  }

  if (to) {
    return `Through ${formatDate(to)}`;
  }

  return "Selected transactions";
}

function dateRangeLabelForTransactions(transactions: readonly Pick<Transaction, "postedAt">[]) {
  if (transactions.length === 0) {
    return null;
  }

  const postedTimes = transactions.map((transaction) => new Date(transaction.postedAt).getTime());
  return formatNullableDateRange(
    new Date(Math.min(...postedTimes)).toISOString(),
    new Date(Math.max(...postedTimes)).toISOString(),
  );
}

function dateInputRangeForTransactions(transactions: readonly Pick<Transaction, "postedAt">[]) {
  if (transactions.length === 0) {
    return { from: "", to: "" };
  }

  const postedTimes = transactions.map((transaction) => new Date(transaction.postedAt).getTime());

  return {
    from: dateInputValueFromIso(new Date(Math.min(...postedTimes)).toISOString()),
    to: dateInputValueFromIso(new Date(Math.max(...postedTimes)).toISOString()),
  };
}

function dateInputValueFromIso(value: string) {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

function dateInputToUtcStart(value: string) {
  return dateInputToUtcIso(value, "T00:00:00.000Z");
}

function dateInputToUtcEnd(value: string) {
  return dateInputToUtcIso(value, "T23:59:59.999Z");
}

function dateInputToUtcIso(value: string, suffix: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}${suffix}`);

  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return null;
  }

  return date.toISOString();
}

function transactionsAreWithinDateRange(
  transactions: readonly Pick<Transaction, "postedAt">[],
  from: string,
  to: string,
) {
  const fromTime = Date.parse(from);
  const toTime = Date.parse(to);

  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime)) {
    return false;
  }

  return transactions.every((transaction) => {
    const postedTime = Date.parse(transaction.postedAt);
    return Number.isFinite(postedTime) && postedTime >= fromTime && postedTime <= toTime;
  });
}

function monthChip(value?: string) {
  const date = value ? new Date(value) : new Date();

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function downloadBase64File(bodyBase64: string, contentType: string, fileName: string) {
  const binary = atob(bodyBase64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  const url = URL.createObjectURL(new Blob([bytes], { type: contentType }));
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function isTransactionSyncRecord(
  transaction: Transaction | TransactionSyncRecord | undefined,
): transaction is TransactionSyncRecord {
  return typeof transaction?.updatedAt === "string" && transaction.updatedAt.length > 0;
}
