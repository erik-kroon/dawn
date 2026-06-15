import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { createContext } from "@dawn/api/context";
import { createDocumentUrlSigner, verifyDocumentUrlToken } from "@dawn/api/document-url";
import { appRouter } from "@dawn/api/routers/index";
import {
  acceptInboxMatch,
  AppError,
  completeDocumentUpload,
  createCustomer,
  createDocumentDownload,
  createDocumentUpload,
  createDraftInvoice,
  createLedgerTransaction,
  createProduct,
  createProject,
  createTimeEntry,
  createWebhookSubscription,
  deliverWebhooksForOutboxEvent,
  dispatchOutboxEvents,
  generateRecurringInvoice,
  generateWeeklyInsights,
  listBillingWorkspace,
  listBusinessReport,
  listDocuments,
  listInboxItems,
  listProjectWorkspace,
  listTransactionReviewWorkspace,
  correctDocumentExtraction,
  rejectInboxMatch,
  requestBankConnectionSyncFromWebhook,
  resolveTeamAccess,
  resolvePublicApiKey,
  runAutomationsForOutboxEvent,
  syncBankConnection,
  type DocumentExtractionFields,
  type WebhookDeliveryProvider,
} from "@dawn/app";
import { createMockInsightGenerationProvider } from "@dawn/ai";
import { auth } from "@dawn/auth";
import { DrizzleTransactionReviewRepository } from "@dawn/db/transaction-review";
import { env } from "@dawn/env/server";
import type { DawnCloudflareBindings } from "@dawn/infra/cloudflare";
import type { DawnQueueMessage } from "@dawn/jobs";
import {
  createMockBankingProvider,
  createSandboxBankingProvider,
  verifySandboxBankingWebhook,
  type BankingProvider,
} from "@dawn/integrations";
import { transactionSyncCollection } from "@dawn/sync";
import { initLogger } from "evlog";
import { createAuthMiddleware, type BetterAuthInstance } from "evlog/better-auth";
import { evlog, type EvlogVariables } from "evlog/hono";
import { Hono, type Context as HonoContext } from "hono";
import { cors } from "hono/cors";

import { resolveCorsOrigin } from "./cors";
import { processTeamDataExportJob } from "./data-export";
import { processDocumentExtractionJob } from "./document-extraction";
import { createR2DocumentObjectStorage } from "./document-storage";
import { logServerError, requestIdFromHeaders } from "./observability";
import { createCloudflareOutboxQueuePublisher } from "./outbox-queue";
import { enforcePublicApiRateLimit } from "./rate-limit";
import { publishTenantSyncInvalidation } from "./tenant-sync";
import { RateLimitError } from "@dawn/app/rate-limit";

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
type PublicApiPermission = Parameters<typeof resolveTeamAccess>[2];

const app = new Hono<ServerHonoEnv>();

app.use(evlog());
app.use("*", async (c, next) => {
  await identifyUser(c.get("log"), c.req.raw.headers, c.req.path);
  await next();
});
app.use("*", async (c, next) => {
  const requestId = requestIdFromHeaders(c.req.raw.headers);
  c.header("x-request-id", requestId);
  await next();
});

app.use(
  "/*",
  cors({
    origin: (origin) => resolveCorsOrigin({ origin, configuredOrigin: env.CORS_ORIGIN }),
    allowMethods: ["GET", "POST", "PUT", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "x-request-id"],
    credentials: true,
  }),
);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.use("/api/v1/*", async (c, next) => {
  try {
    enforcePublicApiRateLimit({ headers: c.req.raw.headers, path: c.req.path });
  } catch (error) {
    if (error instanceof RateLimitError) {
      c.header("retry-after", String(error.retryAfterSeconds));
      return c.json({ error: error.message }, 429);
    }

    throw error;
  }

  await next();
});

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
      logServerError(error, { operation: "openapi" });
    }),
  ],
});

export const rpcHandler = new RPCHandler(appRouter, {
  interceptors: [
    onError((error) => {
      logServerError(error, { operation: "rpc" });
    }),
  ],
});

app.get("/api/v1/openapi.json", (c) => {
  return c.json(publicApiOpenApiDocument(c.req.url));
});

