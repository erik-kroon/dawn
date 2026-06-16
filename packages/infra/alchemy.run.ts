import alchemy from "alchemy";
import {
  DurableObjectNamespace,
  Hyperdrive,
  KVNamespace,
  Queue,
  R2Bucket,
  Vite,
  Worker,
} from "alchemy/cloudflare";
import { config } from "dotenv";

import type { DawnQueueMessage } from "@dawn/jobs";
import {
  cloudflareResourceName,
  cloudflareStageConfig,
  resolveCloudflareStage,
} from "./src/environments";

config({ path: "./.env" });
config({ path: "../../apps/web/.env" });
config({ path: "../../apps/server/.env" });

const stage = resolveCloudflareStage(
  process.env.ALCHEMY_STAGE ?? process.env.CLOUDFLARE_ENVIRONMENT,
);
const stageConfig = cloudflareStageConfig[stage];
const app = await alchemy("dawn", { stage });
const gmailRuntimeBindings = resolveGmailRuntimeBindings();

const documentsBucket = await R2Bucket("documents", {
  name: cloudflareResourceName(stage, "documents"),
  delete: stageConfig.deleteProtectedData,
  dev: { remote: false },
});

const cache = await KVNamespace("cache", {
  title: cloudflareResourceName(stage, "cache"),
  delete: stageConfig.deleteProtectedData,
  dev: { remote: false },
});

const jobsDeadLetterQueue = await Queue<DawnQueueMessage>("jobs-dlq", {
  name: cloudflareResourceName(stage, "jobs-dlq"),
  delete: stageConfig.deleteProtectedData,
  settings: {
    messageRetentionPeriod: 1_209_600,
  },
  dev: { remote: false },
});

const jobsQueue = await Queue<DawnQueueMessage>("jobs", {
  name: cloudflareResourceName(stage, "jobs"),
  dlq: jobsDeadLetterQueue,
  delete: stageConfig.deleteProtectedData,
  settings: {
    messageRetentionPeriod: 604_800,
  },
  dev: { remote: false },
});

const tenantCoordinator = DurableObjectNamespace("tenant-coordinator", {
  className: "TenantCoordinator",
  sqlite: true,
});

const hyperdrive = maybeDatabaseUrl()
  ? await Hyperdrive("postgres", {
      name: cloudflareResourceName(stage, "postgres"),
      origin: alchemy.secret(requiredEnv("DATABASE_URL")),
      caching: { disabled: true },
      delete: stageConfig.deleteProtectedData,
      dev: {
        origin: requiredEnv("DATABASE_URL"),
        remote: false,
      },
    })
  : undefined;

const dawnRuntimeBindings = {
  ENVIRONMENT: stage,
  NODE_ENV: stage === "production" ? "production" : "development",
  CORS_ORIGIN: requiredEnv("CORS_ORIGIN"),
  BETTER_AUTH_URL: requiredEnv("BETTER_AUTH_URL"),
  BETTER_AUTH_SECRET: alchemy.secret(requiredEnv("BETTER_AUTH_SECRET")),
  // POLAR_ACCESS_TOKEN: alchemy.secret(requiredEnv("POLAR_ACCESS_TOKEN")),
  POLAR_SUCCESS_URL: requiredEnv("POLAR_SUCCESS_URL"),
  DATABASE_URL: alchemy.secret(requiredEnv("DATABASE_URL")),
  ...gmailRuntimeBindings,
  DAWN_DOCUMENTS: documentsBucket,
  DAWN_JOBS: jobsQueue,
  DAWN_JOBS_DLQ: jobsDeadLetterQueue,
  DAWN_CACHE: cache,
  DAWN_TENANT_COORDINATOR: tenantCoordinator,
  ...(hyperdrive ? { DAWN_HYPERDRIVE: hyperdrive } : {}),
};

export const api = await Worker("api", {
  cwd: "../../apps/server",
  entrypoint: "./src/index.ts",
  compatibility: "node",
  compatibilityDate: "2026-06-14",
  name: cloudflareResourceName(stage, "api"),
  url: stageConfig.workerUrl,
  bindings: dawnRuntimeBindings,
  observability: {
    enabled: true,
    logs: { enabled: true },
    traces: { enabled: true },
  },
});

export const worker = await Worker("worker", {
  cwd: "../../apps/server",
  entrypoint: "./src/worker.ts",
  compatibility: "node",
  compatibilityDate: "2026-06-14",
  name: cloudflareResourceName(stage, "worker"),
  url: stageConfig.workerUrl,
  bindings: dawnRuntimeBindings,
  eventSources: [
    {
      queue: jobsQueue,
      settings: {
        batchSize: 25,
        maxConcurrency: 5,
        maxRetries: 5,
        retryDelay: 30,
        deadLetterQueue: jobsDeadLetterQueue,
      },
    },
  ],
  observability: {
    enabled: true,
    logs: { enabled: true },
    traces: { enabled: true },
  },
});

export const web = await Vite("web", {
  cwd: "../../apps/web",
  assets: "dist",
  bindings: {
    VITE_SERVER_URL: process.env.VITE_SERVER_URL ?? api.url ?? requiredEnv("BETTER_AUTH_URL"),
  },
});

console.log(`Stage  -> ${stage}`);
console.log(`API    -> ${api.url ?? "(route-only)"}`);
console.log(`Worker -> ${worker.url ?? "(queue-only)"}`);
console.log(`Web    -> ${web.url}`);

await app.finalize();

function maybeDatabaseUrl() {
  return Boolean(process.env.DATABASE_URL || alchemy.env.DATABASE_URL);
}

function requiredEnv(name: string) {
  const value = process.env[name] ?? alchemy.env[name];

  if (value) {
    return value;
  }

  if (process.argv.includes("deploy")) {
    throw new Error(`${name} must be set before deploying Cloudflare infrastructure`);
  }

  return `missing-${name}`;
}

function optionalEnv(name: string) {
  return process.env[name] ?? alchemy.env[name] ?? null;
}

function resolveGmailRuntimeBindings() {
  const clientId = optionalEnv("GMAIL_CLIENT_ID");
  const clientSecret = optionalEnv("GMAIL_CLIENT_SECRET");

  if (Boolean(clientId) !== Boolean(clientSecret)) {
    throw new Error("GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET must be set together");
  }

  if (clientId && clientSecret && !looksLikeGoogleOAuthCredentials(clientId, clientSecret)) {
    throw new Error(
      "Gmail OAuth credentials are invalid: expected GMAIL_CLIENT_ID to end with .apps.googleusercontent.com and GMAIL_CLIENT_SECRET to start with GOCSPX-",
    );
  }

  return {
    GMAIL_CLIENT_ID: clientId ?? "",
    GMAIL_CLIENT_SECRET: alchemy.secret(clientSecret ?? ""),
  };
}

function looksLikeGoogleOAuthCredentials(clientId: string, clientSecret: string) {
  return (
    /^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId) &&
    /^GOCSPX-[A-Za-z0-9_-]{20,}$/.test(clientSecret) &&
    !isPlaceholderCredentialValue(clientId) &&
    !isPlaceholderCredentialValue(clientSecret)
  );
}

function isPlaceholderCredentialValue(value: string) {
  const normalized = value.trim().toLowerCase();

  return (
    normalized === "changeme" ||
    normalized === "change-me" ||
    normalized === "example" ||
    normalized === "placeholder" ||
    normalized === "test" ||
    normalized.startsWith("<") ||
    normalized.includes("your_") ||
    normalized.includes("your-") ||
    normalized.includes("replace")
  );
}
