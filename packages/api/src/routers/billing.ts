import { ORPCError } from "@orpc/server";
import {
  AppError,
  createCustomer,
  createDraftInvoice,
  createProduct,
  createRecurringInvoiceSchedule,
  listBillingWorkspace,
  previewInvoicePdf,
  recordInvoicePayment,
  sendInvoice,
  sendInvoiceReminder,
  updateDraftInvoice,
  type DawnRepository,
  type InvoicePdfRenderer,
} from "@dawn/app";
import { RateLimitError } from "@dawn/app/rate-limit";
import type { InvoiceEmailDeliveryProvider } from "@dawn/integrations";
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

const createCustomerInput = z.object({
  teamId: z.string().min(1),
  name: z.string().min(1),
  email: z.string().nullable().optional(),
  billingAddress: z.string().nullable().optional(),
  contactName: z.string().nullable().optional(),
  contactEmail: z.string().nullable().optional(),
  contactRole: z.string().nullable().optional(),
  idempotencyKey: z.string().min(1),
});

const createProductInput = z.object({
  teamId: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["product", "service"]),
  description: z.string().nullable().optional(),
  unitPrice: moneyInput,
  defaultTaxRateBasisPoints: z.number().int().min(0).max(10_000).nullable().optional(),
  idempotencyKey: z.string().min(1),
});

const invoiceLineInput = z.object({
  productId: z.string().min(1).nullable().optional(),
  description: z.string().min(1),
  quantityMilli: z.number().int().positive(),
  unitPrice: moneyInput,
  discountBasisPoints: z.number().int().min(0).max(10_000).nullable().optional(),
  taxRateBasisPoints: z.number().int().min(0).max(10_000).nullable().optional(),
});

const createDraftInvoiceInput = z.object({
  teamId: z.string().min(1),
  customerId: z.string().min(1),
  invoiceNumber: z.string().min(1),
  issueDate: z.iso.datetime(),
  dueDate: z.iso.datetime().nullable().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  discountBasisPoints: z.number().int().min(0).max(10_000).nullable().optional(),
  notes: z.string().nullable().optional(),
  lines: z.array(invoiceLineInput).min(1),
  idempotencyKey: z.string().min(1),
});

const updateDraftInvoiceInput = createDraftInvoiceInput.extend({
  invoiceId: z.string().min(1),
});

const invoiceReferenceInput = z.object({
  teamId: z.string().min(1),
  invoiceId: z.string().min(1),
});

const sendInvoiceInput = invoiceReferenceInput.extend({
  toEmail: z.string().nullable().optional(),
  subject: z.string().nullable().optional(),
  message: z.string().nullable().optional(),
  confirm: z.literal(true),
  idempotencyKey: z.string().min(1),
});

const sendInvoiceReminderInput = sendInvoiceInput;

const recordInvoicePaymentInput = invoiceReferenceInput.extend({
  amount: moneyInput,
  paidAt: z.iso.datetime(),
  method: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  idempotencyKey: z.string().min(1),
});