app.get("/api/v1/transactions", async (c) => {
  const repository = new DrizzleTransactionReviewRepository();
  const teamId = c.req.query("teamId");

  if (!teamId) {
    return c.json({ error: "teamId is required" }, 400);
  }

  try {
    const actor = await requirePublicApiActor(c.req.raw.headers, repository, "transactions.read");
    const workspace = await listTransactionReviewWorkspace(repository, {
      actor,
      requestId: c.req.header("x-request-id") ?? crypto.randomUUID(),
      teamId,
    });

    return c.json({
      data: workspace.transactions,
    });
  } catch (error) {
    return publicApiError(c, error);
  }
});

app.post("/api/v1/transactions", async (c) => {
  const repository = new DrizzleTransactionReviewRepository();

  try {
    const body = await c.req.json<Record<string, unknown>>();
    const teamId = requireString(body.teamId, "teamId");
    const actor = await requirePublicApiActor(c.req.raw.headers, repository, "transactions.write");
    const result = await createLedgerTransaction(
      repository,
      {
        actor,
        requestId: c.req.header("x-request-id") ?? crypto.randomUUID(),
        teamId,
      },
      {
        teamId,
        accountId: requireString(body.accountId, "accountId"),
        description: requireString(body.description, "description"),
        postedAt: requireString(body.postedAt, "postedAt"),
        money: requireMoney(body.money, "money"),
        type:
          (body.type as "income" | "expense" | "transfer" | "fee" | "refund" | "adjustment") ??
          "expense",
        source:
          (body.source as "manual" | "csv_import" | "bank_sync" | "provider_webhook") ?? "manual",
        categoryId: optionalString(body.categoryId),
        idempotencyKey: idempotencyKeyFromRequest(c.req.raw.headers, body),
      },
    );

    return c.json(result, 201);
  } catch (error) {
    return publicApiError(c, error);
  }
});

app.get("/api/v1/invoices", async (c) => {
  const repository = new DrizzleTransactionReviewRepository();
  const teamId = c.req.query("teamId");

  if (!teamId) {
    return c.json({ error: "teamId is required" }, 400);
  }

  try {
    const actor = await requirePublicApiActor(c.req.raw.headers, repository, "invoices.read");
    const billing = await listBillingWorkspace(repository, {
      actor,
      requestId: c.req.header("x-request-id") ?? crypto.randomUUID(),
      teamId,
    });

    return c.json({
      data: billing.invoices,
    });
  } catch (error) {
    return publicApiError(c, error);
  }
});

app.get("/api/v1/documents", async (c) => {
  const repository = new DrizzleTransactionReviewRepository();
  const teamId = c.req.query("teamId");

  if (!teamId) {
    return c.json({ error: "teamId is required" }, 400);
  }

  try {
    const actor = await requirePublicApiActor(c.req.raw.headers, repository, "documents.read");
    const workspace = await listDocuments(
      repository,
      {
        actor,
        requestId: c.req.header("x-request-id") ?? crypto.randomUUID(),
        teamId,
      },
      { teamId },
    );

    return c.json({
      data: workspace.documents,
    });
  } catch (error) {
    return publicApiError(c, error);
  }
});

app.post("/api/v1/documents/uploads", async (c) => {
  const repository = new DrizzleTransactionReviewRepository();

  try {
    const body = await c.req.json<Record<string, unknown>>();
    const teamId = requireString(body.teamId, "teamId");
    const actor = await requirePublicApiActor(c.req.raw.headers, repository, "documents.write");
    const result = await createDocumentUpload(
      repository,
      createPublicDocumentUrlSigner(c.env),
      {
        actor,
        requestId: c.req.header("x-request-id") ?? crypto.randomUUID(),
        teamId,
      },
      {
        teamId,
        fileName: requireString(body.fileName, "fileName"),
        contentType: requireString(body.contentType, "contentType"),
        byteSize: requirePositiveSafeInteger(body.byteSize, "byteSize"),
        checksumSha256: optionalString(body.checksumSha256),
        idempotencyKey: idempotencyKeyFromRequest(c.req.raw.headers, body),
      },
    );

    return c.json(result, 201);
  } catch (error) {
    return publicApiError(c, error);
  }
});

app.post("/api/v1/documents/:documentId/download", async (c) => {
  const repository = new DrizzleTransactionReviewRepository();

  try {
    const body = await c.req.json<Record<string, unknown>>();
    const teamId = requireString(body.teamId, "teamId");
    const actor = await requirePublicApiActor(c.req.raw.headers, repository, "documents.read");
    const result = await createDocumentDownload(
      repository,
      createPublicDocumentUrlSigner(c.env),
      {
        actor,
        requestId: c.req.header("x-request-id") ?? crypto.randomUUID(),
        teamId,
      },
      {
        teamId,
        documentId: c.req.param("documentId"),
      },
    );

    return c.json(result);
  } catch (error) {
    return publicApiError(c, error);
  }
});

