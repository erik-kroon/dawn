import { queryCollectionOptions } from "@tanstack/query-db-collection";
import { createCollection, useLiveQuery, type Collection } from "@tanstack/react-db";
import { useEffect, useMemo, useState } from "react";

import type { TransactionSyncRecord } from "@dawn/sync";
import {
  createOptimisticTransactionReview,
  isTransactionSyncInvalidationEvent,
  transactionSyncCollection,
  transactionSyncRecordsFromChanges,
} from "@dawn/sync";
import { env } from "@dawn/env/web";

import { client, orpc, queryClient } from "@/utils/orpc";

type TransactionCollection = Collection<TransactionSyncRecord, string>;
type RealtimeStatus = "idle" | "connecting" | "connected" | "reconnecting";

export function useTransactionSync(teamId?: string) {
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("idle");
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

  useEffect(() => {
    if (!teamId || !collection) {
      setRealtimeStatus("idle");
      return;
    }

    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const connect = () => {
      setRealtimeStatus((status) => (status === "idle" ? "connecting" : "reconnecting"));
      socket = new WebSocket(transactionSyncSubscriptionUrl(teamId));

      socket.addEventListener("open", () => {
        setRealtimeStatus("connected");
        void collection.utils.refetch({ throwOnError: false });
      });
      socket.addEventListener("message", (event) => {
        const message = parseRealtimeMessage(event.data);

        if (
          isTransactionSyncInvalidationEvent(message) &&
          message.teamId === teamId &&
          message.collection === transactionSyncCollection.id
        ) {
          void collection.utils.refetch({ throwOnError: false });
        }
      });
      socket.addEventListener("close", () => {
        if (stopped) {
          return;
        }

        setRealtimeStatus("reconnecting");
        reconnectTimer = setTimeout(connect, 1_000);
      });
      socket.addEventListener("error", () => {
        socket?.close();
      });
    };

    connect();

    return () => {
      stopped = true;

      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }

      socket?.close();
    };
  }, [collection, teamId]);

  return {
    collection,
    transactions: liveQuery.data ?? [],
    isLoading: liveQuery.isLoading,
    isReady: liveQuery.isReady,
    realtimeStatus,
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

function parseRealtimeMessage(data: string) {
  try {
    return JSON.parse(data) as unknown;
  } catch {
    return null;
  }
}

function transactionSyncSubscriptionUrl(teamId: string) {
  const url = new URL(env.VITE_SERVER_URL);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/sync/transactions/subscribe";
  url.search = new URLSearchParams({ teamId }).toString();

  return url.toString();
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
