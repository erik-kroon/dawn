export type FortnoxProviderObjectType = "company" | "customer" | "article" | "invoice" | "payment";

export function normalizeFortnoxCustomerNumber(value: string) {
  return normalizeFortnoxExternalId(value, "Fortnox customer number");
}

export function normalizeFortnoxArticleNumber(value: string) {
  return normalizeFortnoxExternalId(value, "Fortnox article number");
}

export function normalizeSwedishOrganizationNumber(value: string) {
  const digits = value.replaceAll(/\D/g, "");

  if (!/^\d{10}$/.test(digits)) {
    throw new Error("Swedish organization number must contain 10 digits");
  }

  return digits;
}

export function fortnoxProviderObjectKey(input: {
  providerObjectType: FortnoxProviderObjectType;
  providerObjectId: string;
}) {
  return `fortnox:${input.providerObjectType}:${normalizeFortnoxExternalId(
    input.providerObjectId,
    "Fortnox object id",
  )}`;
}

function normalizeFortnoxExternalId(value: string, field: string) {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new Error(`${field} is required`);
  }

  return normalized;
}
