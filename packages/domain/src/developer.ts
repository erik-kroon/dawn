import type { PublicApiScope } from "./identity";

export type ApiKey = {
  id: string;
  teamId: string;
  name: string;
  keyPrefix: string;
  scopes: PublicApiScope[];
  createdByActorId: string;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
};

export type OAuthApp = {
  id: string;
  teamId: string;
  name: string;
  redirectUris: string[];
  scopes: PublicApiScope[];
  createdByActorId: string;
  createdAt: string;
  updatedAt: string;
};

export type OAuthGrant = {
  id: string;
  teamId: string;
  appId: string;
  actorId: string;
  scopes: PublicApiScope[];
  revokedAt?: string | null;
  createdAt: string;
};

export type WebhookSubscription = {
  id: string;
  teamId: string;
  url: string;
  eventTypes: string[];
  status: "active" | "disabled";
  createdByActorId: string;
  createdAt: string;
  updatedAt: string;
};

export type WebhookDeliveryStatus = "pending" | "delivered" | "failed";

export type WebhookDelivery = {
  id: string;
  teamId: string;
  subscriptionId: string;
  outboxEventId: string;
  status: WebhookDeliveryStatus;
  attempt: number;
  requestPayload: Record<string, unknown>;
  responseStatus?: number | null;
  responseBody?: string | null;
  error?: string | null;
  nextAttemptAt?: string | null;
  deliveredAt?: string | null;
  createdAt: string;
  updatedAt: string;
};
