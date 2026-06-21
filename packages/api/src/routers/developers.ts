import { ORPCError } from "@orpc/server";
import {
  AppError,
  createApiKey,
  createOAuthApp,
  createWebhookSubscription,
  grantOAuthConsent,
  listDeveloperWorkspace,
  previewOAuthConsent,
  type DawnRepository,
} from "@dawn/app";
import { RateLimitError } from "@dawn/app/rate-limit";
import { publicApiScopes } from "@dawn/domain";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { appRequestFromSession } from "../context";

const publicApiScopeInput = z.enum(publicApiScopes);

const developerWorkspaceInput = z
  .object({
    teamId: z.string().min(1).optional(),
  })
  .optional();

const createApiKeyInput = z.object({
  teamId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  scopes: z.array(publicApiScopeInput).min(1),
  idempotencyKey: z.string().min(1),
});

const createOAuthAppInput = z.object({
  teamId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  redirectUris: z.array(z.url()).min(1),
  scopes: z.array(publicApiScopeInput).min(1),
  idempotencyKey: z.string().min(1),
});

const oauthConsentInput = z.object({
  teamId: z.string().min(1),
  appId: z.string().min(1),
  redirectUri: z.url(),
  scopes: z.array(publicApiScopeInput).min(1),
});

const grantOAuthConsentInput = oauthConsentInput.extend({
  idempotencyKey: z.string().min(1),
});

const createWebhookSubscriptionInput = z.object({
  teamId: z.string().min(1),
  url: z.url(),
  eventTypes: z.array(z.string().trim().min(1).max(120)).min(1),
  idempotencyKey: z.string().min(1),
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

export type DevelopersRouterDependencies = {
  dawnRepository: DawnRepository;
};

export function createDevelopersRouter({ dawnRepository }: DevelopersRouterDependencies) {
  return {
    list: protectedProcedure.input(developerWorkspaceInput).handler(async ({ context, input }) => {
      try {
        return await listDeveloperWorkspace(
          dawnRepository,
          appRequestFromSession(context, { teamId: input?.teamId }),
        );
      } catch (error) {
        mapAppError(error);
      }
    }),
    createApiKey: protectedProcedure.input(createApiKeyInput).handler(async ({ context, input }) => {
      try {
        return await createApiKey(
          dawnRepository,
          appRequestFromSession(context, { teamId: input.teamId }),
          input,
        );
      } catch (error) {
        mapAppError(error);
      }
    }),
    createOAuthApp: protectedProcedure.input(createOAuthAppInput).handler(async ({ context, input }) => {
      try {
        return await createOAuthApp(
          dawnRepository,
          appRequestFromSession(context, { teamId: input.teamId }),
          input,
        );
      } catch (error) {
        mapAppError(error);
      }
    }),
    previewOAuthConsent: protectedProcedure.input(oauthConsentInput).handler(async ({ context, input }) => {
      try {
        return await previewOAuthConsent(
          dawnRepository,
          appRequestFromSession(context, { teamId: input.teamId }),
          input,
        );
      } catch (error) {
        mapAppError(error);
      }
    }),
    grantOAuthConsent: protectedProcedure
      .input(grantOAuthConsentInput)
      .handler(async ({ context, input }) => {
        try {
          return await grantOAuthConsent(
            dawnRepository,
            appRequestFromSession(context, { teamId: input.teamId }),
            input,
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    createWebhookSubscription: protectedProcedure
      .input(createWebhookSubscriptionInput)
      .handler(async ({ context, input }) => {
        try {
          return await createWebhookSubscription(
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
