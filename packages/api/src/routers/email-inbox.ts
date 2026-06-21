import { ORPCError } from "@orpc/server";
import {
  AppError,
  completeEmailInboxOAuth,
  connectEmailInboxFromProviderToken,
  createEmailInboxAuthorizationUrl,
  listEmailInboxWorkspace,
  requestEmailInboxSync,
  updateEmailInboxSettings,
  type DawnRepository,
  type EmailInboxOAuthStateCodec,
} from "@dawn/app";
import { RateLimitError } from "@dawn/app/rate-limit";
import type { GoogleAuthAccountTokens } from "@dawn/auth";
import { googleGmailReadonlyScope } from "@dawn/env/google-oauth";
import type {
  EmailInboxProviderName,
  EmailInboxTokenBundle,
  InboxConnector,
} from "@dawn/integrations";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { appRequestFromSession, type Context } from "../context";

const emailInboxProviderInput = z.enum(["mock-email-inbox", "gmail"]);

const emailInboxWorkspaceInput = z
  .object({
    teamId: z.string().min(1).optional(),
  })
  .optional();

const createEmailInboxAuthorizationUrlInput = z.object({
  teamId: z.string().min(1),
  provider: emailInboxProviderInput,
  redirectUrl: z.url(),
  loginHint: z.email().nullable().optional(),
});

const completeEmailInboxOAuthInput = z.object({
  teamId: z.string().min(1),
  provider: emailInboxProviderInput,
  code: z.string().min(1),
  redirectUrl: z.url(),
  state: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

const connectGoogleEmailInboxInput = z.object({
  teamId: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

const requestEmailInboxSyncInput = z.object({
  teamId: z.string().min(1),
  connectionId: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

const updateEmailInboxSettingsInput = requestEmailInboxSyncInput.extend({
  settings: z.object({
    senderBlocklist: z.array(z.email()).optional(),
    domainBlocklist: z.array(z.string().min(1)).optional(),
    senderAllowlist: z.array(z.email()).optional(),
    searchQuery: z.string().nullable().optional(),
    maxAttachmentBytes: z.number().int().positive().optional(),
  }),
});

function mapAppError(error: unknown): never {
  if (error instanceof RateLimitError) {
    throw new ORPCError("TOO_MANY_REQUESTS", { message: error.message });
  }

  if (error instanceof AppError) {
    throw new ORPCError(error.code, { message: error.message });
  }

  throw error;
}

function googleAuthTokensToEmailInboxBundle(
  tokens: GoogleAuthAccountTokens,
): EmailInboxTokenBundle {
  const scopes = tokens.scopes;

  if (!scopes.includes(googleGmailReadonlyScope)) {
    throw new AppError(
      "CONFLICT",
      "Google login is missing Gmail read-only access; sign in with Google again and grant Gmail access",
    );
  }

  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
    tokenType: "Bearer",
    scopes,
    rawPayload: {
      ...tokens.rawPayload,
      source: "better-auth-google-login",
      providerAccountId: tokens.providerAccountId,
    },
  };
}

async function dispatchEmailInboxOutbox(context: Pick<Context, "outboxDispatcher">) {
  if (!context.outboxDispatcher) {
    return null;
  }

  return await context.outboxDispatcher({ limit: 25 });
}

export type EmailInboxRouterDependencies = {
  dawnRepository: DawnRepository;
  emailInboxConnectors: readonly InboxConnector[];
  emailInboxOAuthStateCodec: EmailInboxOAuthStateCodec;
  googleAuthAccountTokensForUser: (userId: string) => Promise<GoogleAuthAccountTokens | null>;
};

export function createEmailInboxRouter({
  dawnRepository,
  emailInboxConnectors,
  emailInboxOAuthStateCodec,
  googleAuthAccountTokensForUser,
}: EmailInboxRouterDependencies) {
  return {
    list: protectedProcedure.input(emailInboxWorkspaceInput).handler(async ({ context, input }) => {
      try {
        return await listEmailInboxWorkspace(
          dawnRepository,
          emailInboxConnectors,
          appRequestFromSession(context, { teamId: input?.teamId }),
        );
      } catch (error) {
        mapAppError(error);
      }
    }),
    createAuthorizationUrl: protectedProcedure
      .input(createEmailInboxAuthorizationUrlInput)
      .handler(async ({ context, input }) => {
        try {
          return await createEmailInboxAuthorizationUrl(
            dawnRepository,
            emailInboxConnectors,
            emailInboxOAuthStateCodec,
            appRequestFromSession(context, { teamId: input.teamId }),
            {
              ...input,
              provider: input.provider as EmailInboxProviderName,
            },
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    completeOAuth: protectedProcedure
      .input(completeEmailInboxOAuthInput)
      .handler(async ({ context, input }) => {
        try {
          return await completeEmailInboxOAuth(
            dawnRepository,
            emailInboxConnectors,
            emailInboxOAuthStateCodec,
            appRequestFromSession(context, { teamId: input.teamId }),
            {
              ...input,
              provider: input.provider as EmailInboxProviderName,
            },
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    connectGoogleLogin: protectedProcedure
      .input(connectGoogleEmailInboxInput)
      .handler(async ({ context, input }) => {
        try {
          const googleTokens = await googleAuthAccountTokensForUser(context.session.user.id);

          if (!googleTokens) {
            throw new AppError(
              "CONFLICT",
              "Sign in with Google again and grant Gmail access before connecting Gmail",
            );
          }

          const connected = await connectEmailInboxFromProviderToken(
            dawnRepository,
            emailInboxConnectors,
            appRequestFromSession(context, { teamId: input.teamId }),
            {
              teamId: input.teamId,
              provider: "gmail",
              tokens: googleAuthTokensToEmailInboxBundle(googleTokens),
              idempotencyKey: input.idempotencyKey,
              source: "google_login",
            },
          );
          const syncRequest = await requestEmailInboxSync(
            dawnRepository,
            appRequestFromSession(context, { teamId: input.teamId }),
            {
              teamId: input.teamId,
              connectionId: connected.connection.id,
              idempotencyKey: `${input.idempotencyKey}:initial-sync`,
            },
          );
          const outboxDispatch = await dispatchEmailInboxOutbox(context);

          return { ...connected, syncRequest, outboxDispatch };
        } catch (error) {
          mapAppError(error);
        }
      }),
    requestSync: protectedProcedure
      .input(requestEmailInboxSyncInput)
      .handler(async ({ context, input }) => {
        try {
          const syncRequest = await requestEmailInboxSync(
            dawnRepository,
            appRequestFromSession(context, { teamId: input.teamId }),
            input,
          );
          const outboxDispatch = await dispatchEmailInboxOutbox(context);

          return { ...syncRequest, outboxDispatch };
        } catch (error) {
          mapAppError(error);
        }
      }),
    updateSettings: protectedProcedure
      .input(updateEmailInboxSettingsInput)
      .handler(async ({ context, input }) => {
        try {
          return await updateEmailInboxSettings(
            dawnRepository,
            appRequestFromSession(context, { teamId: input.teamId }),
            input,
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
  };
}
