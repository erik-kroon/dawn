import { env } from "@dawn/env/server";
import type { DawnCloudflareBindings } from "@dawn/infra/cloudflare";
import type { SyncCollectionContract } from "@dawn/sync";
import { upgradeWebSocket, websocket, type BunWebSocketData } from "hono/bun";

import dawnServer, { configureLocalSyncSubscriptionHandler } from "./index";
import { TenantRealtimeHub } from "./tenant-coordinator";
import { configureLocalTenantSyncRuntime } from "./tenant-sync";

type LocalBindings = Partial<DawnCloudflareBindings> & {
  server: Bun.Server<BunWebSocketData>;
};
type LocalRealtimeSocket = {
  send(message: string): void;
};

const localSyncHub = new TenantRealtimeHub();

configureLocalTenantSyncRuntime({
  fanout(event) {
    return localSyncHub.fanout(event);
  },
});

configureLocalSyncSubscriptionHandler(({ context, contract, teamId }) => {
  return upgradeWebSocket(context, {
    onOpen(_event, socket) {
      localSyncHub.subscribe(realtimeSocket(socket), syncSubscription(contract, teamId));
    },
    onClose(_event, socket) {
      localSyncHub.unsubscribe(realtimeSocket(socket));
    },
    onError(_event, socket) {
      localSyncHub.unsubscribe(realtimeSocket(socket));
    },
  });
});

const server = Bun.serve({
  port: resolvePort(),
  fetch(request, bunServer) {
    return dawnServer.fetch(request, localBindings(bunServer) as DawnCloudflareBindings);
  },
  websocket,
});

console.log(`Started development server: ${server.url}`);

function localBindings(server: Bun.Server<BunWebSocketData>): LocalBindings {
  return {
    server,
    ENVIRONMENT: "preview",
    NODE_ENV: env.NODE_ENV,
    CORS_ORIGIN: env.CORS_ORIGIN,
    BETTER_AUTH_URL: env.BETTER_AUTH_URL,
    BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET,
    POLAR_ACCESS_TOKEN: env.POLAR_ACCESS_TOKEN ?? "",
    POLAR_SUCCESS_URL: env.POLAR_SUCCESS_URL ?? "",
    DATABASE_URL: env.DATABASE_URL,
  };
}

function syncSubscription(contract: SyncCollectionContract, teamId: string) {
  return {
    type: "sync.subscribe" as const,
    teamId,
    collection: contract.collection.id,
  };
}

function realtimeSocket(socket: {
  raw?: unknown;
  send(message: string): void;
}): LocalRealtimeSocket {
  if (isRealtimeSocket(socket.raw)) {
    return socket.raw;
  }

  return socket;
}

function isRealtimeSocket(input: unknown): input is LocalRealtimeSocket {
  return (
    typeof input === "object" &&
    input !== null &&
    "send" in input &&
    typeof input.send === "function"
  );
}

function resolvePort() {
  const configuredPort = process.env.PORT ?? new URL(env.BETTER_AUTH_URL).port;
  const port = Number(configuredPort || 3000);

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid PORT value: ${configuredPort}`);
  }

  return port;
}
