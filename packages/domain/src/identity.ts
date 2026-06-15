export type Actor = {
  id: string;
  type: "user" | "api_key" | "oauth_app" | "system" | "assistant" | "provider_webhook";
  email?: string;
  teamId?: string;
  permissions?: readonly Permission[];
};

export type TeamRole = "owner" | "admin" | "member" | "accountant" | "viewer";

export type Permission =
  | "transactions.read"
  | "transactions.write"
  | "transactions.categorize"
  | "transactions.export"
  | "documents.read"
  | "documents.write"
  | "projects.read"
  | "projects.write"
  | "invoices.read"
  | "invoices.write"
  | "invoices.send"
  | "bank_connections.manage"
  | "team.manage"
  | "settings.billing"
  | "api_keys.manage"
  | "integrations.read"
  | "integrations.write"
  | "assistant.use"
  | "assistant.mutate"
  | "automations.read"
  | "automations.write"
  | "automations.run"
  | "operations.read"
  | "webhooks.manage";

export const publicApiScopes = [
  "transactions.read",
  "transactions.write",
  "bank_accounts.read",
  "documents.read",
  "documents.write",
  "inbox.read",
  "inbox.write",
  "invoices.read",
  "invoices.write",
  "customers.read",
  "customers.write",
  "products.read",
  "products.write",
  "projects.read",
  "projects.write",
  "time_entries.write",
  "reports.read",
  "webhooks.manage",
] as const;

export type PublicApiScope = (typeof publicApiScopes)[number];

export type PublicApiResource =
  | "transactions"
  | "bankAccounts"
  | "documents"
  | "inbox"
  | "invoices"
  | "customers"
  | "products"
  | "projects"
  | "timeEntries"
  | "reports"
  | "webhooks";

export const publicApiScopesByResource = {
  transactions: ["transactions.read", "transactions.write"],
  bankAccounts: ["bank_accounts.read"],
  documents: ["documents.read", "documents.write"],
  inbox: ["inbox.read", "inbox.write"],
  invoices: ["invoices.read", "invoices.write"],
  customers: ["customers.read", "customers.write"],
  products: ["products.read", "products.write"],
  projects: ["projects.read", "projects.write"],
  timeEntries: ["time_entries.write"],
  reports: ["reports.read"],
  webhooks: ["webhooks.manage"],
} as const satisfies Record<PublicApiResource, readonly PublicApiScope[]>;

export const publicApiScopeLabels = {
  "transactions.read": "Read transactions",
  "transactions.write": "Create transactions",
  "bank_accounts.read": "Read bank accounts",
  "documents.read": "Read documents",
  "documents.write": "Upload and update documents",
  "inbox.read": "Read inbox items",
  "inbox.write": "Resolve inbox items",
  "invoices.read": "Read invoices",
  "invoices.write": "Create and update invoices",
  "customers.read": "Read customers",
  "customers.write": "Create and update customers",
  "products.read": "Read products",
  "products.write": "Create and update products",
  "projects.read": "Read projects",
  "projects.write": "Create and update projects",
  "time_entries.write": "Create time entries",
  "reports.read": "Read reports",
  "webhooks.manage": "Manage webhook subscriptions",
} as const satisfies Record<PublicApiScope, string>;

export type Team = {
  id: string;
  name: string;
};

export type TeamMembership = {
  teamId: string;
  userId: string;
  role: TeamRole;
};

export type TeamMember = TeamMembership & {
  id: string;
  name?: string | null;
  email?: string | null;
};

export type TeamInviteStatus = "pending" | "accepted" | "revoked" | "expired";

export type TeamInvite = {
  id: string;
  teamId: string;
  email: string;
  role: TeamRole;
  status: TeamInviteStatus;
  invitedByActorId: string;
  expiresAt: string;
};

export function permissionsForPublicApiScope(scope: PublicApiScope): readonly Permission[] {
  if (scope === "transactions.read" || scope === "bank_accounts.read" || scope === "reports.read") {
    return ["transactions.read"];
  }

  if (scope === "transactions.write") {
    return ["transactions.write"];
  }

  if (scope === "documents.read" || scope === "inbox.read") {
    return ["documents.read"];
  }

  if (scope === "documents.write") {
    return ["documents.write"];
  }

  if (scope === "inbox.write") {
    return ["documents.write", "transactions.write"];
  }

  if (scope === "invoices.read" || scope === "customers.read" || scope === "products.read") {
    return ["invoices.read"];
  }

  if (scope === "invoices.write" || scope === "customers.write" || scope === "products.write") {
    return ["invoices.write"];
  }

  if (scope === "projects.read") {
    return ["projects.read"];
  }

  if (scope === "projects.write" || scope === "time_entries.write") {
    return ["projects.write"];
  }

  return ["webhooks.manage"];
}

export function permissionsForPublicApiScopes(scopes: readonly PublicApiScope[]) {
  return [...new Set(scopes.flatMap(permissionsForPublicApiScope))];
}

export const rolePermissions: Record<TeamRole, readonly Permission[]> = {
  owner: [
    "transactions.read",
    "transactions.write",
    "transactions.categorize",
    "transactions.export",
    "documents.read",
    "documents.write",
    "projects.read",
    "projects.write",
    "invoices.read",
    "invoices.write",
    "invoices.send",
    "bank_connections.manage",
    "team.manage",
    "settings.billing",
    "api_keys.manage",
    "integrations.read",
    "integrations.write",
    "assistant.use",
    "assistant.mutate",
    "automations.read",
    "automations.write",
    "automations.run",
    "operations.read",
    "webhooks.manage",
  ],
  admin: [
    "transactions.read",
    "transactions.write",
    "transactions.categorize",
    "transactions.export",
    "documents.read",
    "documents.write",
    "projects.read",
    "projects.write",
    "invoices.read",
    "invoices.write",
    "invoices.send",
    "bank_connections.manage",
    "team.manage",
    "api_keys.manage",
    "integrations.read",
    "integrations.write",
    "assistant.use",
    "assistant.mutate",
    "automations.read",
    "automations.write",
    "automations.run",
    "operations.read",
    "webhooks.manage",
  ],
  member: [
    "transactions.read",
    "transactions.write",
    "transactions.categorize",
    "transactions.export",
    "documents.read",
    "documents.write",
    "projects.read",
    "projects.write",
    "invoices.read",
    "invoices.write",
    "integrations.read",
    "assistant.use",
    "automations.read",
  ],
  accountant: [
    "transactions.read",
    "transactions.export",
    "documents.read",
    "projects.read",
    "invoices.read",
    "integrations.read",
    "assistant.use",
    "automations.read",
  ],
  viewer: [
    "transactions.read",
    "documents.read",
    "projects.read",
    "invoices.read",
    "integrations.read",
    "assistant.use",
    "automations.read",
  ],
};

export function roleHasPermission(role: TeamRole, permission: Permission) {
  return rolePermissions[role].includes(permission);
}

export function permissionsForRole(role: TeamRole) {
  return rolePermissions[role];
}

export function assertTeamRole(role: string): asserts role is TeamRole {
  if (!["owner", "admin", "member", "accountant", "viewer"].includes(role)) {
    throw new Error("Unknown team role");
  }
}
