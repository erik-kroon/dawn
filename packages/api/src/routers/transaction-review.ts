import { ORPCError } from "@orpc/server";
import {
  AppError,
  createAccountantPacketDownload,
  exportAccountantPacket,
  listAccountantPacketExportHistory,
  listTransactionReviewWorkspace,
  requestAccountantPacketExport,
  reviewTransaction,
  revokeAccountantPacketExport,
  sendAccountantPacketEmail,
  updateTransactionAccountantStatus,
  type AccountantPacketAttachmentResolver,
  type DocumentUrlSigner,
  type DawnRepository,
} from "@dawn/app";
import { RateLimitError } from "@dawn/app/rate-limit";
import type { AccountantPacketEmailDeliveryProvider } from "@dawn/integrations";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { appRequestFromSession } from "../context";

const teamContextInput = z
  .object({
    teamId: z.string().min(1).optional(),
  })
  .optional();

const reviewTransactionInput = z.object({
  teamId: z.string().min(1),
  transactionId: z.string().min(1),
  categoryId: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

const exportAccountantPacketInput = z.object({
  teamId: z.string().min(1),
  from: z.iso.datetime(),
  to: z.iso.datetime(),
  transactionIds: z.array(z.string().min(1)).optional(),
  formats: z.array(z.enum(["csv", "xlsx"])).optional(),
  csvDelimiter: z.enum([",", ";", "\t"]).optional(),
  idempotencyKey: z.string().min(1),
});

const createAccountantPacketDownloadInput = z.object({
  teamId: z.string().min(1),
  packetId: z.string().min(1),
});

const listAccountantPacketExportsInput = z.object({
  teamId: z.string().min(1),
  limit: z.number().int().min(1).max(100).optional(),
});

const revokeAccountantPacketExportInput = z.object({
  teamId: z.string().min(1),
  packetId: z.string().min(1),
  reason: z.string().trim().max(500).nullable().optional(),
  idempotencyKey: z.string().min(1),
});

const sendAccountantPacketEmailInput = z.object({
  teamId: z.string().min(1),
  packetId: z.string().min(1),
  toEmail: z.email(),
  subject: z.string().trim().max(200).nullable().optional(),
  message: z.string().trim().max(2_000).nullable().optional(),
  copyRequester: z.boolean().optional(),
  idempotencyKey: z.string().min(1),
});

const updateTransactionAccountantStatusInput = z.object({
  teamId: z.string().min(1),
  transactionId: z.string().min(1),
  action: z.enum([
    "exclude",
    "archive",
    "unarchive",
    "mark_exporting",
    "mark_exported",
    "mark_export_failed",
    "retry_export",
  ]),
  reason: z.string().trim().max(500).nullable().optional(),
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

export type TransactionReviewRouterDependencies = {
  dawnRepository: DawnRepository;
  documentUrlSigner: DocumentUrlSigner;
  accountantPacketAttachmentResolver?: AccountantPacketAttachmentResolver;
  accountantPacketEmailDeliveryProvider?: AccountantPacketEmailDeliveryProvider;
};

export function createTransactionReviewRouter({
  dawnRepository,
  documentUrlSigner,
  accountantPacketAttachmentResolver,
  accountantPacketEmailDeliveryProvider,
}: TransactionReviewRouterDependencies) {
  return {
    list: protectedProcedure.input(teamContextInput).handler(async ({ context, input }) => {
      try {
        return await listTransactionReviewWorkspace(
          dawnRepository,
          appRequestFromSession(context, { teamId: input?.teamId }),
        );
      } catch (error) {
        mapAppError(error);
      }
    }),
    review: protectedProcedure.input(reviewTransactionInput).handler(async ({ context, input }) => {
      try {
        return await reviewTransaction(
          dawnRepository,
          appRequestFromSession(context, { teamId: input.teamId }),
          input,
        );
      } catch (error) {
        mapAppError(error);
      }
    }),
    exportPacket: protectedProcedure
      .input(exportAccountantPacketInput)
      .handler(async ({ context, input }) => {
        try {
          return await exportAccountantPacket(
            dawnRepository,
            appRequestFromSession(context, { teamId: input.teamId }),
            {
              ...input,
              transactionIds: input.transactionIds ?? [],
            },
            accountantPacketAttachmentResolver,
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    requestPacketExport: protectedProcedure
      .input(exportAccountantPacketInput)
      .handler(async ({ context, input }) => {
        try {
          return await requestAccountantPacketExport(
            dawnRepository,
            appRequestFromSession(context, { teamId: input.teamId }),
            {
              ...input,
              transactionIds: input.transactionIds ?? [],
            },
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    createPacketDownload: protectedProcedure
      .input(createAccountantPacketDownloadInput)
      .handler(async ({ context, input }) => {
        try {
          return await createAccountantPacketDownload(
            dawnRepository,
            documentUrlSigner,
            appRequestFromSession(context, { teamId: input.teamId }),
            input,
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    listPacketExports: protectedProcedure
      .input(listAccountantPacketExportsInput)
      .handler(async ({ context, input }) => {
        try {
          return await listAccountantPacketExportHistory(
            dawnRepository,
            appRequestFromSession(context, { teamId: input.teamId }),
            input,
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    revokePacketExport: protectedProcedure
      .input(revokeAccountantPacketExportInput)
      .handler(async ({ context, input }) => {
        try {
          return await revokeAccountantPacketExport(
            dawnRepository,
            appRequestFromSession(context, { teamId: input.teamId }),
            input,
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    sendPacketEmail: protectedProcedure
      .input(sendAccountantPacketEmailInput)
      .handler(async ({ context, input }) => {
        try {
          if (!accountantPacketEmailDeliveryProvider) {
            throw new AppError("CONFLICT", "Accountant packet email delivery is not configured");
          }

          return await sendAccountantPacketEmail(
            dawnRepository,
            documentUrlSigner,
            accountantPacketEmailDeliveryProvider,
            appRequestFromSession(context, { teamId: input.teamId }),
            input,
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    updateAccountantStatus: protectedProcedure
      .input(updateTransactionAccountantStatusInput)
      .handler(async ({ context, input }) => {
        try {
          return await updateTransactionAccountantStatus(
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
