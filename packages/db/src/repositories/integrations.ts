import type {
  IntegrationCategory,
  IntegrationConnection,
  IntegrationSyncRun,
  IntegrationSyncRunStatus,
} from "@dawn/domain";
import { and, desc, eq } from "drizzle-orm";

import * as schema from "../schema";
import type { QueryClient } from "./types";

export async function listIntegrationConnectionSummaries(client: QueryClient, teamId: string) {
  const [connections, syncRuns] = await Promise.all([
    client
      .select()
      .from(schema.integrationConnection)
      .where(eq(schema.integrationConnection.teamId, teamId))
      .orderBy(desc(schema.integrationConnection.createdAt)),
    client
      .select()
      .from(schema.integrationSyncRun)
      .where(eq(schema.integrationSyncRun.teamId, teamId))
      .orderBy(desc(schema.integrationSyncRun.startedAt)),
  ]);

  return connections.map((connection) => ({
    connection: mapIntegrationConnection(connection),
    latestSyncRun:
      syncRuns
        .map(mapIntegrationSyncRun)
        .find((syncRun) => syncRun.integrationConnectionId === connection.id) ?? null,
  }));
}

export async function getIntegrationConnectionForTeam(
  client: QueryClient,
  teamId: string,
  connectionId: string,
): Promise<IntegrationConnection | null> {
  const [connection] = await client
    .select()
    .from(schema.integrationConnection)
    .where(
      and(
        eq(schema.integrationConnection.teamId, teamId),
        eq(schema.integrationConnection.id, connectionId),
      ),
    )
    .limit(1);

  return connection ? mapIntegrationConnection(connection) : null;
}

export async function upsertIntegrationConnection(
  client: QueryClient,
  input: {
    connectionId: string;
    teamId: string;
    category: IntegrationCategory;
    provider: string;
    providerConnectionId: string;
    displayName: string;
    capabilities: string[];
    tokenCiphertext: string;
    tokenKeyId: string;
    tokenLastFour: string;
    rawPayload: Record<string, unknown>;
    createdByActorId: string;
  },
): Promise<IntegrationConnection> {
  const [existing] = await client
    .select()
    .from(schema.integrationConnection)
    .where(
      and(
        eq(schema.integrationConnection.teamId, input.teamId),
        eq(schema.integrationConnection.provider, input.provider),
        eq(schema.integrationConnection.providerConnectionId, input.providerConnectionId),
      ),
    )
    .limit(1);

  if (existing) {
    const [updated] = await client
      .update(schema.integrationConnection)
      .set({
        category: input.category,
        displayName: input.displayName,
        status: "connected",
        capabilities: input.capabilities,
        tokenCiphertext: input.tokenCiphertext,
        tokenKeyId: input.tokenKeyId,
        tokenLastFour: input.tokenLastFour,
        rawPayload: input.rawPayload,
        lastError: null,
        disabledAt: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.integrationConnection.id, existing.id))
      .returning();

    if (!updated) {
      throw new Error("Integration connection was not updated");
    }

    return mapIntegrationConnection(updated);
  }

  const [connection] = await client
    .insert(schema.integrationConnection)
    .values({
      id: input.connectionId,
      teamId: input.teamId,
      category: input.category,
      provider: input.provider,
      providerConnectionId: input.providerConnectionId,
      displayName: input.displayName,
      status: "connected",
      capabilities: input.capabilities,
      tokenCiphertext: input.tokenCiphertext,
      tokenKeyId: input.tokenKeyId,
      tokenLastFour: input.tokenLastFour,
      rawPayload: input.rawPayload,
      createdByActorId: input.createdByActorId,
    })
    .returning();

  if (!connection) {
    throw new Error("Failed to create integration connection");
  }

  return mapIntegrationConnection(connection);
}