app.get("/api/v1/inbox-items", async (c) => {
  const repository = new DrizzleTransactionReviewRepository();
  const teamId = c.req.query("teamId");

  if (!teamId) {
    return c.json({ error: "teamId is required" }, 400);
  }

  try {
    const actor = await requirePublicApiActor(c.req.raw.headers, repository, "documents.read");
    const workspace = await listInboxItems(
      repository,
      {
        actor,
        requestId: c.req.header("x-request-id") ?? crypto.randomUUID(),
        teamId,
      },
      { teamId },
    );

    return c.json({
      data: workspace.inboxItems,
    });
  } catch (error) {
    return publicApiError(c, error);
  }
});

app.post("/api/v1/inbox-items/:inboxItemId/extraction-correction", async (c) => {
  const repository = new DrizzleTransactionReviewRepository();

  try {
    const body = await c.req.json<Record<string, unknown>>();
    const teamId = requireString(body.teamId, "teamId");
    const actor = await requirePublicApiActor(c.req.raw.headers, repository, "documents.write");
    const result = await correctDocumentExtraction(
      repository,
      {
        actor,
        requestId: c.req.header("x-request-id") ?? crypto.randomUUID(),
        teamId,
      },
      {
        teamId,
        inboxItemId: c.req.param("inboxItemId"),
        fields: requireDocumentExtractionFields(body.fields),
        idempotencyKey: idempotencyKeyFromRequest(c.req.raw.headers, body),
      },
    );

    return c.json(result, 201);
  } catch (error) {
    return publicApiError(c, error);
  }
});

app.post("/api/v1/inbox-matches/:suggestionId/accept", async (c) => {
  const repository = new DrizzleTransactionReviewRepository();

  try {
    const body = await c.req.json<Record<string, unknown>>();
    const teamId = requireString(body.teamId, "teamId");
    const actor = await requirePublicApiActor(c.req.raw.headers, repository, "transactions.write");
    const result = await acceptInboxMatch(
      repository,
      {
        actor,
        requestId: c.req.header("x-request-id") ?? crypto.randomUUID(),
        teamId,
      },
      {
        teamId,
        suggestionId: c.req.param("suggestionId"),
        idempotencyKey: idempotencyKeyFromRequest(c.req.raw.headers, body),
      },
    );

    return c.json(result, 201);
  } catch (error) {
    return publicApiError(c, error);
  }
});

app.post("/api/v1/inbox-matches/:suggestionId/reject", async (c) => {
  const repository = new DrizzleTransactionReviewRepository();

  try {
    const body = await c.req.json<Record<string, unknown>>();
    const teamId = requireString(body.teamId, "teamId");
    const actor = await requirePublicApiActor(c.req.raw.headers, repository, "transactions.write");
    const result = await rejectInboxMatch(
      repository,
      {
        actor,
        requestId: c.req.header("x-request-id") ?? crypto.randomUUID(),
        teamId,
      },
      {
        teamId,
        suggestionId: c.req.param("suggestionId"),
        reason: optionalString(body.reason),
        idempotencyKey: idempotencyKeyFromRequest(c.req.raw.headers, body),
      },
    );

    return c.json(result, 201);
  } catch (error) {
    return publicApiError(c, error);
  }
});

app.post("/api/v1/invoices", async (c) => {
  const repository = new DrizzleTransactionReviewRepository();

  try {
    const body = await c.req.json<Record<string, unknown>>();
    const teamId = requireString(body.teamId, "teamId");
    const actor = await requirePublicApiActor(c.req.raw.headers, repository, "invoices.write");
    const result = await createDraftInvoice(
      repository,
      {
        actor,
        requestId: c.req.header("x-request-id") ?? crypto.randomUUID(),
        teamId,
      },
      {
        teamId,
        customerId: requireString(body.customerId, "customerId"),
        invoiceNumber: requireString(body.invoiceNumber, "invoiceNumber"),
        issueDate: requireString(body.issueDate, "issueDate"),
        dueDate: optionalString(body.dueDate),
        currency: requireString(body.currency, "currency"),
        discountBasisPoints: optionalNumber(body.discountBasisPoints),
        notes: optionalString(body.notes),
        lines: requireInvoiceLines(body.lines),
        idempotencyKey: idempotencyKeyFromRequest(c.req.raw.headers, body),
      },
    );

    return c.json(result, 201);
  } catch (error) {
    return publicApiError(c, error);
  }
});

