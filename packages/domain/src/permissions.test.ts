import { describe, expect, test } from "bun:test";

import { permissionsForPublicApiScopes, permissionsForRole, roleHasPermission } from "./index";

describe("team role permissions", () => {
  test("owners can manage team and billing settings", () => {
    expect(roleHasPermission("owner", "team.manage")).toBe(true);
    expect(roleHasPermission("owner", "settings.billing")).toBe(true);
  });

  test("admins can manage team members but not billing settings", () => {
    expect(roleHasPermission("admin", "team.manage")).toBe(true);
    expect(roleHasPermission("admin", "settings.billing")).toBe(false);
    expect(roleHasPermission("admin", "operations.read")).toBe(true);
  });

  test("accountants can categorize transactions without managing teams", () => {
    expect(roleHasPermission("accountant", "transactions.categorize")).toBe(true);
    expect(roleHasPermission("accountant", "team.manage")).toBe(false);
  });

  test("viewers only receive read-oriented permissions", () => {
    expect(permissionsForRole("viewer")).toEqual([
      "transactions.read",
      "documents.read",
      "projects.read",
      "invoices.read",
      "integrations.read",
      "assistant.use",
      "automations.read",
    ]);
    expect(roleHasPermission("viewer", "operations.read")).toBe(false);
  });

  test("public API resource scopes resolve to product permissions", () => {
    expect(
      permissionsForPublicApiScopes([
        "documents.read",
        "documents.write",
        "projects.read",
        "projects.write",
      ]),
    ).toEqual(["documents.read", "documents.write", "projects.read", "projects.write"]);
  });
});
