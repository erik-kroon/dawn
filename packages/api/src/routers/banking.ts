import { ORPCError } from "@orpc/server";
import {
  AppError,
  completeBankConnection,
  connectMockBankConnection,
  createBankConnectionSession,
  disconnectBankConnection,
  listBankConnections,
  syncBankConnection,
  type BankingProviderRegistry,
  type DawnRepository,
} from "@dawn/app";
import { RateLimitError } from "@dawn/app/rate-limit";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { appRequestFromSession } from "../context";

const teamContextInput = z
  .object({
    teamId: z.string().min(1).optional(),
  })
  .optional();

const bankConnectionInput = z.object({
  teamId: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

const bankProviderInput = z.enum(["mock-bank", "sandbox-bank"]);

const createBankConnectionSessionInput = z.object({
  teamId: z.string().min(1),
  provider: bankProviderInput,
  redirectUrl: z.url(),
  idempotencyKey: z.string().min(1),
});

const completeBankConnectionInput = z.object({
  teamId: z.string().min(1),
  provider: bankProviderInput,
  providerSessionId: z.string().min(1),
  publicToken: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

const syncBankConnectionInput = z.object({
  teamId: z.string().min(1),
  connectionId: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

const disconnectBankConnectionInput = syncBankConnectionInput;

function mapAppError(error: unknown): never {
  if (error instanceof RateLimitError) {
    throw new ORPCError("TOO_MANY_REQUESTS", { message: error.message });
  }

  if (error instanceof AppError) {
    throw new ORPCError(error.code, { message: error.message });
  }

  throw error;
}

export type BankingRouterDependencies = {
  dawnRepository: DawnRepository;
  bankingProviderRegistry: BankingProviderRegistry;
};

export function createBankingRouter({
  dawnRepository,
  bankingProviderRegistry,
}: BankingRouterDependencies) {
  return {
    list: protectedProcedure.input(teamContextInput).handler(async ({ context, input }) => {
      try {
        return await listBankConnections(
          dawnRepository,
          bankingProviderRegistry,
          appRequestFromSession(context, { teamId: input?.teamId }),
          input,
        );
      } catch (error) {
        mapAppError(error);
      }
    }),
    connectMock: protectedProcedure.input(bankConnectionInput).handler(async ({ context, input }) => {
      try {
        return await connectMockBankConnection(
          dawnRepository,
          bankingProviderRegistry,
          appRequestFromSession(context, { teamId: input.teamId }),
          input,
        );
      } catch (error) {
        mapAppError(error);
      }
    }),
    createSession: protectedProcedure
      .input(createBankConnectionSessionInput)
      .handler(async ({ context, input }) => {
        try {
          return await createBankConnectionSession(
            dawnRepository,
            bankingProviderRegistry,
            appRequestFromSession(context, { teamId: input.teamId }),
            input,
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    complete: protectedProcedure
      .input(completeBankConnectionInput)
      .handler(async ({ context, input }) => {
        try {
          return await completeBankConnection(
            dawnRepository,
            bankingProviderRegistry,
            appRequestFromSession(context, { teamId: input.teamId }),
            input,
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    sync: protectedProcedure.input(syncBankConnectionInput).handler(async ({ context, input }) => {
      try {
        return await syncBankConnection(
          dawnRepository,
          bankingProviderRegistry,
          appRequestFromSession(context, { teamId: input.teamId }),
          input,
        );
      } catch (error) {
        mapAppError(error);
      }
    }),
    disconnect: protectedProcedure
      .input(disconnectBankConnectionInput)
      .handler(async ({ context, input }) => {
        try {
          return await disconnectBankConnection(
            dawnRepository,
            bankingProviderRegistry,
            appRequestFromSession(context, { teamId: input.teamId }),
            input,
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
  };
}
