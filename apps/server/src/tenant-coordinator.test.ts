import { describe, expect, test } from "bun:test";
import { createProjectSyncInvalidation, createTransactionSyncInvalidation } from "@dawn/sync";

import { TenantRealtimeHub } from "./tenant-coordinator";
import { normalizeTenantSyncInvalidation } from "./tenant-sync";

class FakeRealtimeSocket {
  messages: string[] = [];

  send(message: string) {
    this.messages.push(message);
  }
}

describe("TenantRealtimeHub", () => {
  test("acknowledges subscriptions without storing authoritative data", () => {
    const hub = new TenantRealtimeHub();
    const socket = new FakeRealtimeSocket();

    hub.subscribe(socket, {
      type: "sync.subscribe",
      teamId: "team_1",
      collection: "transactions",
    });

    expect(socket.messages).toEqual([
      JSON.stringify({
        type: "sync.subscribed",
        teamId: "team_1",
        collection: "transactions",
        reconnect: "refetch_by_cursor",
      }),
    ]);
    expect(hub.snapshot()).toEqual({ subscribers: 1 });
  });

  test("fans out invalidations only to matching team subscriptions", () => {
    const hub = new TenantRealtimeHub();
    const firstTeamSocket = new FakeRealtimeSocket();
    const secondTeamSocket = new FakeRealtimeSocket();
    const event = createTransactionSyncInvalidation({
      teamId: "team_1",
      cursor: "2026-06-15T10:00:00.000Z",
      changedIds: ["txn_1"],
    });

    hub.subscribe(firstTeamSocket, {
      type: "sync.subscribe",
      teamId: "team_1",
      collection: "transactions",
    });
    hub.subscribe(secondTeamSocket, {
      type: "sync.subscribe",
      teamId: "team_2",
      collection: "transactions",
    });

    expect(hub.fanout(event)).toEqual({ delivered: 1, subscribers: 2 });
    expect(firstTeamSocket.messages.at(-1)).toBe(JSON.stringify(event));
    expect(secondTeamSocket.messages).toHaveLength(1);
  });

  test("fans out project invalidations only to project subscribers", () => {
    const hub = new TenantRealtimeHub();
    const projectSocket = new FakeRealtimeSocket();
    const transactionSocket = new FakeRealtimeSocket();
    const event = createProjectSyncInvalidation({
      teamId: "team_1",
      cursor: "2026-06-15T10:00:00.000Z",
      changedIds: ["project_1"],
    });

    hub.subscribe(projectSocket, {
      type: "sync.subscribe",
      teamId: "team_1",
      collection: "projects",
    });
    hub.subscribe(transactionSocket, {
      type: "sync.subscribe",
      teamId: "team_1",
      collection: "transactions",
    });

    expect(hub.fanout(event)).toEqual({ delivered: 1, subscribers: 2 });
    expect(projectSocket.messages.at(-1)).toBe(JSON.stringify(event));
    expect(transactionSocket.messages).toHaveLength(1);
  });

  test("removes closed sockets from future fanout", () => {
    const hub = new TenantRealtimeHub();
    const socket = new FakeRealtimeSocket();
    const event = createTransactionSyncInvalidation({
      teamId: "team_1",
      changedIds: ["txn_1"],
    });

    hub.subscribe(socket, {
      type: "sync.subscribe",
      teamId: "team_1",
      collection: "transactions",
    });
    hub.unsubscribe(socket);

    expect(hub.fanout(event)).toEqual({ delivered: 0, subscribers: 0 });
    expect(socket.messages).toHaveLength(1);
  });

  test("normalizes sync queue jobs into transaction invalidation events", () => {
    expect(
      normalizeTenantSyncInvalidation({
        type: "sync.invalidate",
        teamId: "team_1",
        collection: "transactions",
        cursor: null,
        changedIds: ["txn_1"],
        sourceOutboxEventId: "outbox_1",
        idempotencyKey: "sync:transactions:outbox_1",
      }),
    ).toEqual({
      type: "sync.transactions.invalidated",
      teamId: "team_1",
      collection: "transactions",
      cursor: null,
      changedIds: ["txn_1"],
    });
  });

  test("normalizes sync queue jobs into project invalidation events", () => {
    expect(
      normalizeTenantSyncInvalidation({
        type: "sync.invalidate",
        teamId: "team_1",
        collection: "projects",
        cursor: null,
        changedIds: ["project_1"],
        sourceOutboxEventId: "outbox_1",
        idempotencyKey: "sync:projects:outbox_1",
      }),
    ).toEqual({
      type: "sync.projects.invalidated",
      teamId: "team_1",
      collection: "projects",
      cursor: null,
      changedIds: ["project_1"],
    });
  });
});
