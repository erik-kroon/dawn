import type { DawnQueueMessage } from "@dawn/jobs";

export const cloudflareBindingNames = {
  environment: "ENVIRONMENT",
  documentsBucket: "DAWN_DOCUMENTS",
  jobsQueue: "DAWN_JOBS",
  jobsDeadLetterQueue: "DAWN_JOBS_DLQ",
  cache: "DAWN_CACHE",
  tenantCoordinator: "DAWN_TENANT_COORDINATOR",
  hyperdrive: "DAWN_HYPERDRIVE",
} as const;

export type CloudflareBindingName =
  (typeof cloudflareBindingNames)[keyof typeof cloudflareBindingNames];

export type DawnCloudflareStage = "preview" | "staging" | "production";

export type DawnCloudflareBindings = {
  ENVIRONMENT: DawnCloudflareStage;
  NODE_ENV?: "development" | "production" | "test";
  CORS_ORIGIN: string;
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  POLAR_ACCESS_TOKEN: string;
  POLAR_SUCCESS_URL: string;
  DATABASE_URL: string;
  DAWN_DOCUMENTS: R2Bucket;
  DAWN_JOBS: Queue<DawnQueueMessage>;
  DAWN_JOBS_DLQ: Queue<DawnQueueMessage>;
  DAWN_CACHE: KVNamespace;
  DAWN_TENANT_COORDINATOR: DurableObjectNamespace;
  DAWN_HYPERDRIVE?: Hyperdrive;
};

export type DawnStorageBindings = Pick<
  DawnCloudflareBindings,
  "DAWN_DOCUMENTS" | "DAWN_JOBS" | "DAWN_CACHE"
>;
