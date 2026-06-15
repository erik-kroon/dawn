import { polar, checkout, portal } from "@polar-sh/better-auth";
import { createDb } from "@dawn/db";
import * as schema from "@dawn/db/schema/auth";
import { env } from "@dawn/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { polarClient } from "./lib/payments";

function resolveTrustedOrigins(configuredOrigin: string) {
  const origins = [configuredOrigin];

  try {
    const url = new URL(configuredOrigin);
    const isLocalOrigin =
      (url.protocol === "http:" || url.protocol === "https:") &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1");

    if (isLocalOrigin) {
      for (let port = 3000; port <= 3010; port += 1) {
        origins.push(`${url.protocol}//${url.hostname}:${port}`);
      }
    }
  } catch {
    return origins;
  }

  return Array.from(new Set(origins));
}

export function createAuth() {
  const db = createDb();
  const plugins = [];

  if (polarClient && env.POLAR_SUCCESS_URL) {
    plugins.push(
      polar({
        client: polarClient,
        createCustomerOnSignUp: true,
        enableCustomerPortal: true,
        use: [
          checkout({
            products: [
              {
                productId: "your-product-id",
                slug: "pro",
              },
            ],
            successUrl: env.POLAR_SUCCESS_URL,
            authenticatedUsersOnly: true,
          }),
          portal(),
        ],
      }),
    );
  }

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",

      schema: schema,
    }),
    trustedOrigins: resolveTrustedOrigins(env.CORS_ORIGIN),
    emailAndPassword: {
      enabled: true,
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    advanced: {
      defaultCookieAttributes: {
        sameSite: "none",
        secure: true,
        httpOnly: true,
      },
    },
    plugins,
  });
}

export const auth = createAuth();
