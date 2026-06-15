import { describe, expect, test } from "bun:test";

import {
  permissionsForPublicApiScopes,
  permissionsForRole,
  publicApiScopeLabels,
  publicApiScopes,
  publicApiScopesByResource,
  roleHasPermission,
} from "./index";

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
    expect(roleHasPermission("accountant", "transactions.export")).toBe(true);
    expect(roleHasPermission("accountant", "team.manage")).toBe(false);
  });

  test("members can export accountant packets without managing teams", () => {
    expect(roleHasPermission("member", "transactions.export")).toBe(true);
    expect(roleHasPermission("member", "team.manage")).toBe(false);
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
        "customers.read",
        "inbox.write",
        "reports.read",
        "time_entries.write",
      ]),
    ).toEqual([
      "documents.read",
      "invoices.read",
      "documents.write",
      "transactions.write",
      "transactions.read",
      "projects.write",
    ]);
  });

  test("public API scopes are grouped and labelled by product resource", () => {
    expect(publicApiScopesByResource).toMatchObject({
      transactions: ["transactions.read", "transactions.write"],
      bankAccounts: ["bank_accounts.read"],
      inbox: ["inbox.read", "inbox.write"],
      customers: ["customers.read", "customers.write"],
      products: ["products.read", "products.write"],
      timeEntries: ["time_entries.write"],
      reports: ["reports.read"],
    });
    expect(Object.keys(publicApiScopeLabels)).toEqual([...publicApiScopes]);
  });
});
