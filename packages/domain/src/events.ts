export type AuditEvent = {
  id: string;
  teamId: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown>;
  occurredAt: string;
};

export type OutboxEvent = {
  id: string;
  teamId: string;
  type: string;
  version: number;
  payload: Record<string, unknown>;
  occurredAt: string;
};