app.get("/api/v1/customers", async (c) => {
  const repository = new DrizzleTransactionReviewRepository();
  const teamId = c.req.query("teamId");

  if (!teamId) {
    return c.json({ error: "teamId is required" }, 400);
  }

  try {
    const actor = await requirePublicApiActor(c.req.raw.headers, repository, "invoices.read");
    const billing = await listBillingWorkspace(repository, {
      actor,
      requestId: c.req.header("x-request-id") ?? crypto.randomUUID(),
      teamId,
    });

    return c.json({
      data: billing.customers,
      contacts: billing.contacts,
    });
  } catch (error) {
    return publicApiError(c, error);
  }
});

app.post("/api/v1/customers", async (c) => {
  const repository = new DrizzleTransactionReviewRepository();

  try {
    const body = await c.req.json<Record<string, unknown>>();
    const teamId = requireString(body.teamId, "teamId");
    const actor = await requirePublicApiActor(c.req.raw.headers, repository, "invoices.write");
    const result = await createCustomer(
      repository,
      {
        actor,
        requestId: c.req.header("x-request-id") ?? crypto.randomUUID(),
        teamId,
      },
      {
        teamId,
        name: requireString(body.name, "name"),
        email: optionalString(body.email),
        billingAddress: optionalString(body.billingAddress),
        contactName: optionalString(body.contactName),
        contactEmail: optionalString(body.contactEmail),
        contactRole: optionalString(body.contactRole),
        idempotencyKey: idempotencyKeyFromRequest(c.req.raw.headers, body),
      },
    );

    return c.json(result, 201);
  } catch (error) {
    return publicApiError(c, error);
  }
});

app.get("/api/v1/products", async (c) => {
  const repository = new DrizzleTransactionReviewRepository();
  const teamId = c.req.query("teamId");

  if (!teamId) {
    return c.json({ error: "teamId is required" }, 400);
  }

  try {
    const actor = await requirePublicApiActor(c.req.raw.headers, repository, "invoices.read");
    const billing = await listBillingWorkspace(repository, {
      actor,
      requestId: c.req.header("x-request-id") ?? crypto.randomUUID(),
      teamId,
    });

    return c.json({
      data: billing.products,
    });
  } catch (error) {
    return publicApiError(c, error);
  }
});

app.post("/api/v1/products", async (c) => {
  const repository = new DrizzleTransactionReviewRepository();

  try {
    const body = await c.req.json<Record<string, unknown>>();
    const teamId = requireString(body.teamId, "teamId");
    const actor = await requirePublicApiActor(c.req.raw.headers, repository, "invoices.write");
    const result = await createProduct(
      repository,
      {
        actor,
        requestId: c.req.header("x-request-id") ?? crypto.randomUUID(),
        teamId,
      },
      {
        teamId,
        name: requireString(body.name, "name"),
        type: requireProductType(body.type),
        description: optionalString(body.description),
        unitPrice: requireMoney(body.unitPrice, "unitPrice"),
        defaultTaxRateBasisPoints: optionalNumber(body.defaultTaxRateBasisPoints),
        idempotencyKey: idempotencyKeyFromRequest(c.req.raw.headers, body),
      },
    );

    return c.json(result, 201);
  } catch (error) {
    return publicApiError(c, error);
  }
});

app.get("/api/v1/projects", async (c) => {
  const repository = new DrizzleTransactionReviewRepository();
  const teamId = c.req.query("teamId");

  if (!teamId) {
    return c.json({ error: "teamId is required" }, 400);
  }

  try {
    const actor = await requirePublicApiActor(c.req.raw.headers, repository, "projects.read");
    const workspace = await listProjectWorkspace(
      repository,
      {
        actor,
        requestId: c.req.header("x-request-id") ?? crypto.randomUUID(),
        teamId,
      },
      { teamId },
    );

    return c.json({
      data: workspace.projects,
      customers: workspace.customers,
      projectMembers: workspace.projectMembers,
      timeEntries: workspace.timeEntries,
      report: workspace.report,
    });
  } catch (error) {
    return publicApiError(c, error);
  }
});

