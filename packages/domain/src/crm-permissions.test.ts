import { describe, expect, test } from "bun:test";

import {
  assertCrmWriteFields,
  evaluateCrmAccess,
  redactCrmFields,
  resolveCrmPrincipal,
} from "./crm-permissions";

const principal = resolveCrmPrincipal({ id: "user_1", type: "user" }, "team_1");
const record = {
  id: "account_1",
  teamId: "team_1",
  objectTypeId: "account",
  ownerPrincipalId: null,
  lifecycleState: "active",
};

describe("crm permission policy", () => {
  test("record grants allow read access without team-wide capability", () => {
    const decision = evaluateCrmAccess({
      principal,
      teamId: "team_1",
      record,
      capabilities: [],
      action: { objectType: "account", action: "read" },
      grants: [
        {
          id: "grant_1",
          teamId: "team_1",
          recordId: "account_1",
          principalId: "user_1",
          action: "read",
          grantedByActorId: "admin_1",
          createdAt: "2026-06-15T10:00:00.000Z",
          expiresAt: null,
        },
      ],
      fieldPolicies: [],
      allFields: ["recordId", "accountType"],
      now: "2026-06-15T10:00:00.000Z",
    });

    expect(decision).toMatchObject({
      allowed: true,
      reason: "record_grant",
      visibleFields: ["recordId", "accountType"],
    });
  });

  test("field security redacts reads and rejects writes", () => {
    const decision = evaluateCrmAccess({
      principal,
      teamId: "team_1",
      record,
      capabilities: ["crm.accounts.read", "crm.accounts.write"],
      action: { objectType: "account", action: "read" },
      grants: [],
      fieldPolicies: [
        {
          id: "policy_1",
          teamId: "team_1",
          targetRecordId: null,
          objectTypeId: "account",
          principalId: null,
          fieldId: "accountType",
          action: "read",
          effect: "deny",
        },
        {
          id: "policy_2",
          teamId: "team_1",
          targetRecordId: null,
          objectTypeId: "account",
          principalId: null,
          fieldId: "relationshipStatus",
          action: "write",
          effect: "deny",
        },
      ],
      allFields: ["recordId", "accountType", "relationshipStatus"],
    });

    expect(
      redactCrmFields({ recordId: "account_1", accountType: "customer" }, decision.visibleFields),
    ).toEqual({ recordId: "account_1" });
    expect(() =>
      assertCrmWriteFields({ relationshipStatus: "inactive" }, decision.writableFields),
    ).toThrow('Field "relationshipStatus" is not writable');
  });
});
