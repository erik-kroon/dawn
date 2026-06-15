import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { createContext } from "@dawn/api/context";
import { verifyDocumentUrlToken } from "@dawn/api/document-url";
import { appRouter } from "@dawn/api/routers/index";
import {
  AppError,
  completeDocumentUpload,
  dispatchOutboxEvents,
  resolveTeamAccess,
} from "@dawn/app";
import { auth } from "@dawn/auth";
import { DrizzleTransactionReviewRepository } from "@dawn/db/transaction-review";
import { env } from "@dawn/env/server";
import type { DawnCloudflareBindings } from "@dawn/infra/cloudflare";
import type { DawnQueueMessage } from "@dawn/jobs";
import { transactionSyncCollection } from "@dawn/sync";
import { initLogger } from "evlog";
import { createAuthMiddleware, type BetterAuthInstance } from "evlog/better-auth";
import { evlog, type EvlogVariables } from "evlog/hono";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { processDocumentExtractionJob } from "./document-extraction";
import { createR2DocumentObjectStorage } from "./document-storage";
import { createCloudflareOutboxQueuePublisher } from "./outbox-queue";
import { publishTenantSyncInvalidation } from "./tenant-sync";

export { TenantCoordinator } from "./tenant-coordinator";

initLogger({
  env: { service: "dawn-server" },
});

const identifyUser = createAuthMiddleware(auth as BetterAuthInstance, {
  exclude: ["/api/auth/**"],
  maskEmail: true,
});

type ServerHonoEnv = EvlogVariables & {
  Bindings: DawnCloudflareBindings;
};

const app = new Hono<ServerHonoEnv>();

app.use(evlog());
app.use("*", async (c, next) => {
  await identifyUser(c.get("log"), c.req.raw.headers, c.req.path);
  await next();
});

app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "PUT", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.put("/documents/upload/:token", async (c) => {
  let payload: Awaited<ReturnType<typeof verifyDocumentUrlToken>>;

  try {
    payload = await verifyDocumentUrlToken({
      secret: c.env.BETTER_AUTH_SECRET,
      token: c.req.param("token"),
      kind: "upload",
    });
  } catch (error) {
    return c.json({ error: errorMessage(error) }, 401);
  }

  if (!payload.actorId || !payload.requestId || !payload.byteSize) {
    return c.json({ error: "Invalid upload token" }, 400);
  }

  const body = await c.req.arrayBuffer();

  if (body.byteLength !== payload.byteSize) {
    return c.json({ error: "Upload size does not match signed metadata" }, 409);
  }

  await createR2DocumentObjectStorage(c.env.DAWN_DOCUMENTS).put({
    objectKey: payload.objectKey,
    body,
    contentType: payload.contentType,
  });

  const result = await completeDocumentUpload(
    new DrizzleTransactionReviewRepository(),
    {
      actor: { id: payload.actorId, type: "user" },
      requestId: payload.requestId,
      teamId: payload.teamId,
    },
    {
      teamId: payload.teamId,
      documentId: payload.documentId,
      versionId: payload.versionId,
      byteSize: payload.byteSize,
    },
  );

  return c.json(result);
});

app.get("/documents/download/:token", async (c) => {
  let payload: Awaited<ReturnType<typeof verifyDocumentUrlToken>>;

  try {
    payload = await verifyDocumentUrlToken({
      secret: c.env.BETTER_AUTH_SECRET,
      token: c.req.param("token"),
      kind: "download",
    });
  } catch (error) {
    return c.json({ error: errorMessage(error) }, 401);
  }

  const object = await createR2DocumentObjectStorage(c.env.DAWN_DOCUMENTS).get(payload.objectKey);

  if (!object) {
    return c.json({ error: "Document object not found" }, 404);
  }

  return new Response(object.body, {
    headers: {
      "content-type": object.contentType,
      "content-length": String(object.byteSize),
      "content-disposition": `attachment; filename="${safeHeaderFileName(payload.fileName)}"`,
    },
  });
});

