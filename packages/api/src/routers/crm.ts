import { ORPCError } from "@orpc/server";
import {
  AppError,
  archiveAccount as archiveCrmAccount,
  archiveContact as archiveCrmContact,
  archiveOpportunity as archiveCrmOpportunity,
  createAccount as createCrmAccount,
  createContact as createCrmContact,
  createFieldDefinition as createCrmFieldDefinition,
  createLegalEntity as createCrmLegalEntity,
  createObjectTypeDefinition as createCrmObjectTypeDefinition,
  createOpportunity as createCrmOpportunity,
  createOrganization as createCrmOrganization,
  getAccountSummary as getCrmAccountSummary,
  linkAccountProviderCustomer as linkCrmAccountProviderCustomer,
  listAccountTimeline as listCrmAccountTimeline,
  listAccounts as listCrmAccounts,
  setRecordFieldValue as setCrmRecordFieldValue,
  suggestAccountDuplicates as suggestCrmAccountDuplicates,
  updateAccount as updateCrmAccount,
  updateContact as updateCrmContact,
  updateOpportunity as updateCrmOpportunity,
  updateOpportunityStage as updateCrmOpportunityStage,
  type DawnRepository,
} from "@dawn/app";
import { RateLimitError } from "@dawn/app/rate-limit";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { appRequestFromSession } from "../context";

const crmCreateOrganizationInput = z.object({
  teamId: z.string().min(1),
  legalName: z.string().min(1),
  displayName: z.string().nullable().optional(),
  organizationNumber: z.string().nullable().optional(),
  countryCode: z.string().nullable().optional(),
  vatNumber: z.string().nullable().optional(),
  websiteDomain: z.string().nullable().optional(),
  idempotencyKey: z.string().min(1),
});

const crmCreateLegalEntityInput = z.object({
  teamId: z.string().min(1),
  legalName: z.string().min(1),
  organizationNumber: z.string().nullable().optional(),
  vatNumber: z.string().nullable().optional(),
  countryCode: z.string().nullable().optional(),
  baseCurrency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullable()
    .optional(),
  fiscalYearStartMonth: z.number().int().min(1).max(12).nullable().optional(),
  status: z.enum(["active", "inactive"]).optional(),
  idempotencyKey: z.string().min(1),
});

const crmCreateAccountInput = z.object({
  teamId: z.string().min(1),
  organizationId: z.string().min(1),
  accountType: z
    .enum(["prospect", "customer", "partner", "supplier", "former_customer"])
    .optional(),
  legalEntityId: z.string().nullable().optional(),
  relationshipStatus: z.enum(["active", "churned", "inactive"]).optional(),
  lifecycleStage: z
    .enum(["new", "qualified", "active", "growth", "at_risk", "churned", "inactive"])
    .nullable()
    .optional(),
  segment: z.string().nullable().optional(),
  territory: z.string().nullable().optional(),
  primaryOwnerPrincipalId: z.string().nullable().optional(),
  customerSince: z.iso.datetime().nullable().optional(),
  churnedAt: z.iso.datetime().nullable().optional(),
  idempotencyKey: z.string().min(1),
});

const crmUpdateAccountInput = z.object({
  teamId: z.string().min(1),
  accountId: z.string().min(1),
  accountType: z
    .enum(["prospect", "customer", "partner", "supplier", "former_customer"])
    .optional(),
  legalEntityId: z.string().nullable().optional(),
  relationshipStatus: z.enum(["active", "churned", "inactive"]).optional(),
  lifecycleStage: z
    .enum(["new", "qualified", "active", "growth", "at_risk", "churned", "inactive"])
    .nullable()
    .optional(),
  segment: z.string().nullable().optional(),
  territory: z.string().nullable().optional(),
  primaryOwnerPrincipalId: z.string().nullable().optional(),
  customerSince: z.iso.datetime().nullable().optional(),
  churnedAt: z.iso.datetime().nullable().optional(),
  expectedRecordVersion: z.number().int().positive(),
  idempotencyKey: z.string().min(1),
});

