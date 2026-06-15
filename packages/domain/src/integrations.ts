export type IntegrationCategory = "accounting" | "payments" | "messaging" | "email";

export type IntegrationConnectionStatus = "connected" | "disabled" | "error";

export type IntegrationConnection = {
  id: string;
  teamId: string;
  category: IntegrationCategory;
  provider: string;
  providerConnectionId: string;
  displayName: string;
  status: IntegrationConnectionStatus;
  capabilities: string[];
  tokenKeyId: string;
  tokenLastFour: string;
  rawPayload?: Record<string, unknown>;
  lastSyncAt?: string | null;
  lastError?: string | null;
  disabledAt?: string | null;
  createdByActorId: string;
  createdAt: string;
  updatedAt: string;
};

export type IntegrationSyncRunStatus = "running" | "completed" | "failed";

export type IntegrationSyncRun = {
  id: string;
  teamId: string;
  integrationConnectionId: string;
  category: IntegrationCategory;
  provider: string;
  status: IntegrationSyncRunStatus;
  startedAt: string;
  completedAt?: string | null;
  recordsSynced: number;
  error?: string | null;
  rawPayload: Record<string, unknown>;
};
