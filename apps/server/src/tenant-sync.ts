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
type TenantSyncRuntimeBindings = Partial<Pick<DawnCloudflareBindings, "DAWN_TENANT_COORDINATOR">>;
type LocalTenantSyncRuntime = {
  fanout(event: SyncInvalidationEvent): Promise<TenantSyncFanoutResult> | TenantSyncFanoutResult;
};

let localTenantSyncRuntime: LocalTenantSyncRuntime | null = null;

export function configureLocalTenantSyncRuntime(runtime: LocalTenantSyncRuntime | null) {
  localTenantSyncRuntime = runtime;
}

export async function publishTenantSyncInvalidation(
  env: TenantSyncRuntimeBindings,
  input: SyncInvalidationJob | SyncInvalidationEvent,
): Promise<TenantSyncFanoutResult> {
  const event = normalizeTenantSyncInvalidation(input);
  const contract = syncCollectionContractForId(event.collection);
  const tenantCoordinator = env.DAWN_TENANT_COORDINATOR;

  if (!tenantCoordinator) {
    if (localTenantSyncRuntime) {
      return localTenantSyncRuntime.fanout(event);
    }

    throw new Error("DAWN_TENANT_COORDINATOR binding is required for tenant sync invalidation");
  }

  const id = tenantCoordinator.idFromName(event.teamId);
  const stub = tenantCoordinator.get(id);
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
