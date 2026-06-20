import type { Actor, Permission } from "./identity";

export type CrmPrincipal = {
  id: string;
  teamId: string;
  actorType: Actor["type"];
};

export type CrmObjectType = "organization" | "legal_entity" | "account" | "opportunity";
export type CrmObjectAction = "read" | "write";

const crmObjectPermissionSegments = {
  organization: "organizations",
  legal_entity: "legal_entities",
  account: "accounts",
  opportunity: "opportunities",
} as const satisfies Record<CrmObjectType, string>;

export function crmPermission(objectType: CrmObjectType, action: CrmObjectAction): Permission {
  return `crm.${crmObjectPermissionSegments[objectType]}.${action}` as Permission;
}

export type CrmRecordGrant = {
  id: string;
  teamId: string;
  recordId: string;
  principalId: string;
  action: CrmObjectAction;
  grantedByActorId: string;
  createdAt: string;
  expiresAt: string | null;
};

export type CrmFieldSecurityAction = "read" | "write";
export type CrmFieldSecurityEffect = "allow" | "deny";

export type CrmFieldSecurityPolicy = {
  id: string;
  teamId: string;
  targetRecordId: string | null;
  objectTypeId: string;
  principalId: string | null;
  fieldId: string;
  action: CrmFieldSecurityAction;
  effect: CrmFieldSecurityEffect;
};

export type CrmAccessDecision = {
  allowed: boolean;
  reason: "owner" | "record_grant" | "team_capability" | "denied" | "not_found";
  visibleFields: string[] | "all";
  writableFields: string[] | "all";
};

export function resolveCrmPrincipal(
  actor: Actor,
  teamId: string,
  principalId = actor.id,
): CrmPrincipal {
  return {
    id: principalId,
    teamId,
    actorType: actor.type,
  };
}

export function evaluateCrmAccess(input: {
  principal: CrmPrincipal;
  teamId: string;
  record: {
    id: string;
    teamId: string;
    objectTypeId: string;
    ownerPrincipalId: string | null;
    lifecycleState: string;
  } | null;
  capabilities: readonly Permission[];
  action: { objectType: CrmObjectType; action: CrmObjectAction };
  grants: CrmRecordGrant[];
  fieldPolicies: CrmFieldSecurityPolicy[];
  allFields: readonly string[];
  now?: string;
}): CrmAccessDecision {
  const now = input.now ?? new Date().toISOString();
  const basePermission = crmPermission(input.action.objectType, input.action.action);
  const empty: CrmAccessDecision = {
    allowed: false,
    reason: "not_found",
    visibleFields: [],
    writableFields: [],
  };

  if (!input.record || input.record.teamId !== input.teamId) {
    return empty;
  }

  if (input.record.lifecycleState === "deleted") {
    return empty;
  }

  const hasGrant = input.grants.some(
    (grant) =>
      grant.recordId === input.record!.id &&
      grant.principalId === input.principal.id &&
      grant.action === input.action.action &&
      (grant.expiresAt === null || grant.expiresAt > now),
  );
  const hasCapability = input.capabilities.includes(basePermission);

  if (!hasCapability && !hasGrant) {
    return {
      ...empty,
      reason: "denied",
    };
  }

  const reason: CrmAccessDecision["reason"] =
    input.record.ownerPrincipalId === input.principal.id
      ? "owner"
      : hasGrant
        ? "record_grant"
        : "team_capability";

  if (reason === "record_grant") {
    return {
      allowed: true,
      reason,
      visibleFields: evaluateFieldAccess({
        record: input.record,
        principal: input.principal,
        fieldPolicies: input.fieldPolicies,
        allFields: input.allFields,
        action: "read",
      }),
      writableFields: evaluateFieldAccess({
        record: input.record,
        principal: input.principal,
        fieldPolicies: input.fieldPolicies,
        allFields: input.allFields,
        action: "write",
      }),
    };
  }

  return {
    allowed: true,
    reason,
    visibleFields: evaluateFieldAccess({
      record: input.record,
      principal: input.principal,
      fieldPolicies: input.fieldPolicies,
      allFields: input.allFields,
      action: "read",
    }),
    writableFields: evaluateFieldAccess({
      record: input.record,
      principal: input.principal,
      fieldPolicies: input.fieldPolicies,
      allFields: input.allFields,
      action: "write",
    }),
  };
}

function evaluateFieldAccess(input: {
  record: { id: string; objectTypeId: string };
  principal: CrmPrincipal;
  fieldPolicies: CrmFieldSecurityPolicy[];
  allFields: readonly string[];
  action: CrmFieldSecurityAction;
}): string[] {
  return input.allFields.filter((field) => {
    const matching = input.fieldPolicies.filter(
      (policy) =>
        policy.objectTypeId === input.record.objectTypeId &&
        policy.fieldId === field &&
        policy.action === input.action &&
        (policy.targetRecordId === null || policy.targetRecordId === input.record.id) &&
        (policy.principalId === null || policy.principalId === input.principal.id),
    );

    if (matching.length === 0) {
      return true;
    }

    const scored = matching.map((policy) => ({
      policy,
      specificity:
        (policy.targetRecordId === input.record.id ? 2 : 1) +
        (policy.principalId === input.principal.id ? 2 : 1),
    }));

    scored.sort((left, right) => right.specificity - left.specificity);
    return scored[0]!.policy.effect === "allow";
  });
}

export function redactCrmFields<T extends Record<string, unknown>>(
  record: T,
  visibleFields: CrmAccessDecision["visibleFields"],
): Partial<T> {
  if (visibleFields === "all") {
    return { ...record };
  }

  const allowed = new Set(visibleFields);
  const redacted: Partial<T> = {};

  for (const [key, value] of Object.entries(record)) {
    if (allowed.has(key)) {
      (redacted as Record<string, unknown>)[key] = value;
    }
  }

  return redacted;
}

export function assertCrmWriteFields(
  input: Record<string, unknown>,
  writableFields: CrmAccessDecision["writableFields"],
): void {
  if (writableFields === "all") {
    return;
  }

  const allowed = new Set(writableFields);

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) {
      continue;
    }

    if (!allowed.has(key)) {
      throw new Error(`Field "${key}" is not writable`);
    }
  }
}
