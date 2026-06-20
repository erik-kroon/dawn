import { describe, expect, test } from "bun:test";

import {
  assertOpportunityStageTransition,
  deriveOpportunityStatusFromStage,
  normalizeCrmFieldDefinition,
  normalizeCrmObjectTypeDefinition,
  normalizeCrmPersonIdentity,
  normalizeCrmRecordFieldValue,
  normalizeOpportunityStage,
  type CrmFieldDefinition,
  type CrmOptionValue,
} from "./crm";

const fieldDefinition = {
  id: "field_1",
  teamId: "team_1",
  objectTypeDefinitionId: "object_type_1",
  objectTypeId: "account",
  stableKey: "risk_score",
  label: "Risk score",
  fieldType: "integer",
  cardinality: "single",
  isRequired: false,
  isUnique: false,
  allowedReferenceObjectTypeId: null,
  createdByActorId: "user_1",
  createdAt: "2026-06-20T10:00:00.000Z",
  updatedAt: "2026-06-20T10:00:00.000Z",
} satisfies CrmFieldDefinition;

describe("crm metadata domain", () => {
  test("normalizes object type and field definitions", () => {
    expect(
      normalizeCrmObjectTypeDefinition({
        objectTypeId: " Account_Extension ",
        label: " Account extension ",
        isCustom: true,
      }),
    ).toEqual({
      objectTypeId: "account_extension",
      label: "Account extension",
      isCustom: true,
    });

    expect(
      normalizeCrmFieldDefinition({
        objectTypeId: "account",
        stableKey: " Customer_Tier ",
        label: " Customer tier ",
        fieldType: "single_option",
        isRequired: true,
        options: [
          { stableKey: "gold", label: "Gold" },
          { stableKey: "silver", label: "Silver", sortOrder: 10 },
        ],
      }),
    ).toEqual({
      objectTypeId: "account",
      stableKey: "customer_tier",
      label: "Customer tier",
      fieldType: "single_option",
      cardinality: "single",
      isRequired: true,
      isUnique: false,
      allowedReferenceObjectTypeId: null,
      options: [
        { stableKey: "gold", label: "Gold", sortOrder: 0 },
        { stableKey: "silver", label: "Silver", sortOrder: 10 },
      ],
    });
  });

  test("rejects duplicate option stable keys inside a field definition", () => {
    expect(() =>
      normalizeCrmFieldDefinition({
        objectTypeId: "account",
        stableKey: "customer_tier",
        label: "Customer tier",
        fieldType: "single_option",
        options: [
          { stableKey: "gold", label: "Gold" },
          { stableKey: " Gold ", label: "Gold duplicate" },
        ],
      }),
    ).toThrow('Option stable key "gold" is already used');
  });

  test("requires record reference fields to declare the allowed object type", () => {
    expect(() =>
      normalizeCrmFieldDefinition({
        objectTypeId: "account",
        stableKey: "main_contact",
        label: "Main contact",
        fieldType: "record_reference",
      }),
    ).toThrow("Record reference fields must declare an allowed object type");
  });

  test("normalizes typed custom field values into typed columns", () => {
    expect(
      normalizeCrmRecordFieldValue(
        { ...fieldDefinition, fieldType: "money" },
        { type: "money", amountMinor: 12345, currencyCode: "sek" },
      ),
    ).toEqual({
      textValue: null,
      integerValue: null,
      booleanValue: null,
      dateValue: null,
      amountMinor: 12345,
      currencyCode: "SEK",
      optionValueId: null,
      referenceRecordId: null,
    });

    expect(
      normalizeCrmRecordFieldValue(
        { ...fieldDefinition, fieldType: "date" },
        { type: "date", value: "2026-06-20" },
      ).dateValue,
    ).toBe("2026-06-20T00:00:00.000Z");
  });

  test("rejects invalid typed values before persistence", () => {
    expect(() =>
      normalizeCrmRecordFieldValue(fieldDefinition, {
        type: "integer",
        value: Number.MAX_SAFE_INTEGER + 1,
      }),
    ).toThrow("Integer custom field value must be a safe integer");

    expect(() =>
      normalizeCrmRecordFieldValue(
        { ...fieldDefinition, fieldType: "text", isRequired: true },
        { type: "text", value: "   " },
      ),
    ).toThrow("Required text custom field value cannot be empty");

    expect(() =>
      normalizeCrmRecordFieldValue(
        { ...fieldDefinition, fieldType: "date" },
        { type: "date", value: "not-a-date" },
      ),
    ).toThrow("Date custom field value must be a valid ISO date");
  });

  test("requires active allowed option values", () => {
    const optionValues = [
      { id: "option_1", stableKey: "gold", isActive: true },
      { id: "option_2", stableKey: "legacy", isActive: false },
    ] satisfies Pick<CrmOptionValue, "id" | "stableKey" | "isActive">[];

    expect(
      normalizeCrmRecordFieldValue(
        { ...fieldDefinition, fieldType: "single_option" },
        { type: "single_option", stableKey: "gold" },
        optionValues,
      ).optionValueId,
    ).toBe("option_1");

    expect(() =>
      normalizeCrmRecordFieldValue(
        { ...fieldDefinition, fieldType: "single_option" },
        { type: "single_option", stableKey: "legacy" },
        optionValues,
      ),
    ).toThrow("Single option custom field value is not allowed");
  });

  test("normalizes fixed opportunity deal stages and coarse status", () => {
    expect(normalizeOpportunityStage(undefined)).toBe("new");
    expect(normalizeOpportunityStage(" proposal_sent ")).toBe("proposal_sent");
    expect(deriveOpportunityStatusFromStage("negotiation")).toBe("open");
    expect(deriveOpportunityStatusFromStage("won_pending_invoice")).toBe("won");
    expect(deriveOpportunityStatusFromStage("lost")).toBe("lost");

    expect(() => normalizeOpportunityStage("custom_pipeline_stage")).toThrow(
      "Unsupported deal stage",
    );
  });

  test("validates opportunity deal stage transitions", () => {
    expect(() => assertOpportunityStageTransition("new", "proposal_sent")).not.toThrow();
    expect(() =>
      assertOpportunityStageTransition("proposal_sent", "won_pending_invoice"),
    ).not.toThrow();
    expect(() => assertOpportunityStageTransition("won_pending_invoice", "won")).not.toThrow();
    expect(() => assertOpportunityStageTransition("won", "archived")).not.toThrow();

    expect(() => assertOpportunityStageTransition("won_pending_invoice", "negotiation")).toThrow(
      "Won deals pending invoice can only move to won or archived",
    );
    expect(() => assertOpportunityStageTransition("archived", "qualified")).toThrow(
      "Archived deals cannot change stage",
    );
  });

  test("normalizes CRM person identity for account contacts", () => {
    expect(
      normalizeCrmPersonIdentity({
        givenName: " Ada ",
        familyName: " Buyer ",
        email: " ADA@ACME.test ",
        phoneNumber: " +46701234567 ",
      }),
    ).toEqual({
      givenName: "Ada",
      familyName: "Buyer",
      displayName: "Ada Buyer",
      email: "ada@acme.test",
      phoneNumber: "+46701234567",
    });

    expect(() => normalizeCrmPersonIdentity({ email: "ada@acme.test" })).toThrow(
      "Contact display name is required",
    );
    expect(() =>
      normalizeCrmPersonIdentity({ displayName: "Ada Buyer", email: "not-an-email" }),
    ).toThrow("Contact email must be valid");
  });
});
