import { resolveGoogleOAuthCredentials } from "@dawn/env/google-oauth";
import { env } from "@dawn/env/server";
import type { DawnCloudflareBindings } from "@dawn/infra/cloudflare";
import type { DawnQueueMessage } from "@dawn/jobs";
import type { SyncCollectionContract } from "@dawn/sync";
import { upgradeWebSocket, websocket, type BunWebSocketData } from "hono/bun";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dawnServer, { configureLocalSyncSubscriptionHandler } from "./index";
import { createFileDocumentObjectStorage } from "./document-storage";
import { TenantRealtimeHub } from "./tenant-coordinator";
import { configureLocalTenantSyncRuntime } from "./tenant-sync";
import { createDawnWorkerRuntime } from "./worker-runtime";

type LocalBindings = Partial<DawnCloudflareBindings> & {
  server: Bun.Server<BunWebSocketData>;
};
type LocalRealtimeSocket = {
  send(message: string): void;
};
type LocalR2PutOptions = {
  httpMetadata?: {
    contentType?: string;
  };
};

const localSyncHub = new TenantRealtimeHub();
const localDocumentObjectStorage = createFileDocumentObjectStorage(
  resolveLocalDocumentStoragePath(),
);
const localDocumentBucket = createLocalDocumentBucket();

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
console.log(`Local document storage: ${resolveLocalDocumentStoragePath()}`);

function localBindings(server: Bun.Server<BunWebSocketData>): LocalBindings {
  const googleOAuthCredentials = resolveGoogleOAuthCredentials(env);
  const bindings: LocalBindings = {
    server,
    ENVIRONMENT: "preview",
    NODE_ENV: env.NODE_ENV,
    CORS_ORIGIN: env.CORS_ORIGIN,
    BETTER_AUTH_URL: env.BETTER_AUTH_URL,
    BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET,
    POLAR_ACCESS_TOKEN: env.POLAR_ACCESS_TOKEN ?? "",
    POLAR_SUCCESS_URL: env.POLAR_SUCCESS_URL ?? "",
    FORTNOX_CLIENT_ID: env.FORTNOX_CLIENT_ID,
    FORTNOX_CLIENT_SECRET: env.FORTNOX_CLIENT_SECRET,
    ...(googleOAuthCredentials
      ? {
          GMAIL_CLIENT_ID: googleOAuthCredentials.clientId,
          GMAIL_CLIENT_SECRET: googleOAuthCredentials.clientSecret,
        }
      : {}),
    DATABASE_URL: env.DATABASE_URL,
    DAWN_DOCUMENTS: localDocumentBucket,
    DAWN_JOBS: createLocalQueue(() => bindings as DawnCloudflareBindings),
  };

  return bindings;
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

function resolveLocalDocumentStoragePath() {
  return process.env.DAWN_LOCAL_DOCUMENTS_DIR
    ? resolve(process.env.DAWN_LOCAL_DOCUMENTS_DIR)
    : fileURLToPath(new URL("../../../.dawn/documents", import.meta.url));
}

function createLocalDocumentBucket(): R2Bucket {
  return {
    async put(objectKey: string, value: unknown, options?: LocalR2PutOptions) {
      await localDocumentObjectStorage.put({
        objectKey,
        body: await toArrayBuffer(value),
        contentType: options?.httpMetadata?.contentType ?? "application/octet-stream",
      });

      return null;
    },
    async get(objectKey: string) {
      const object = await localDocumentObjectStorage.get(objectKey);

      if (!object) {
        return null;
      }

      return {
        httpMetadata: { contentType: object.contentType },
        size: object.byteSize,
        async arrayBuffer() {
          return object.body.slice(0);
        },
      };
    },
    async delete(objectKey: string) {
      await localDocumentObjectStorage.delete(objectKey);
    },
  } as R2Bucket;
}

function createLocalQueue(resolveBindings: () => DawnCloudflareBindings): Queue<DawnQueueMessage> {
  return {
    async send(message: DawnQueueMessage) {
      await createDawnWorkerRuntime(resolveBindings()).handleMessage(message);
    },
  } as unknown as Queue<DawnQueueMessage>;
}

async function toArrayBuffer(value: unknown): Promise<ArrayBuffer> {
  if (value instanceof ArrayBuffer) {
    return value.slice(0);
  }

  if (ArrayBuffer.isView(value)) {
    const copy = new Uint8Array(value.byteLength);
    copy.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
    return copy.buffer;
  }

  if (typeof value === "string") {
    return toArrayBuffer(new TextEncoder().encode(value));
  }

  if (value instanceof Blob) {
    return value.arrayBuffer();
  }

  throw new Error("Unsupported local document object body");
}