app.get("/sync/transactions/subscribe", async (c) => {
  if (c.req.header("Upgrade")?.toLowerCase() !== "websocket") {
    return c.text("Expected WebSocket upgrade", 426);
  }

  const teamId = c.req.query("teamId");

  if (!teamId) {
    return c.json({ error: "teamId is required" }, 400);
  }

  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!session?.user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    await resolveTeamAccess(
      new DrizzleTransactionReviewRepository(),
      {
        actor: { id: session.user.id, type: "user", email: session.user.email },
        requestId: c.req.header("x-request-id") ?? crypto.randomUUID(),
        teamId,
      },
      "transactions.read",
      "You cannot subscribe to this team's transactions",
    );
  } catch (error) {
    if (error instanceof AppError) {
      return c.json({ error: error.message }, appErrorStatus(error));
    }

    throw error;
  }

  const id = c.env.DAWN_TENANT_COORDINATOR.idFromName(teamId);
  const stub = c.env.DAWN_TENANT_COORDINATOR.get(id);
  const url = new URL(c.req.url);
  url.pathname = "/subscribe";
  url.search = new URLSearchParams({
    teamId,
    collection: transactionSyncCollection.id,
  }).toString();

  return stub.fetch(new Request(url.toString(), c.req.raw));
});

app.post("/internal/outbox/dispatch", async (c) => {
  const authorization = c.req.header("authorization");

  if (authorization !== `Bearer ${c.env.BETTER_AUTH_SECRET}`) {
    return c.json({ error: "Not found" }, 404);
  }

  const limitQuery = Number(c.req.query("limit") ?? "25");
  const limit = Number.isInteger(limitQuery) && limitQuery > 0 ? Math.min(limitQuery, 100) : 25;
  const result = await dispatchOutboxEvents(
    new DrizzleTransactionReviewRepository(),
    createCloudflareOutboxQueuePublisher(c.env.DAWN_JOBS),
    { limit },
  );

  return c.json(result);
});

app.post("/internal/sync/invalidate", async (c) => {
  const authorization = c.req.header("authorization");

  if (authorization !== `Bearer ${c.env.BETTER_AUTH_SECRET}`) {
    return c.json({ error: "Not found" }, 404);
  }

  const result = await publishTenantSyncInvalidation(c.env, await c.req.json());

  return c.json(result);
});

export const apiHandler = new OpenAPIHandler(appRouter, {
  plugins: [
    new OpenAPIReferencePlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    }),
  ],
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

export const rpcHandler = new RPCHandler(appRouter, {
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

app.use("/*", async (c, next) => {
  const context = await createContext({ context: c });

  const rpcResult = await rpcHandler.handle(c.req.raw, {
    prefix: "/rpc",
    context: context,
  });

  if (rpcResult.matched) {
    return c.newResponse(rpcResult.response.body, rpcResult.response);
  }

  const apiResult = await apiHandler.handle(c.req.raw, {
    prefix: "/api-reference",
    context: context,
  });

  if (apiResult.matched) {
    return c.newResponse(apiResult.response.body, apiResult.response);
  }

  await next();
});

app.get("/", (c) => {
  return c.text("OK");
});

function appErrorStatus(error: AppError) {
  if (error.code === "FORBIDDEN") {
    return 403;
  }

  if (error.code === "NOT_FOUND") {
    return 404;
  }

  return 409;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected server error";
}

function safeHeaderFileName(fileName: string) {
  return fileName.replace(/["\r\n]/g, "_");
}

async function handleQueueMessage(message: Message<DawnQueueMessage>, env: DawnCloudflareBindings) {
  if (message.body.type === "sync.invalidate") {
    await publishTenantSyncInvalidation(env, message.body);
  }

  if (message.body.type === "document.extract") {
    await processDocumentExtractionJob({
      repository: new DrizzleTransactionReviewRepository(),
      storage: createR2DocumentObjectStorage(env.DAWN_DOCUMENTS),
      message: message.body,
    });
  }
}

export default {
  fetch: app.fetch.bind(app),
  async queue(batch, env) {
    for (const message of batch.messages) {
      try {
        await handleQueueMessage(message, env);
        message.ack();
      } catch (error) {
        console.error(error);
        message.retry();
      }
    }
  },
} satisfies ExportedHandler<DawnCloudflareBindings, DawnQueueMessage>;
