import { ORPCError } from "@orpc/server";
import {
  AppError,
  createInvoiceFromTimeEntries,
  createProject,
  createTimeEntry,
  listProjectWorkspace,
  type DawnRepository,
} from "@dawn/app";
import { RateLimitError } from "@dawn/app/rate-limit";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { appRequestFromSession } from "../context";

const moneyInput = z.object({
  amountMinor: z.number().int(),
  currency: z.string().regex(/^[A-Z]{3}$/),
});

const teamContextInput = z
  .object({
    teamId: z.string().min(1).optional(),
  })
  .optional();

const createProjectInput = z.object({
  teamId: z.string().min(1),
  customerId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  billableRate: moneyInput,
  idempotencyKey: z.string().min(1),
});

const createTimeEntryInput = z.object({
  teamId: z.string().min(1),
  projectId: z.string().min(1),
  actorId: z.string().min(1).nullable().optional(),
  description: z.string().min(1),
  occurredOn: z.iso.datetime(),
  durationMinutes: z.number().int().positive(),
  billableStatus: z.enum(["billable", "non_billable"]),
  billableRate: moneyInput.nullable().optional(),
  idempotencyKey: z.string().min(1),
});

const createInvoiceFromTimeEntriesInput = z.object({
  teamId: z.string().min(1),
  customerId: z.string().min(1),
  invoiceNumber: z.string().min(1),
  issueDate: z.iso.datetime(),
  dueDate: z.iso.datetime().nullable().optional(),
  timeEntryIds: z.array(z.string().min(1)).min(1),
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

export type ProjectsRouterDependencies = {
  dawnRepository: DawnRepository;
};

export function createProjectsRouter({ dawnRepository }: ProjectsRouterDependencies) {
  return {
    list: protectedProcedure.input(teamContextInput).handler(async ({ context, input }) => {
      try {
        return await listProjectWorkspace(
          dawnRepository,
          appRequestFromSession(context, { teamId: input?.teamId }),
        );
      } catch (error) {
        mapAppError(error);
      }
    }),
    createProject: protectedProcedure.input(createProjectInput).handler(async ({ context, input }) => {
      try {
        return await createProject(
          dawnRepository,
          appRequestFromSession(context, { teamId: input.teamId }),
          {
            ...input,
            description: input.description ?? null,
          },
        );
      } catch (error) {
        mapAppError(error);
      }
    }),
    createTimeEntry: protectedProcedure
      .input(createTimeEntryInput)
      .handler(async ({ context, input }) => {
        try {
          return await createTimeEntry(
            dawnRepository,
            appRequestFromSession(context, { teamId: input.teamId }),
            {
              ...input,
              actorId: input.actorId ?? null,
              billableRate: input.billableRate ?? null,
            },
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    createInvoiceFromTimeEntries: protectedProcedure
      .input(createInvoiceFromTimeEntriesInput)
      .handler(async ({ context, input }) => {
        try {
          return await createInvoiceFromTimeEntries(
            dawnRepository,
            appRequestFromSession(context, { teamId: input.teamId }),
            {
              ...input,
              dueDate: input.dueDate ?? null,
            },
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
  };
}
