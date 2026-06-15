import type { DawnCloudflareBindings } from "@dawn/infra/cloudflare";
import type { SyncInvalidationJob } from "@dawn/jobs";
import {
  createSyncInvalidationFromJob,
  isSyncInvalidationEvent,
  isSyncInvalidationJob,
  syncCollectionContractForId,
  type SyncInvalidationEvent,
} from "@dawn/sync";

export type TenantSyncFanoutResult = {
  delivered: number;
  subscribers: number;
};

export async function publishTenantSyncInvalidation(
  env: DawnCloudflareBindings,
  input: SyncInvalidationJob | SyncInvalidationEvent,
): Promise<TenantSyncFanoutResult> {
  const event = normalizeTenantSyncInvalidation(input);
  const contract = syncCollectionContractForId(event.collection);
  const id = env.DAWN_TENANT_COORDINATOR.idFromName(event.teamId);
  const stub = env.DAWN_TENANT_COORDINATOR.get(id);
  const response = await stub.fetch(
    `https://tenant-coordinator${contract.fanout.coordinatorInvalidationPath}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    },
  );

  if (!response.ok) {
    throw new Error(`Tenant sync invalidation failed with ${response.status}`);
  }

  return (await response.json()) as TenantSyncFanoutResult;
}

export function normalizeTenantSyncInvalidation(
  input: SyncInvalidationJob | SyncInvalidationEvent,
): SyncInvalidationEvent {
  if (isSyncInvalidationEvent(input)) {
    return input;
  }

  if (isSyncInvalidationJob(input)) {
    return createSyncInvalidationFromJob(input);
  }

  throw new Error("Unsupported tenant sync invalidation");
}