app.post("/api/v1/projects", async (c) => {
  const repository = new DrizzleTransactionReviewRepository();

  try {
    const body = await c.req.json<Record<string, unknown>>();
    const teamId = requireString(body.teamId, "teamId");
    const actor = await requirePublicApiActor(c.req.raw.headers, repository, "projects.write");
    const result = await createProject(
      repository,
      {
        actor,
        requestId: c.req.header("x-request-id") ?? crypto.randomUUID(),
        teamId,
      },
      {
        teamId,
        customerId: requireString(body.customerId, "customerId"),
        name: requireString(body.name, "name"),
        description: optionalString(body.description),
        billableRate: requireMoney(body.billableRate, "billableRate"),
        idempotencyKey: idempotencyKeyFromRequest(c.req.raw.headers, body),
      },
    );

    return c.json(result, 201);
  } catch (error) {
    return publicApiError(c, error);
  }
});

app.post("/api/v1/time-entries", async (c) => {
  const repository = new DrizzleTransactionReviewRepository();

  try {
    const body = await c.req.json<Record<string, unknown>>();
    const teamId = requireString(body.teamId, "teamId");
    const actor = await requirePublicApiActor(c.req.raw.headers, repository, "projects.write");
    const result = await createTimeEntry(
      repository,
      {
        actor,
        requestId: c.req.header("x-request-id") ?? crypto.randomUUID(),
        teamId,
      },
      {
        teamId,
        projectId: requireString(body.projectId, "projectId"),
        actorId: optionalString(body.actorId),
        description: requireString(body.description, "description"),
        occurredOn: requireString(body.occurredOn, "occurredOn"),
        durationMinutes: requireSafeInteger(body.durationMinutes, "durationMinutes"),
        billableStatus: body.billableStatus === "non_billable" ? "non_billable" : "billable",
        billableRate: optionalMoney(body.billableRate),
        idempotencyKey: idempotencyKeyFromRequest(c.req.raw.headers, body),
      },
    );

    return c.json(result, 201);
  } catch (error) {
    return publicApiError(c, error);
  }
});

app.get("/api/v1/reports/overview", async (c) => {
  const repository = new DrizzleTransactionReviewRepository();
  const teamId = c.req.query("teamId");

  if (!teamId) {
    return c.json({ error: "teamId is required" }, 400);
  }

  try {
    const actor = await requirePublicApiActor(c.req.raw.headers, repository, "transactions.read");
    const workspace = await listBusinessReport(
      repository,
      {
        actor,
        requestId: c.req.header("x-request-id") ?? crypto.randomUUID(),
        teamId,
      },
      {
        teamId,
        from: optionalString(c.req.query("from")),
        to: optionalString(c.req.query("to")),
      },
    );

    return c.json(workspace);
  } catch (error) {
    return publicApiError(c, error);
  }
});

app.post("/api/v1/webhook-subscriptions", async (c) => {
  const repository = new DrizzleTransactionReviewRepository();

  try {
    const body = await c.req.json<Record<string, unknown>>();
    const teamId = requireString(body.teamId, "teamId");
    const actor = await requirePublicApiActor(c.req.raw.headers, repository, "webhooks.manage");
    const result = await createWebhookSubscription(
      repository,
      {
        actor,
        requestId: c.req.header("x-request-id") ?? crypto.randomUUID(),
        teamId,
      },
      {
        teamId,
        url: requireString(body.url, "url"),
        eventTypes: Array.isArray(body.eventTypes)
          ? body.eventTypes.filter(
              (eventType): eventType is string => typeof eventType === "string",
            )
          : [],
        idempotencyKey: idempotencyKeyFromRequest(c.req.raw.headers, body),
      },
    );

    return c.json(result, 201);
  } catch (error) {
    return publicApiError(c, error);
  }
});

