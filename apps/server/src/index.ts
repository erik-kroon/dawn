import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { createContext } from "@dawn/api/context";
import { appRouter } from "@dawn/api/routers/index";
import { dispatchOutboxEvents } from "@dawn/app";
import { auth } from "@dawn/auth";
import { DrizzleTransactionReviewRepository } from "@dawn/db/transaction-review";
import { env } from "@dawn/env/server";
import type { DawnCloudflareBindings } from "@dawn/infra/cloudflare";
import { initLogger } from "evlog";
import { createAuthMiddleware, type BetterAuthInstance } from "evlog/better-auth";
import { evlog, type EvlogVariables } from "evlog/hono";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { createCloudflareOutboxQueuePublisher } from "./outbox-queue";

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
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

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

export default app;