const createRecurringInvoiceScheduleInput = z.object({
  teamId: z.string().min(1),
  sourceInvoiceId: z.string().min(1),
  frequency: z.enum(["weekly", "monthly", "quarterly", "yearly"]),
  nextRunAt: z.iso.datetime(),
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

export type BillingRouterDependencies = {
  dawnRepository: DawnRepository;
  invoicePdfRenderer: InvoicePdfRenderer;
  invoiceEmailDeliveryProvider: InvoiceEmailDeliveryProvider;
};

export function createBillingRouter({
  dawnRepository,
  invoicePdfRenderer,
  invoiceEmailDeliveryProvider,
}: BillingRouterDependencies) {
  return {
    list: protectedProcedure.input(teamContextInput).handler(async ({ context, input }) => {
      try {
        return await listBillingWorkspace(
          dawnRepository,
          appRequestFromSession(context, { teamId: input?.teamId }),
        );
      } catch (error) {
        mapAppError(error);
      }
    }),
    createCustomer: protectedProcedure
      .input(createCustomerInput)
      .handler(async ({ context, input }) => {
        try {
          return await createCustomer(
            dawnRepository,
            appRequestFromSession(context, { teamId: input.teamId }),
            {
              ...input,
              email: input.email ?? null,
              billingAddress: input.billingAddress ?? null,
              contactName: input.contactName ?? null,
              contactEmail: input.contactEmail ?? null,
              contactRole: input.contactRole ?? null,
            },
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    createProduct: protectedProcedure.input(createProductInput).handler(async ({ context, input }) => {
      try {
        return await createProduct(
          dawnRepository,
          appRequestFromSession(context, { teamId: input.teamId }),
          {
            ...input,
            description: input.description ?? null,
            defaultTaxRateBasisPoints: input.defaultTaxRateBasisPoints ?? 0,
          },
        );
      } catch (error) {
        mapAppError(error);
      }
    }),
    createDraftInvoice: protectedProcedure
      .input(createDraftInvoiceInput)
      .handler(async ({ context, input }) => {
        try {
          return await createDraftInvoice(
            dawnRepository,
            appRequestFromSession(context, { teamId: input.teamId }),
            {
              ...input,
              dueDate: input.dueDate ?? null,
              discountBasisPoints: input.discountBasisPoints ?? 0,
              notes: input.notes ?? null,
              lines: input.lines.map((line) => ({
                ...line,
                productId: line.productId ?? null,
                discountBasisPoints: line.discountBasisPoints ?? 0,
                taxRateBasisPoints: line.taxRateBasisPoints ?? 0,
              })),
            },
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    updateDraftInvoice: protectedProcedure
      .input(updateDraftInvoiceInput)
      .handler(async ({ context, input }) => {
        try {
          return await updateDraftInvoice(
            dawnRepository,
            appRequestFromSession(context, { teamId: input.teamId }),
            {
              ...input,
              dueDate: input.dueDate ?? null,
              discountBasisPoints: input.discountBasisPoints ?? 0,
              notes: input.notes ?? null,
              lines: input.lines.map((line) => ({
                ...line,
                productId: line.productId ?? null,
                discountBasisPoints: line.discountBasisPoints ?? 0,
                taxRateBasisPoints: line.taxRateBasisPoints ?? 0,
              })),
            },
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    previewInvoicePdf: protectedProcedure
      .input(invoiceReferenceInput)
      .handler(async ({ context, input }) => {
        try {
          return await previewInvoicePdf(
            dawnRepository,
            invoicePdfRenderer,
            appRequestFromSession(context, { teamId: input.teamId }),
            input,
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    sendInvoice: protectedProcedure.input(sendInvoiceInput).handler(async ({ context, input }) => {
      try {
        return await sendInvoice(
          dawnRepository,
          invoicePdfRenderer,
          invoiceEmailDeliveryProvider,
          appRequestFromSession(context, { teamId: input.teamId }),
          {
            ...input,
            toEmail: input.toEmail ?? null,
            subject: input.subject ?? null,
            message: input.message ?? null,
          },
        );
      } catch (error) {
        mapAppError(error);
      }
    }),
    sendReminder: protectedProcedure
      .input(sendInvoiceReminderInput)
      .handler(async ({ context, input }) => {
        try {
          return await sendInvoiceReminder(
            dawnRepository,
            invoicePdfRenderer,
            invoiceEmailDeliveryProvider,
            appRequestFromSession(context, { teamId: input.teamId }),
            {
              ...input,
              toEmail: input.toEmail ?? null,
              subject: input.subject ?? null,
              message: input.message ?? null,
            },
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    recordPayment: protectedProcedure
      .input(recordInvoicePaymentInput)
      .handler(async ({ context, input }) => {
        try {
          return await recordInvoicePayment(
            dawnRepository,
            appRequestFromSession(context, { teamId: input.teamId }),
            {
              ...input,
              method: input.method ?? null,
              note: input.note ?? null,
            },
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    createRecurringSchedule: protectedProcedure
      .input(createRecurringInvoiceScheduleInput)
      .handler(async ({ context, input }) => {
        try {
          return await createRecurringInvoiceSchedule(
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