const crmSuggestAccountDuplicatesInput = z.object({
  teamId: z.string().min(1),
  legalName: z.string().min(1),
  organizationNumber: z.string().nullable().optional(),
  limit: z.number().int().min(1).max(25).nullable().optional(),
});

const crmCreateContactInput = z.object({
  teamId: z.string().min(1),
  accountId: z.string().min(1),
  givenName: z.string().nullable().optional(),
  familyName: z.string().nullable().optional(),
  displayName: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phoneNumber: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  isPrimary: z.boolean().nullable().optional(),
  idempotencyKey: z.string().min(1),
});

const crmUpdateContactInput = z.object({
  teamId: z.string().min(1),
  contactId: z.string().min(1),
  givenName: z.string().nullable().optional(),
  familyName: z.string().nullable().optional(),
  displayName: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phoneNumber: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  isPrimary: z.boolean().nullable().optional(),
  expectedRecordVersion: z.number().int().positive(),
  idempotencyKey: z.string().min(1),
});

const crmLinkAccountFortnoxCustomerInput = z.object({
  teamId: z.string().min(1),
  accountId: z.string().min(1),
  connectionId: z.string().min(1),
  providerCustomerId: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

const crmCreateOpportunityInput = z.object({
  teamId: z.string().min(1),
  accountId: z.string().min(1),
  name: z.string().min(1),
  amountMinor: z.number().int(),
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  stage: z
    .enum([
      "new",
      "qualified",
      "proposal_preparation",
      "proposal_sent",
      "negotiation",
      "won_pending_invoice",
      "won",
      "lost",
      "archived",
    ])
    .nullable()
    .optional(),
  expectedCloseDate: z.iso.datetime().nullable().optional(),
  primaryOwnerPrincipalId: z.string().nullable().optional(),
  idempotencyKey: z.string().min(1),
});

const crmUpdateOpportunityInput = z.object({
  teamId: z.string().min(1),
  opportunityId: z.string().min(1),
  name: z.string().min(1).optional(),
  amountMinor: z.number().int().optional(),
  currencyCode: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  expectedCloseDate: z.iso.datetime().nullable().optional(),
  primaryOwnerPrincipalId: z.string().nullable().optional(),
  expectedRecordVersion: z.number().int().positive(),
  idempotencyKey: z.string().min(1),
});

const crmUpdateOpportunityStageInput = z.object({
  teamId: z.string().min(1),
  opportunityId: z.string().min(1),
  stage: z.enum([
    "new",
    "qualified",
    "proposal_preparation",
    "proposal_sent",
    "negotiation",
    "won_pending_invoice",
    "won",
    "lost",
    "archived",
  ]),
  expectedRecordVersion: z.number().int().positive(),
  idempotencyKey: z.string().min(1),
});

const crmArchiveAccountInput = z.object({
  teamId: z.string().min(1),
  accountId: z.string().min(1),
  expectedRecordVersion: z.number().int().positive(),
  idempotencyKey: z.string().min(1),
});

const crmArchiveContactInput = z.object({
  teamId: z.string().min(1),
  contactId: z.string().min(1),
  expectedRecordVersion: z.number().int().positive(),
  idempotencyKey: z.string().min(1),
});

const crmArchiveOpportunityInput = z.object({
  teamId: z.string().min(1),
  opportunityId: z.string().min(1),
  expectedRecordVersion: z.number().int().positive(),
  idempotencyKey: z.string().min(1),
});

const crmFieldValueInput = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"),
    value: z.string(),
  }),
  z.object({
    type: z.literal("integer"),
    value: z.number().int(),
  }),
  z.object({
    type: z.literal("boolean"),
    value: z.boolean(),
  }),
  z.object({
    type: z.literal("date"),
    value: z.string().min(1),
  }),
  z.object({
    type: z.literal("money"),
    amountMinor: z.number().int(),
    currencyCode: z.string().regex(/^[A-Z]{3}$/),
  }),
  z.object({
    type: z.literal("single_option"),
    optionValueId: z.string().nullable().optional(),
    stableKey: z.string().nullable().optional(),
  }),
  z.object({
    type: z.literal("record_reference"),
    recordId: z.string().min(1),
  }),
]);

