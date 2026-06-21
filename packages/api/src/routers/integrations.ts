import { ORPCError } from "@orpc/server";
import {
  AppError,
  completeFortnoxOAuth,
  connectIntegration,
  createFortnoxAuthorizationUrl,
  disableIntegration,
  disconnectFortnox,
  exportAccountingIntegration,
  listFortnoxCatalog,
  listIntegrationWorkspace,
  recordPaymentProviderEvent,
  sendIntegrationEmail,
  sendIntegrationMessage,
  syncIntegration,
  type DawnRepository,
  type FortnoxOAuthStateCodec,
} from "@dawn/app";
import { RateLimitError } from "@dawn/app/rate-limit";
import type { IntegrationProvider } from "@dawn/integrations";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { appRequestFromSession } from "../context";

const integrationProviderInput = z.enum([
  "fortnox",
  "mock-accounting",
  "mock-payments",
  "mock-messaging",
  "mock-email",
]);

const integrationWorkspaceInput = z
  .object({
    teamId: z.string().min(1).optional(),
  })
  .optional();

const connectIntegrationInput = z.object({
  teamId: z.string().min(1),
  provider: integrationProviderInput,
  idempotencyKey: z.string().min(1),
});

const syncIntegrationInput = z.object({
  teamId: z.string().min(1),
  connectionId: z.string().min(1),
  syncMode: z.enum(["initial", "incremental"]).optional(),
  cursor: z.record(z.string(), z.unknown()).nullable().optional(),
  idempotencyKey: z.string().min(1),
});

const exportAccountingIntegrationInput = syncIntegrationInput.extend({
  exportType: z.enum(["transactions", "invoices"]),
});

const recordPaymentProviderEventInput = syncIntegrationInput.extend({
  rawPayload: z.record(z.string(), z.unknown()),
});

const sendIntegrationMessageInput = syncIntegrationInput.extend({
  channel: z.string().min(1),
  text: z.string().min(1),
  confirm: z.literal(true),
});

const sendIntegrationEmailInput = syncIntegrationInput.extend({
  to: z.email(),
  subject: z.string().min(1),
  text: z.string().min(1),
  confirm: z.literal(true),
});

const disableIntegrationInput = z.object({
  teamId: z.string().min(1),
  connectionId: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

const fortnoxCatalogInput = z.object({
  teamId: z.string().min(1),
  connectionId: z.string().min(1),
});

const createFortnoxAuthorizationUrlInput = z.object({
  teamId: z.string().min(1),
  redirectUrl: z.url(),
});

const completeFortnoxOAuthInput = z.object({
  teamId: z.string().min(1),
  code: z.string().min(1),
  redirectUrl: z.url(),
  state: z.string().min(1),
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

export type IntegrationsRouterDependencies = {
  dawnRepository: DawnRepository;
  integrationProviders: readonly IntegrationProvider[];
  fortnoxOAuthStateCodec: FortnoxOAuthStateCodec;
};

export function createIntegrationsRouter({
  dawnRepository,
  integrationProviders,
  fortnoxOAuthStateCodec,
}: IntegrationsRouterDependencies) {
  return {
    list: protectedProcedure.input(integrationWorkspaceInput).handler(async ({ context, input }) => {
      try {
        return await listIntegrationWorkspace(
          dawnRepository,
          integrationProviders,
          appRequestFromSession(context, { teamId: input?.teamId }),
        );
      } catch (error) {
        mapAppError(error);
      }
    }),
    connect: protectedProcedure.input(connectIntegrationInput).handler(async ({ context, input }) => {
      try {
        return await connectIntegration(
          dawnRepository,
          integrationProviders,
          appRequestFromSession(context, { teamId: input.teamId }),
          input,
        );
      } catch (error) {
        mapAppError(error);
      }
    }),
    createFortnoxAuthorizationUrl: protectedProcedure
      .input(createFortnoxAuthorizationUrlInput)
      .handler(async ({ context, input }) => {
        try {
          return await createFortnoxAuthorizationUrl(
            dawnRepository,
            integrationProviders,
            fortnoxOAuthStateCodec,
            appRequestFromSession(context, { teamId: input.teamId }),
            input,
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    completeFortnoxOAuth: protectedProcedure
      .input(completeFortnoxOAuthInput)
      .handler(async ({ context, input }) => {
        try {
          return await completeFortnoxOAuth(
            dawnRepository,
            integrationProviders,
            fortnoxOAuthStateCodec,
            appRequestFromSession(context, { teamId: input.teamId }),
            input,
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    sync: protectedProcedure.input(syncIntegrationInput).handler(async ({ context, input }) => {
      try {
        return await syncIntegration(
          dawnRepository,
          integrationProviders,
          appRequestFromSession(context, { teamId: input.teamId }),
          input,
        );
      } catch (error) {
        mapAppError(error);
      }
    }),
    exportAccounting: protectedProcedure
      .input(exportAccountingIntegrationInput)
      .handler(async ({ context, input }) => {
        try {
          return await exportAccountingIntegration(
            dawnRepository,
            integrationProviders,
            appRequestFromSession(context, { teamId: input.teamId }),
            input,
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    recordPaymentEvent: protectedProcedure
      .input(recordPaymentProviderEventInput)
      .handler(async ({ context, input }) => {
        try {
          return await recordPaymentProviderEvent(
            dawnRepository,
            integrationProviders,
            appRequestFromSession(context, { teamId: input.teamId }),
            input,
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    sendMessage: protectedProcedure
      .input(sendIntegrationMessageInput)
      .handler(async ({ context, input }) => {
        try {
          return await sendIntegrationMessage(
            dawnRepository,
            integrationProviders,
            appRequestFromSession(context, { teamId: input.teamId }),
            input,
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    sendEmail: protectedProcedure.input(sendIntegrationEmailInput).handler(async ({ context, input }) => {
      try {
        return await sendIntegrationEmail(
          dawnRepository,
          integrationProviders,
          appRequestFromSession(context, { teamId: input.teamId }),
          input,
        );
      } catch (error) {
        mapAppError(error);
      }
    }),
    disable: protectedProcedure.input(disableIntegrationInput).handler(async ({ context, input }) => {
      try {
        return await disableIntegration(
          dawnRepository,
          appRequestFromSession(context, { teamId: input.teamId }),
          input,
        );
      } catch (error) {
        mapAppError(error);
      }
    }),
    fortnoxCatalog: protectedProcedure.input(fortnoxCatalogInput).handler(async ({ context, input }) => {
      try {
        return await listFortnoxCatalog(
          dawnRepository,
          appRequestFromSession(context, { teamId: input.teamId }),
          input,
        );
      } catch (error) {
        mapAppError(error);
      }
    }),
    disconnectFortnox: protectedProcedure
      .input(disableIntegrationInput)
      .handler(async ({ context, input }) => {
        try {
          return await disconnectFortnox(
            dawnRepository,
            integrationProviders,
            appRequestFromSession(context, { teamId: input.teamId }),
            input,
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
  };
}