export async function createIntegrationSyncRun(
  client: QueryClient,
  input: {
    syncRunId: string;
    teamId: string;
    integrationConnectionId: string;
    category: IntegrationCategory;
    provider: string;
  },
): Promise<IntegrationSyncRun> {
  const [syncRun] = await client
    .insert(schema.integrationSyncRun)
    .values({
      id: input.syncRunId,
      teamId: input.teamId,
      integrationConnectionId: input.integrationConnectionId,
      category: input.category,
      provider: input.provider,
      status: "running",
      rawPayload: {},
    })
    .returning();

  if (!syncRun) {
    throw new Error("Failed to create integration sync run");
  }

  return mapIntegrationSyncRun(syncRun);
}

export async function finishIntegrationSyncRun(
  client: QueryClient,
  input: {
    syncRunId: string;
    status: Exclude<IntegrationSyncRunStatus, "running">;
    recordsSynced: number;
    error?: string | null;
    rawPayload: Record<string, unknown>;
  },
): Promise<IntegrationSyncRun> {
  const [syncRun] = await client
    .update(schema.integrationSyncRun)
    .set({
      status: input.status,
      completedAt: new Date(),
      recordsSynced: input.recordsSynced,
      error: input.error ?? null,
      rawPayload: input.rawPayload,
    })
    .where(eq(schema.integrationSyncRun.id, input.syncRunId))
    .returning();

  if (!syncRun) {
    throw new Error("Integration sync run was not updated");
  }

  return mapIntegrationSyncRun(syncRun);
}

export async function markIntegrationConnectionSynced(
  client: QueryClient,
  input: {
    connectionId: string;
    syncedAt: Date;
    status: IntegrationConnection["status"];
    lastError?: string | null;
  },
): Promise<IntegrationConnection> {
  const [connection] = await client
    .update(schema.integrationConnection)
    .set({
      lastSyncAt: input.syncedAt,
      status: input.status,
      lastError: input.lastError ?? null,
      updatedAt: new Date(),
    })
    .where(eq(schema.integrationConnection.id, input.connectionId))
    .returning();

  if (!connection) {
    throw new Error("Integration connection was not updated");
  }

  return mapIntegrationConnection(connection);
}

export async function disableIntegrationConnection(
  client: QueryClient,
  input: {
    connectionId: string;
    disabledAt: Date;
  },
): Promise<IntegrationConnection> {
  const [connection] = await client
    .update(schema.integrationConnection)
    .set({
      status: "disabled",
      disabledAt: input.disabledAt,
      updatedAt: input.disabledAt,
    })
    .where(eq(schema.integrationConnection.id, input.connectionId))
    .returning();

  if (!connection) {
    throw new Error("Integration connection was not updated");
  }

  return mapIntegrationConnection(connection);
}

export function mapIntegrationConnection(
  connection: typeof schema.integrationConnection.$inferSelect,
): IntegrationConnection {
  return {
    id: connection.id,
    teamId: connection.teamId,
    category: connection.category as IntegrationConnection["category"],
    provider: connection.provider,
    providerConnectionId: connection.providerConnectionId,
    displayName: connection.displayName,
    status: connection.status as IntegrationConnection["status"],
    capabilities: connection.capabilities,
    tokenKeyId: connection.tokenKeyId,
    tokenLastFour: connection.tokenLastFour,
    rawPayload: connection.rawPayload,
    lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
    lastError: connection.lastError,
    disabledAt: connection.disabledAt?.toISOString() ?? null,
    createdByActorId: connection.createdByActorId,
    createdAt: connection.createdAt.toISOString(),
    updatedAt: connection.updatedAt.toISOString(),
  };
}

export function mapIntegrationSyncRun(
  syncRun: typeof schema.integrationSyncRun.$inferSelect,
): IntegrationSyncRun {
  return {
    id: syncRun.id,
    teamId: syncRun.teamId,
    integrationConnectionId: syncRun.integrationConnectionId,
    category: syncRun.category as IntegrationSyncRun["category"],
    provider: syncRun.provider,
    status: syncRun.status as IntegrationSyncRun["status"],
    startedAt: syncRun.startedAt.toISOString(),
    completedAt: syncRun.completedAt?.toISOString() ?? null,
    recordsSynced: syncRun.recordsSynced,
    error: syncRun.error,
    rawPayload: syncRun.rawPayload,
  };
}