const crmCreateObjectTypeDefinitionInput = z.object({
  teamId: z.string().min(1),
  objectTypeId: z.string().min(1),
  label: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

const crmCreateFieldDefinitionInput = z.object({
  teamId: z.string().min(1),
  objectTypeId: z.string().min(1),
  stableKey: z.string().min(1),
  label: z.string().min(1),
  fieldType: z.enum([
    "text",
    "integer",
    "boolean",
    "date",
    "money",
    "single_option",
    "record_reference",
  ]),
  cardinality: z.enum(["single", "many"]).nullable().optional(),
  isRequired: z.boolean().nullable().optional(),
  isUnique: z.boolean().nullable().optional(),
  allowedReferenceObjectTypeId: z.string().nullable().optional(),
  options: z
    .array(
      z.object({
        stableKey: z.string().min(1),
        label: z.string().min(1),
        sortOrder: z.number().int().min(0).nullable().optional(),
      }),
    )
    .optional(),
  idempotencyKey: z.string().min(1),
});

const crmSetRecordFieldValueInput = z.object({
  teamId: z.string().min(1),
  recordId: z.string().min(1),
  fieldDefinitionId: z.string().min(1),
  value: crmFieldValueInput,
  expectedRecordVersion: z.number().int().positive(),
  idempotencyKey: z.string().min(1),
});

const crmAccountSummaryInput = z.object({
  teamId: z.string().min(1),
  accountId: z.string().min(1),
});

const crmAccountTimelineInput = z.object({
  teamId: z.string().min(1),
  accountId: z.string().min(1),
  limit: z.number().int().min(1).max(100).nullable().optional(),
});

const crmListAccountsInput = z.object({
  teamId: z.string().min(1),
  legalEntityId: z.string().nullable().optional(),
  relationshipStatus: z.enum(["active", "churned", "inactive"]).nullable().optional(),
  accountType: z
    .enum(["prospect", "customer", "partner", "supplier", "former_customer"])
    .nullable()
    .optional(),
  customFieldFilter: z
    .object({
      fieldDefinitionId: z.string().min(1),
      value: crmFieldValueInput,
    })
    .nullable()
    .optional(),
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

export type CrmRouterDependencies = {
  dawnRepository: DawnRepository;
};

export function createCrmRouter({ dawnRepository }: CrmRouterDependencies) {
  return {
    createObjectTypeDefinition: protectedProcedure
      .input(crmCreateObjectTypeDefinitionInput)
      .handler(async ({ context, input }) => {
        try {
          return await createCrmObjectTypeDefinition(
            dawnRepository,
            appRequestFromSession(context, {
              teamId: input.teamId,
              idempotencyKey: input.idempotencyKey,
            }),
            input,
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    createFieldDefinition: protectedProcedure
      .input(crmCreateFieldDefinitionInput)
      .handler(async ({ context, input }) => {
        try {
          return await createCrmFieldDefinition(
            dawnRepository,
            appRequestFromSession(context, {
              teamId: input.teamId,
              idempotencyKey: input.idempotencyKey,
            }),
            {
              ...input,
              cardinality: input.cardinality ?? "single",
              isRequired: input.isRequired ?? false,
              isUnique: input.isUnique ?? false,
              allowedReferenceObjectTypeId: input.allowedReferenceObjectTypeId ?? null,
              options: input.options ?? [],
            },
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    setRecordFieldValue: protectedProcedure
      .input(crmSetRecordFieldValueInput)
      .handler(async ({ context, input }) => {
        try {
          return await setCrmRecordFieldValue(
            dawnRepository,
            appRequestFromSession(context, {
              teamId: input.teamId,
              idempotencyKey: input.idempotencyKey,
            }),
            input,
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    createOrganization: protectedProcedure
      .input(crmCreateOrganizationInput)
      .handler(async ({ context, input }) => {
        try {
          return await createCrmOrganization(
            dawnRepository,
            appRequestFromSession(context, {
              teamId: input.teamId,
              idempotencyKey: input.idempotencyKey,
            }),
            {
              ...input,
              displayName: input.displayName ?? null,
              organizationNumber: input.organizationNumber ?? null,
              countryCode: input.countryCode ?? null,
              vatNumber: input.vatNumber ?? null,
              websiteDomain: input.websiteDomain ?? null,
            },
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    createLegalEntity: protectedProcedure
      .input(crmCreateLegalEntityInput)
      .handler(async ({ context, input }) => {
        try {
          return await createCrmLegalEntity(
            dawnRepository,
            appRequestFromSession(context, {
              teamId: input.teamId,
              idempotencyKey: input.idempotencyKey,
            }),
            {
              ...input,
              organizationNumber: input.organizationNumber ?? null,
              vatNumber: input.vatNumber ?? null,
              countryCode: input.countryCode ?? null,
              baseCurrency: input.baseCurrency ?? null,
              fiscalYearStartMonth: input.fiscalYearStartMonth ?? null,
            },
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    createAccount: protectedProcedure.input(crmCreateAccountInput).handler(async ({ context, input }) => {
      try {
        return await createCrmAccount(
          dawnRepository,
          appRequestFromSession(context, {
            teamId: input.teamId,
            idempotencyKey: input.idempotencyKey,
          }),
          {
            ...input,
            accountType: input.accountType,
            legalEntityId: input.legalEntityId ?? null,
            relationshipStatus: input.relationshipStatus,
            lifecycleStage: input.lifecycleStage ?? null,
            segment: input.segment ?? null,
            territory: input.territory ?? null,
            primaryOwnerPrincipalId: input.primaryOwnerPrincipalId ?? null,
            customerSince: input.customerSince ?? null,
            churnedAt: input.churnedAt ?? null,
          },
        );
      } catch (error) {
        mapAppError(error);
      }
    }),
    updateAccount: protectedProcedure.input(crmUpdateAccountInput).handler(async ({ context, input }) => {
      try {
        return await updateCrmAccount(
          dawnRepository,
          appRequestFromSession(context, {
            teamId: input.teamId,
            idempotencyKey: input.idempotencyKey,
          }),
          {
            ...input,
            legalEntityId: input.legalEntityId,
            lifecycleStage: input.lifecycleStage,
            segment: input.segment,
            territory: input.territory,
            primaryOwnerPrincipalId: input.primaryOwnerPrincipalId,
            customerSince: input.customerSince,
            churnedAt: input.churnedAt,
          },
        );
      } catch (error) {
        mapAppError(error);
      }
    }),
    suggestAccountDuplicates: protectedProcedure
      .input(crmSuggestAccountDuplicatesInput)
      .handler(async ({ context, input }) => {
        try {
          return await suggestCrmAccountDuplicates(
            dawnRepository,
            appRequestFromSession(context, { teamId: input.teamId }),
            {
              ...input,
              organizationNumber: input.organizationNumber ?? null,
              limit: input.limit ?? null,
            },
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    createContact: protectedProcedure.input(crmCreateContactInput).handler(async ({ context, input }) => {
      try {
        return await createCrmContact(
          dawnRepository,
          appRequestFromSession(context, {
            teamId: input.teamId,
            idempotencyKey: input.idempotencyKey,
          }),
          {
            ...input,
            givenName: input.givenName ?? null,
            familyName: input.familyName ?? null,
            displayName: input.displayName ?? null,
            email: input.email ?? null,
            phoneNumber: input.phoneNumber ?? null,
            role: input.role ?? null,
            isPrimary: input.isPrimary ?? null,
          },
        );
      } catch (error) {
        mapAppError(error);
      }
    }),
    updateContact: protectedProcedure.input(crmUpdateContactInput).handler(async ({ context, input }) => {
      try {
        return await updateCrmContact(
          dawnRepository,
          appRequestFromSession(context, {
            teamId: input.teamId,
            idempotencyKey: input.idempotencyKey,
          }),
          {
            ...input,
            givenName: input.givenName,
            familyName: input.familyName,
            displayName: input.displayName,
            email: input.email,
            phoneNumber: input.phoneNumber,
            role: input.role,
            isPrimary: input.isPrimary,
          },
        );
      } catch (error) {
        mapAppError(error);
      }
    }),
    linkAccountFortnoxCustomer: protectedProcedure
      .input(crmLinkAccountFortnoxCustomerInput)
      .handler(async ({ context, input }) => {
        try {
          return await linkCrmAccountProviderCustomer(
            dawnRepository,
            appRequestFromSession(context, {
              teamId: input.teamId,
              idempotencyKey: input.idempotencyKey,
            }),
            {
              ...input,
              provider: "fortnox",
            },
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    createOpportunity: protectedProcedure
      .input(crmCreateOpportunityInput)
      .handler(async ({ context, input }) => {
        try {
          return await createCrmOpportunity(
            dawnRepository,
            appRequestFromSession(context, {
              teamId: input.teamId,
              idempotencyKey: input.idempotencyKey,
            }),
            {
              ...input,
              stage: input.stage ?? null,
              expectedCloseDate: input.expectedCloseDate ?? null,
              primaryOwnerPrincipalId: input.primaryOwnerPrincipalId ?? null,
            },
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    updateOpportunity: protectedProcedure
      .input(crmUpdateOpportunityInput)
      .handler(async ({ context, input }) => {
        try {
          return await updateCrmOpportunity(
            dawnRepository,
            appRequestFromSession(context, {
              teamId: input.teamId,
              idempotencyKey: input.idempotencyKey,
            }),
            {
              ...input,
              name: input.name,
              amountMinor: input.amountMinor,
              currencyCode: input.currencyCode,
              expectedCloseDate: input.expectedCloseDate,
              primaryOwnerPrincipalId: input.primaryOwnerPrincipalId,
            },
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    updateOpportunityStage: protectedProcedure
      .input(crmUpdateOpportunityStageInput)
      .handler(async ({ context, input }) => {
        try {
          return await updateCrmOpportunityStage(
            dawnRepository,
            appRequestFromSession(context, {
              teamId: input.teamId,
              idempotencyKey: input.idempotencyKey,
            }),
            input,
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    archiveAccount: protectedProcedure
      .input(crmArchiveAccountInput)
      .handler(async ({ context, input }) => {
        try {
          return await archiveCrmAccount(
            dawnRepository,
            appRequestFromSession(context, {
              teamId: input.teamId,
              idempotencyKey: input.idempotencyKey,
            }),
            input,
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    archiveContact: protectedProcedure
      .input(crmArchiveContactInput)
      .handler(async ({ context, input }) => {
        try {
          return await archiveCrmContact(
            dawnRepository,
            appRequestFromSession(context, {
              teamId: input.teamId,
              idempotencyKey: input.idempotencyKey,
            }),
            input,
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    archiveOpportunity: protectedProcedure
      .input(crmArchiveOpportunityInput)
      .handler(async ({ context, input }) => {
        try {
          return await archiveCrmOpportunity(
            dawnRepository,
            appRequestFromSession(context, {
              teamId: input.teamId,
              idempotencyKey: input.idempotencyKey,
            }),
            input,
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    accountSummary: protectedProcedure.input(crmAccountSummaryInput).handler(async ({ context, input }) => {
      try {
        return await getCrmAccountSummary(
          dawnRepository,
          appRequestFromSession(context, { teamId: input.teamId }),
          input,
        );
      } catch (error) {
        mapAppError(error);
      }
    }),
    accountTimeline: protectedProcedure.input(crmAccountTimelineInput).handler(async ({ context, input }) => {
      try {
        return await listCrmAccountTimeline(
          dawnRepository,
          appRequestFromSession(context, { teamId: input.teamId }),
          {
            ...input,
            limit: input.limit ?? null,
          },
        );
      } catch (error) {
        mapAppError(error);
      }
    }),
    listAccounts: protectedProcedure.input(crmListAccountsInput).handler(async ({ context, input }) => {
      try {
        return await listCrmAccounts(
          dawnRepository,
          appRequestFromSession(context, { teamId: input.teamId }),
          {
            ...input,
            legalEntityId: input.legalEntityId ?? null,
            relationshipStatus: input.relationshipStatus ?? null,
            accountType: input.accountType ?? null,
            customFieldFilter: input.customFieldFilter ?? null,
          },
        );
      } catch (error) {
        mapAppError(error);
      }
    }),
  };
}
