import { queryCollectionOptions } from "@tanstack/query-db-collection";
import { createCollection, useLiveQuery, type Collection } from "@tanstack/react-db";
import { useMemo } from "react";

import type { TransactionSyncRecord } from "@dawn/sync";
import {
  createOptimisticTransactionReview,
  transactionSyncCollection,
  transactionSyncRecordsFromChanges,
} from "@dawn/sync";

import { client, orpc, queryClient } from "@/utils/orpc";

type TransactionCollection = Collection<TransactionSyncRecord, string>;

export function useTransactionSync(teamId?: string) {
  const collection = useMemo(() => {
    if (!teamId) {
      return null;
    }

    const transactionsCollection = createCollection<TransactionSyncRecord, string>(
      queryCollectionOptions({
        id: `${transactionSyncCollection.id}:${teamId}`,
        queryKey: ["sync", transactionSyncCollection.id, teamId],
        queryClient,
        queryFn: async () => {
          const response = await queryClient.fetchQuery(
            orpc.sync.transactions.queryOptions({
              input: { teamId, cursor: null },
            }),
          );

          return transactionSyncRecordsFromChanges(response.changes);
        },
        getKey: (transaction) => transaction.id,
        onUpdate: async ({ transaction, collection: updatedCollection }) => {
          const mutation = transaction.mutations[0];
          const next = mutation.modified;

          if (!next.categoryId || next.reviewState !== "reviewed") {
            throw new Error("Transaction review sync updates must include a reviewed category");
          }

          await client.transactionReview.review({
            teamId,
            transactionId: next.id,
            categoryId: next.categoryId,
            idempotencyKey: crypto.randomUUID(),
          });
          await updatedCollection.utils.refetch({ throwOnError: true });
        },
      }),
    );

    return transactionsCollection;
  }, [teamId]);

  const liveQuery = useLiveQuery(() => collection, [collection]);

  return {
    collection,
    transactions: liveQuery.data ?? [],
    isLoading: liveQuery.isLoading,
    isReady: liveQuery.isReady,
    status: collection?.status ?? "idle",
    reviewTransaction: async (transaction: TransactionSyncRecord, categoryId: string) => {
      if (!collection) {
        throw new Error("Transaction sync collection is not ready");
      }

      await reviewTransactionOptimistically(collection, transaction, categoryId);
    },
    refetch: async () => {
      await collection?.utils.refetch({ throwOnError: false });
    },
  };
}

async function reviewTransactionOptimistically(
  collection: TransactionCollection,
  transaction: TransactionSyncRecord,
  categoryId: string,
) {
  const optimistic = createOptimisticTransactionReview({
    record: transaction,
    categoryId,
    now: new Date().toISOString(),
  });
  const syncTransaction = collection.update(transaction.id, (draft) => {
    draft.categoryId = optimistic.record.categoryId;
    draft.reviewState = optimistic.record.reviewState;
    draft.updatedAt = optimistic.record.updatedAt;
  });

  await syncTransaction.isPersisted.promise;
}
