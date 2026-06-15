import { Button } from "@dawn/ui/components/button";
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
import { formatMoney, type Transaction } from "@dawn/domain";
import type { TransactionSyncRecord } from "@dawn/sync";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  CheckIcon,
  ChevronDownIcon,
  ListFilterIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  XIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

import { useTransactionSync } from "@/sync/transactions";
import { orpc } from "@/utils/orpc";

import { ensureCurrentTeam, optionalStringSearchParam } from "../-team-routing";

type TransactionTab = "all" | "review";

type TransactionsSearch = {
  q?: string;
  tab?: TransactionTab;
};

export const Route = createFileRoute("/_auth/transactions")({
  component: TransactionsRoute,
  validateSearch: (search: Record<string, unknown>): TransactionsSearch => ({
    q: optionalStringSearchParam(search.q),
    tab: search.tab === "review" ? "review" : undefined,
  }),
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
  const tab = search.tab ?? "all";
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [categoryDrafts, setCategoryDrafts] = useState<Record<string, string>>({});
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);

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
  const reviewCount = transactions.filter(
    (transaction) => transaction.reviewState !== "reviewed",
  ).length;
  const monthLabel = monthChip(transactions[0]?.postedAt);

  const visibleTransactions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return transactions.filter((transaction) => {
      if (tab === "review" && transaction.reviewState === "reviewed") {
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
        formatMoney(transaction.money),
        formatDate(transaction.postedAt),
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalizedQuery));
    });
  }, [categories, query, tab, transactions]);

  const allVisibleSelected =
    visibleTransactions.length > 0 &&
    visibleTransactions.every((transaction) => selectedTransactionIds.has(transaction.id));
  const activeTeamName =
    transactionReview.data?.teamName ?? teams.data?.teams[0]?.name ?? "Workspace";

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
              onClick={() => updateSearch({ tab: undefined })}
              type="button"
            >
              All
            </button>
            <button
              className="min-w-32 px-4 text-sm text-muted-foreground transition-colors hover:bg-muted/30 data-[active=true]:bg-card data-[active=true]:text-foreground active:scale-[0.98]"
              data-active={tab === "review"}
              onClick={() => updateSearch({ tab: "review" })}
              type="button"
            >
              In review ({reviewCount})
            </button>
          </div>
        </div>
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
                      {transaction.reviewState === "reviewed" ? (
                        <span className="inline-flex items-center gap-2 text-muted-foreground">
                          <CheckIcon aria-hidden="true" className="size-3.5" />
                          Reviewed
                        </span>
                      ) : (
                        "In review"
                      )}
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
      {reviewMutation.error ? (
        <p className="text-xs text-destructive">{reviewMutation.error.message}</p>
      ) : null}
      {selectedTransactionIds.size > 0 ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center bg-gradient-to-t from-background via-background/85 to-transparent px-4 py-7">
          <div
            aria-live="polite"
            className="pointer-events-auto flex min-h-11 w-full max-w-lg items-center justify-between border border-border bg-card px-3 text-sm shadow-[0_-16px_48px_rgba(0,0,0,0.45)]"
          >
            <span className="truncate text-muted-foreground">
              {selectedTransactionIds.size} selected
            </span>
            <div className="flex items-center gap-2">
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
              <Button className="gap-2 px-3" disabled size="sm" type="button">
                Export
                <ChevronDownIcon aria-hidden="true" className="size-3.5" />
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function monthChip(value?: string) {
  const date = value ? new Date(value) : new Date();

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function isTransactionSyncRecord(
  transaction: Transaction | TransactionSyncRecord | undefined,
): transaction is TransactionSyncRecord {
  return typeof transaction?.updatedAt === "string" && transaction.updatedAt.length > 0;
}
