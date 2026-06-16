import type { DawnCloudflareBindings, DawnStorageBindings } from "@dawn/infra/cloudflare";
import { createServerEnv } from "@dawn/env/server";
import type { Context } from "hono";

type CloudflareContext = Context<{
  Bindings: DawnCloudflareBindings;
}>;

export function cloudflareBindings(context: CloudflareContext) {
  return context.env;
}

export function cloudflareStorageBindings(context: CloudflareContext): DawnStorageBindings {
  return {
    DAWN_DOCUMENTS: context.env.DAWN_DOCUMENTS,
    DAWN_JOBS: context.env.DAWN_JOBS,
    DAWN_CACHE: context.env.DAWN_CACHE,
  };
}

export function createServerEnvFromCloudflareBindings(bindings: DawnCloudflareBindings) {
  return createServerEnv({
    DATABASE_URL: bindings.DATABASE_URL,
    BETTER_AUTH_SECRET: bindings.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: bindings.BETTER_AUTH_URL,
    POLAR_ACCESS_TOKEN: bindings.POLAR_ACCESS_TOKEN,
    POLAR_SUCCESS_URL: bindings.POLAR_SUCCESS_URL,
    GMAIL_CLIENT_ID: bindings.GMAIL_CLIENT_ID,
    GMAIL_CLIENT_SECRET: bindings.GMAIL_CLIENT_SECRET,
    CORS_ORIGIN: bindings.CORS_ORIGIN,
    NODE_ENV: bindings.NODE_ENV ?? "production",
  });
}
