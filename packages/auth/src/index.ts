import { polar, checkout, portal } from "@polar-sh/better-auth";
import { createDb } from "@dawn/db";
import * as schema from "@dawn/db/schema/auth";
import { googleEmailInboxScopes, resolveGoogleOAuthCredentials } from "@dawn/env/google-oauth";
import { env } from "@dawn/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import {
  googleAuthTokensFromAccessTokenResult,
  googleAuthTokensFromRefreshResult,
  type GoogleAuthAccountTokens,
} from "./google-tokens";
import { polarClient } from "./lib/payments";

export {
  googleAuthTokensFromAccessTokenResult,
  googleAuthTokensFromRefreshResult,
  type GoogleAuthAccountTokens,
} from "./google-tokens";

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

function defaultCookieAttributesForAuthUrl(authUrl: string) {
  let secure = true;

  try {
    secure = new URL(authUrl).protocol === "https:";
  } catch {
    secure = true;
  }

  return secure
    ? {
        sameSite: "none" as const,
        secure: true,
        httpOnly: true,
      }
    : {
        sameSite: "lax" as const,
        secure: false,
        httpOnly: true,
      };
}

export function createAuth() {
  const db = createDb();
  const plugins = [];
  const googleOAuthCredentials = resolveGoogleOAuthCredentials(env);
  const googleSocialProvider = googleOAuthCredentials
    ? {
        google: {
          clientId: googleOAuthCredentials.clientId,
          clientSecret: googleOAuthCredentials.clientSecret,
          scope: googleEmailInboxScopes,
          accessType: "offline" as const,
          prompt: "select_account consent" as const,
        },
      }
    : undefined;

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
    socialProviders: googleSocialProvider,
    account: {
      encryptOAuthTokens: true,
      updateAccountOnSignIn: true,
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    advanced: {
      defaultCookieAttributes: defaultCookieAttributesForAuthUrl(env.BETTER_AUTH_URL),
    },
    plugins,
  });
}

export const auth = createAuth();

export async function getGoogleAuthAccountTokensForUser(
  userId: string,
): Promise<GoogleAuthAccountTokens | null> {
  const refreshed = await getRefreshedGoogleAuthAccountTokensForUser(userId);

  if (refreshed) {
    return refreshed;
  }

  return getCurrentGoogleAuthAccountTokensForUser(userId);
}

async function getRefreshedGoogleAuthAccountTokensForUser(
  userId: string,
): Promise<GoogleAuthAccountTokens | null> {
  try {
    const tokens = await auth.api.refreshToken({
      body: {
        providerId: "google",
        userId,
      },
    });

    if (!tokens.accessToken) {
      return null;
    }

    return googleAuthTokensFromRefreshResult(tokens);
  } catch {
    return null;
  }
}

async function getCurrentGoogleAuthAccountTokensForUser(
  userId: string,
): Promise<GoogleAuthAccountTokens | null> {
  try {
    const tokens = await auth.api.getAccessToken({
      body: {
        providerId: "google",
        userId,
      },
    });

    if (!tokens.accessToken) {
      return null;
    }

    return googleAuthTokensFromAccessTokenResult(tokens);
  } catch {
    return null;
  }
}