app.post("/api/webhooks/banking/sandbox", async (c) => {
  const body = await c.req.text();
  const verification = verifySandboxBankingWebhook({
    body,
    signature: c.req.header("x-dawn-bank-signature") ?? null,
    secret: env.BETTER_AUTH_SECRET,
  });

  if (!verification.verified) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  const repository = new DrizzleTransactionReviewRepository();

  try {
    const result = await requestBankConnectionSyncFromWebhook(
      repository,
      {
        actor: { id: "provider:sandbox-bank", type: "provider_webhook" },
        requestId: c.req.header("x-request-id") ?? crypto.randomUUID(),
        teamId: verification.teamId,
      },
      {
        teamId: verification.teamId,
        verification,
        idempotencyKey:
          typeof verification.rawPayload.eventId === "string"
            ? verification.rawPayload.eventId
            : verification.providerConnectionId,
      },
    );

    return c.json({ queued: true, connectionId: result.connection.id }, 202);
  } catch (error) {
    return publicApiError(c, error);
  }
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

async function requirePublicApiActor(
  headers: Headers,
  repository: DrizzleTransactionReviewRepository,
  permission: PublicApiPermission,
) {
  const authorization = headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : null;

  if (!token) {
    throw new AppError("FORBIDDEN", "Missing API key");
  }

  const resolved = await resolvePublicApiKey(repository, token);

  if (!resolved.actor.permissions?.includes(permission)) {
    throw new AppError("FORBIDDEN", "API key scope does not allow this operation");
  }

  return resolved.actor;
}

function idempotencyKeyFromRequest(headers: Headers, body: Record<string, unknown>) {
  const key = headers.get("idempotency-key") ?? body.idempotencyKey;

  if (typeof key !== "string" || !key.trim()) {
    throw new AppError("CONFLICT", "Idempotency-Key header is required");
  }

  return key.trim();
}

function requireString(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new AppError("CONFLICT", `${name} is required`);
  }

  return value.trim();
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

type PublicApiMoney = {
  amountMinor: number;
  currency: string;
};

function requireMoney(value: unknown, name: string): PublicApiMoney {
  if (!isRecord(value)) {
    throw new AppError("CONFLICT", `${name} is required`);
  }

  const { amountMinor, currency } = value;

  if (typeof amountMinor !== "number" || !Number.isSafeInteger(amountMinor)) {
    throw new AppError("CONFLICT", `${name}.amountMinor is required`);
  }

  return {
    amountMinor,
    currency: requireString(currency, `${name}.currency`),
  };
}

function optionalMoney(value: unknown) {
  return value == null ? null : requireMoney(value, "billableRate");
}

function requireProductType(value: unknown) {
  if (value !== "product" && value !== "service") {
    throw new AppError("CONFLICT", "type must be product or service");
  }

  return value;
}

function requireInvoiceLines(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new AppError("CONFLICT", "lines are required");
  }

  return value.map((line, index) => {
    const name = `lines[${index}]`;

    if (!isRecord(line)) {
      throw new AppError("CONFLICT", `${name} is invalid`);
    }

    return {
      productId: optionalString(line.productId),
      description: requireString(line.description, `${name}.description`),
      quantityMilli: requireSafeInteger(line.quantityMilli, `${name}.quantityMilli`),
      unitPrice: requireMoney(line.unitPrice, `${name}.unitPrice`),
      discountBasisPoints: optionalNumber(line.discountBasisPoints),
      taxRateBasisPoints: optionalNumber(line.taxRateBasisPoints),
    };
  });
}

function requireSafeInteger(value: unknown, name: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new AppError("CONFLICT", `${name} is required`);
  }

  return value;
}

function requirePositiveSafeInteger(value: unknown, name: string) {
  const integer = requireSafeInteger(value, name);

  if (integer <= 0) {
    throw new AppError("CONFLICT", `${name} must be positive`);
  }

  return integer;
}

function requireDocumentExtractionFields(value: unknown): DocumentExtractionFields {
  if (!isRecord(value)) {
    throw new AppError("CONFLICT", "fields are required");
  }

  return {
    documentType: optionalDocumentType(value.documentType),
    merchantName: optionalString(value.merchantName),
    customerName: optionalString(value.customerName),
    issuedAt: optionalString(value.issuedAt),
    dueAt: optionalString(value.dueAt),
    invoiceNumber: optionalString(value.invoiceNumber),
    totalAmountMinor: optionalNumber(value.totalAmountMinor),
    currency: optionalString(value.currency),
    taxAmountMinor: optionalNumber(value.taxAmountMinor),
  };
}

