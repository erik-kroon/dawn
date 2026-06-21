import { ORPCError } from "@orpc/server";
import {
  AppError,
  createDocumentDownload,
  createDocumentUpload,
  listDocuments,
  type DawnRepository,
  type DocumentUrlSigner,
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

const createDocumentUploadInput = z.object({
  teamId: z.string().min(1),
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  byteSize: z.number().int().positive(),
  checksumSha256: z.string().min(1).nullable().optional(),
  idempotencyKey: z.string().min(1),
});

const createDocumentDownloadInput = z.object({
  teamId: z.string().min(1),
  documentId: z.string().min(1),
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

export type DocumentsRouterDependencies = {
  dawnRepository: DawnRepository;
  documentUrlSigner: DocumentUrlSigner;
};

export function createDocumentsRouter({
  dawnRepository,
  documentUrlSigner,
}: DocumentsRouterDependencies) {
  return {
    list: protectedProcedure.input(teamContextInput).handler(async ({ context, input }) => {
      try {
        return await listDocuments(
          dawnRepository,
          appRequestFromSession(context, { teamId: input?.teamId }),
        );
      } catch (error) {
        mapAppError(error);
      }
    }),
    createUpload: protectedProcedure
      .input(createDocumentUploadInput)
      .handler(async ({ context, input }) => {
        try {
          return await createDocumentUpload(
            dawnRepository,
            documentUrlSigner,
            appRequestFromSession(context, { teamId: input.teamId }),
            {
              ...input,
              checksumSha256: input.checksumSha256 ?? null,
            },
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    download: protectedProcedure.input(createDocumentDownloadInput).handler(async ({ context, input }) => {
      try {
        return await createDocumentDownload(
          dawnRepository,
          documentUrlSigner,
          appRequestFromSession(context, { teamId: input.teamId }),
          input,
        );
      } catch (error) {
        mapAppError(error);
      }
    }),
  };
}
