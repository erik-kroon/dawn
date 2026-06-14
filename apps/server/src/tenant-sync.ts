import type { DawnCloudflareBindings } from "@dawn/infra/cloudflare";
import type { SyncInvalidationJob } from "@dawn/jobs";
import {
  createTransactionSyncInvalidation,
  isTransactionSyncInvalidationEvent,
  transactionSyncCollection,
  type TransactionSyncInvalidationEvent,
} from "@dawn/sync";

export type TenantSyncFanoutResult = {
  delivered: number;
  subscribers: number;
};

export async function publishTenantSyncInvalidation(
  env: DawnCloudflareBindings,
  input: SyncInvalidationJob | TransactionSyncInvalidationEvent,
): Promise<TenantSyncFanoutResult> {
  const event = normalizeTenantSyncInvalidation(input);
  const id = env.DAWN_TENANT_COORDINATOR.idFromName(event.teamId);
  const stub = env.DAWN_TENANT_COORDINATOR.get(id);
  const response = await stub.fetch("https://tenant-coordinator/invalidate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });

  if (!response.ok) {
    throw new Error(`Tenant sync invalidation failed with ${response.status}`);
  }

  return (await response.json()) as TenantSyncFanoutResult;
}

export function normalizeTenantSyncInvalidation(
  input: SyncInvalidationJob | TransactionSyncInvalidationEvent,
): TransactionSyncInvalidationEvent {
  if (isTransactionSyncInvalidationEvent(input)) {
    return input;
  }

  if (input.type === "sync.invalidate" && input.collection === transactionSyncCollection.id) {
    return createTransactionSyncInvalidation({
      teamId: input.teamId,
      cursor: input.cursor,
      changedIds: input.changedIds,
    });
  }

  throw new Error("Unsupported tenant sync invalidation");
}