function optionalDocumentType(value: unknown): DocumentExtractionFields["documentType"] {
  if (value == null || value === "") {
    return null;
  }

  const supported = [
    "receipt",
    "invoice_received",
    "invoice_sent",
    "bank_statement",
    "contract",
    "tax_document",
    "other",
  ] as const;

  if (supported.includes(value as (typeof supported)[number])) {
    return value as (typeof supported)[number];
  }

  throw new AppError("CONFLICT", "fields.documentType is invalid");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createPublicDocumentUrlSigner(bindings: DawnCloudflareBindings) {
  return createDocumentUrlSigner({
    baseUrl: env.BETTER_AUTH_URL,
    secret: bindings.BETTER_AUTH_SECRET,
  });
}

function publicApiError(c: HonoContext<ServerHonoEnv>, error: unknown) {
  if (error instanceof AppError) {
    return c.json({ error: error.message }, appErrorStatus(error));
  }

  return c.json({ error: errorMessage(error) }, 500);
}

export function publicApiOpenApiDocument(requestUrl: string) {
  const url = new URL(requestUrl);
  const origin = `${url.protocol}//${url.host}`;

  return {
    openapi: "3.1.0",
    info: {
      title: "Dawn Public API",
      version: "v1",
    },
    servers: [{ url: `${origin}/api/v1` }],
    components: {
      securitySchemes: {
        bearerApiKey: {
          type: "http",
          scheme: "bearer",
        },
      },
    },
    security: [{ bearerApiKey: [] }],
    paths: {
      "/transactions": {
        get: {
          summary: "List team transactions",
          parameters: [{ name: "teamId", in: "query", required: true }],
        },
        post: {
          summary: "Create a ledger transaction",
          parameters: [{ name: "Idempotency-Key", in: "header", required: true }],
        },
      },
      "/invoices": {
        get: {
          summary: "List team invoices",
          parameters: [{ name: "teamId", in: "query", required: true }],
        },
        post: {
          summary: "Create an invoice draft",
          parameters: [{ name: "Idempotency-Key", in: "header", required: true }],
        },
      },
      "/documents": {
        get: {
          summary: "List team documents",
          parameters: [{ name: "teamId", in: "query", required: true }],
        },
      },
      "/documents/uploads": {
        post: {
          summary: "Create a signed document upload",
          parameters: [{ name: "Idempotency-Key", in: "header", required: true }],
        },
      },
      "/documents/{documentId}/download": {
        post: {
          summary: "Create a signed document download",
          parameters: [{ name: "documentId", in: "path", required: true }],
        },
      },
      "/inbox-items": {
        get: {
          summary: "List team inbox items",
          parameters: [{ name: "teamId", in: "query", required: true }],
        },
      },
      "/inbox-items/{inboxItemId}/extraction-correction": {
        post: {
          summary: "Correct extracted document fields",
          parameters: [
            { name: "inboxItemId", in: "path", required: true },
            { name: "Idempotency-Key", in: "header", required: true },
          ],
        },
      },
      "/inbox-matches/{suggestionId}/accept": {
        post: {
          summary: "Accept an inbox transaction match",
          parameters: [
            { name: "suggestionId", in: "path", required: true },
            { name: "Idempotency-Key", in: "header", required: true },
          ],
        },
      },
      "/inbox-matches/{suggestionId}/reject": {
        post: {
          summary: "Reject an inbox transaction match",
          parameters: [
            { name: "suggestionId", in: "path", required: true },
            { name: "Idempotency-Key", in: "header", required: true },
          ],
        },
      },
      "/customers": {
        get: {
          summary: "List team customers and contacts",
          parameters: [{ name: "teamId", in: "query", required: true }],
        },
        post: {
          summary: "Create a customer",
          parameters: [{ name: "Idempotency-Key", in: "header", required: true }],
        },
      },
      "/products": {
        get: {
          summary: "List team products",
          parameters: [{ name: "teamId", in: "query", required: true }],
        },
        post: {
          summary: "Create a product",
          parameters: [{ name: "Idempotency-Key", in: "header", required: true }],
        },
      },
      "/projects": {
        get: {
          summary: "List team projects and time entries",
          parameters: [{ name: "teamId", in: "query", required: true }],
        },
        post: {
          summary: "Create a project",
          parameters: [{ name: "Idempotency-Key", in: "header", required: true }],
        },
      },
      "/time-entries": {
        post: {
          summary: "Create a time entry",
          parameters: [{ name: "Idempotency-Key", in: "header", required: true }],
        },
      },
      "/reports/overview": {
        get: {
          summary: "Read business report overview",
          parameters: [
            { name: "teamId", in: "query", required: true },
            { name: "from", in: "query", required: false },
            { name: "to", in: "query", required: false },
          ],
        },
      },
      "/webhook-subscriptions": {
        post: {
          summary: "Create a webhook subscription",
          parameters: [{ name: "Idempotency-Key", in: "header", required: true }],
        },
      },
    },
  };
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

  if (message.body.type === "invoice.recurring.generate") {
    await generateRecurringInvoice(new DrizzleTransactionReviewRepository(), {
      teamId: message.body.teamId,
      scheduleId: message.body.scheduleId,
      runAt: message.body.runAt,
      idempotencyKey: message.body.idempotencyKey,
    });
  }

  if (message.body.type === "insights.weekly.generate") {
    await generateWeeklyInsights(
      new DrizzleTransactionReviewRepository(),
      createMockInsightGenerationProvider(),
      {
        teamId: message.body.teamId,
        periodStart: message.body.periodStart,
        periodEnd: message.body.periodEnd,
        idempotencyKey: message.body.idempotencyKey,
      },
    );
  }

  if (message.body.type === "automation.run") {
    await runAutomationsForOutboxEvent(
      new DrizzleTransactionReviewRepository(),
      {
        actor: { id: "system:automation", type: "user" },
        requestId: message.body.idempotencyKey,
        teamId: message.body.teamId,
      },
      {
        teamId: message.body.teamId,
        outboxEventId: message.body.sourceOutboxEventId,
        enforceCallerPermission: false,
      },
    );
  }

  if (message.body.type === "bank.sync") {
    await syncBankConnection(
      new DrizzleTransactionReviewRepository(),
      requireBankingProvider(message.body.provider),
      {
        actor: { id: "system:bank-sync", type: "system" },
        requestId: message.body.idempotencyKey,
        teamId: message.body.teamId,
      },
      {
        teamId: message.body.teamId,
        connectionId: message.body.connectionId,
        idempotencyKey: message.body.idempotencyKey,
        enforceCallerPermission: false,
      },
    );
  }

  if (message.body.type === "webhook.deliver") {
    const result = await deliverWebhooksForOutboxEvent(
      new DrizzleTransactionReviewRepository(),
      createFetchWebhookDeliveryProvider(),
      {
        teamId: message.body.teamId,
        outboxEventId: message.body.sourceOutboxEventId,
      },
    );

    if (result.failed > 0) {
      throw new Error(`${result.failed} webhook deliveries failed`);
    }
  }

  if (message.body.type === "team_data.export") {
    await processTeamDataExportJob({
      repository: new DrizzleTransactionReviewRepository(),
      storage: createR2DocumentObjectStorage(env.DAWN_DOCUMENTS),
      message: message.body,
    });
  }

  if (message.body.type === "team_data.delete") {
    await new DrizzleTransactionReviewRepository().appendAuditEvent({
      teamId: message.body.teamId,
      actorId: "system:data-workflow",
      requestId: message.body.idempotencyKey,
      action: "team_data.deletion_job_gated",
      entityType: "team",
      entityId: message.body.teamId,
      metadata: {
        sourceOutboxEventId: message.body.sourceOutboxEventId,
        nextStep: "retention_provider_r2_cleanup_confirmation",
      },
    });
  }
}

function createFetchWebhookDeliveryProvider(): WebhookDeliveryProvider {
  return {
    async deliver(input) {
      const response = await fetch(input.url, {
        method: "POST",
        headers: input.headers,
        body: JSON.stringify(input.body),
      });

      return {
        status: response.status,
        body: await response.text(),
      };
    },
  };
}

function requireBankingProvider(providerName: string): BankingProvider {
  const providers = [
    createMockBankingProvider(),
    createSandboxBankingProvider({
      appUrl: env.BETTER_AUTH_URL,
      webhookSecret: env.BETTER_AUTH_SECRET,
    }),
  ];
  const provider = providers.find((candidate) => candidate.provider === providerName);

  if (!provider) {
    throw new Error(`Unsupported banking provider: ${providerName}`);
  }

  return provider;
}

export default {
  fetch: app.fetch.bind(app),
  async queue(batch, env) {
    for (const message of batch.messages) {
      try {
        await handleQueueMessage(message, env);
        message.ack();
      } catch (error) {
        logServerError(error, {
          operation: message.body.type,
          requestId: message.body.idempotencyKey,
          teamId: message.body.teamId,
          actorType: "system",
        });
        message.retry();
      }
    }
  },
} satisfies ExportedHandler<DawnCloudflareBindings, DawnQueueMessage>;
