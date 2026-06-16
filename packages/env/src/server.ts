import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

import { assertGoogleOAuthCredentialConfig } from "./google-oauth";

export const serverEnvSchema = {
  DATABASE_URL: z.string().min(1),
  DATABASE_HOST: z.string().min(1).optional(),
  DATABASE_USERNAME: z.string().min(1).optional(),
  DATABASE_PASSWORD: z.string().min(1).optional(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  POLAR_ACCESS_TOKEN: z.string().min(1).optional(),
  POLAR_SUCCESS_URL: z.url().optional(),
  GMAIL_CLIENT_ID: z.string().min(1).optional(),
  GMAIL_CLIENT_SECRET: z.string().min(1).optional(),
  CORS_ORIGIN: z.url(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
};

export function createServerEnv(runtimeEnv: Record<string, string | undefined> = process.env) {
  if (!runtimeEnv.SKIP_ENV_VALIDATION) {
    assertGoogleOAuthCredentialConfig(runtimeEnv);
  }

  return createEnv({
    server: serverEnvSchema,
    runtimeEnv,
    skipValidation: !!runtimeEnv.SKIP_ENV_VALIDATION,
    emptyStringAsUndefined: true,
  });
}

export const env = createServerEnv();
