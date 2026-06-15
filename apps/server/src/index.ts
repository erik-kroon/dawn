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
  dispatchOutboxEvents,
  listBankConnections,
  listBillingWorkspace,
  listBusinessReport,
  listDocuments,
  listInboxItems,
  listProjectWorkspace,
  listTransactionReviewWorkspace,
  correctDocumentExtraction,
  rejectInboxMatch,
  requestBankConnectionSyncFromWebhook,
  resolveAppRequest,
  resolveScopedActorAppRequest,
  resolveSessionAppRequest,
  resolveTeamAccess,
  resolvePublicApiKey,
  assertAccountantPacketDownloadAvailable,
  type CreateLedgerTransactionCommand,
  type DocumentExtractionFields,
  type ResolvedAppRequest,
} from "@dawn/app";
import { auth } from "@dawn/auth";
import { DrizzleDawnRepository } from "@dawn/db/dawn-repository";
import type { PublicApiScope } from "@dawn/domain";
import { env } from "@dawn/env/server";
import type { DawnCloudflareBindings } from "@dawn/infra/cloudflare";
import type { DawnQueueMessage } from "@dawn/jobs";
import { verifySandboxBankingWebhook } from "@dawn/integrations";
import {
  projectSyncCollectionContract,
  syncSubscriptionSearchParams,
  transactionSyncCollectionContract,
  type SyncCollectionContract,
} from "@dawn/sync";
import { initLogger } from "evlog";
import { createAuthMiddleware, type BetterAuthInstance } from "evlog/better-auth";
import { evlog, type EvlogVariables } from "evlog/hono";
import { Hono, type Context as HonoContext } from "hono";
import { cors } from "hono/cors";

import { resolveCorsOrigin } from "./cors";
import { createTransactionImportPayloadStorage } from "./csv-transaction-import";
import { createR2DocumentObjectStorage } from "./document-storage";
import { logServerError, requestIdFromHeaders } from "./observability";
import { createCloudflareOutboxQueuePublisher } from "./outbox-queue";
import { enforcePublicApiRateLimit } from "./rate-limit";
import { publishTenantSyncInvalidation } from "./tenant-sync";
import { handleDawnWorkerQueueBatch, requestScheduledEmailInboxSyncs } from "./worker-runtime";
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
type LocalSyncSubscriptionHandler = (input: {
  context: HonoContext<ServerHonoEnv>;
  contract: SyncCollectionContract;
  teamId: string;
}) => Promise<Response> | Response;
type PublicApiPermission = Parameters<typeof resolveTeamAccess>[2];
type PublicApiMethod = "get" | "post";
type PublicApiIdempotencyPolicy = "none" | "required";
type PublicApiOperationParameter = {
  name: string;
  in: "query" | "header" | "path";
  required: boolean;
};
type PublicApiOperationResponse = {
  body: unknown;
  status?: 200 | 201 | 202;
};
type PublicApiParseContext = {
  context: HonoContext<ServerHonoEnv>;
  body: Record<string, unknown>;
  idempotencyKey(): string | null;
};
type PublicApiExecuteContext<TInput> = {
  context: HonoContext<ServerHonoEnv>;
  repository: DrizzleDawnRepository;
  request: ResolvedAppRequest;
  input: TInput;
};
type PublicApiOperationContract<TInput extends { teamId: string }> = {
  id: string;
  method: PublicApiMethod;
  path: string;
  summary: string;
  scope: PublicApiScope;
  permission: PublicApiPermission;
  idempotency: PublicApiIdempotencyPolicy;
  successStatus: 200 | 201 | 202;
  parameters: PublicApiOperationParameter[];
  responses: Record<string, { description: string }>;
  parseInput(context: PublicApiParseContext): TInput;
  execute(context: PublicApiExecuteContext<TInput>): Promise<PublicApiOperationResponse>;
};
type PublicApiOpenApiDocument = {
  openapi: string;
  info: {
    title: string;
    version: string;
  };
  servers: Array<{ url: string }>;
  components: {
    securitySchemes: {
      bearerApiKey: {
        type: string;
        scheme: string;
      };
    };
  };
  security: Array<Record<string, unknown>>;
  paths: Record<string, Record<string, unknown>>;
};

let localSyncSubscriptionHandler: LocalSyncSubscriptionHandler | null = null;

export function configureLocalSyncSubscriptionHandler(
  handler: LocalSyncSubscriptionHandler | null,
) {
  localSyncSubscriptionHandler = handler;
}

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
    new DrizzleDawnRepository(),
    resolveAppRequest({
      actor: { id: payload.actorId, type: "user" },
      source: "session",
      requestId: payload.requestId,
      teamId: payload.teamId,
    }),
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

  if (isAccountantPacketDownloadPayload(payload)) {
    try {
      await assertAccountantPacketDownloadAvailable(new DrizzleDawnRepository(), {
        teamId: payload.teamId,
        packetId: payload.documentId,
        objectKey: payload.objectKey,
      });
    } catch (error) {
      if (error instanceof AppError) {
        return c.json({ error: error.message }, appErrorStatus(error));
      }

      throw error;
    }
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

app.get(transactionSyncCollectionContract.subscription.publicPath, async (c) => {
  return handleSyncSubscription(c, transactionSyncCollectionContract);
});

app.get(projectSyncCollectionContract.subscription.publicPath, async (c) => {
  return handleSyncSubscription(c, projectSyncCollectionContract);
});

async function handleSyncSubscription(
  c: HonoContext<ServerHonoEnv>,
  contract: SyncCollectionContract,
) {
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
      new DrizzleDawnRepository(),
      resolveSessionAppRequest({
        user: {
          id: session.user.id,
          email: session.user.email,
        },
        requestId: c.req.header("x-request-id"),
        teamId,
      }),
      contract.authorization.permission,
      contract.authorization.subscriptionForbiddenMessage,
    );
  } catch (error) {
    if (error instanceof AppError) {
      return c.json({ error: error.message }, appErrorStatus(error));
    }

    throw error;
  }

  const tenantCoordinator = c.env.DAWN_TENANT_COORDINATOR;

  if (!tenantCoordinator) {
    if (localSyncSubscriptionHandler) {
      return localSyncSubscriptionHandler({ context: c, contract, teamId });
    }

    return c.json(
      { error: "Realtime sync is unavailable: DAWN_TENANT_COORDINATOR binding is missing" },
      503,
    );
  }

  const id = tenantCoordinator.idFromName(teamId);
  const stub = tenantCoordinator.get(id);
  const url = new URL(c.req.url);
  url.pathname = contract.subscription.coordinatorPath;
  url.search = syncSubscriptionSearchParams({
    teamId,
    collection: contract.collection.id,
  }).toString();

  return stub.fetch(new Request(url.toString(), c.req.raw));
}

app.post("/internal/outbox/dispatch", async (c) => {
  const authorization = c.req.header("authorization");

  if (authorization !== `Bearer ${c.env.BETTER_AUTH_SECRET}`) {
    return c.json({ error: "Not found" }, 404);
  }

  const limitQuery = Number(c.req.query("limit") ?? "25");
  const limit = Number.isInteger(limitQuery) && limitQuery > 0 ? Math.min(limitQuery, 100) : 25;
  const result = await dispatchOutboxEvents(
    new DrizzleDawnRepository(),
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

type TeamScopedPublicApiInput = {
  teamId: string;
};

type CreateTransactionPublicApiInput = {
  teamId: string;
  command: CreateLedgerTransactionCommand;
};

type CreateDocumentUploadPublicApiInput = {
  teamId: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  checksumSha256: string | null;
  idempotencyKey: string;
};

type CreateDocumentDownloadPublicApiInput = {
  teamId: string;
  documentId: string;
};

type CorrectDocumentExtractionPublicApiInput = {
  teamId: string;
  inboxItemId: string;
  fields: DocumentExtractionFields;
  idempotencyKey: string;
};

type ResolveInboxMatchPublicApiInput = {
  teamId: string;
  suggestionId: string;
  reason?: string | null;
  idempotencyKey: string;
};

type CreateInvoicePublicApiInput = {
  teamId: string;
  customerId: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string | null;
  currency: string;
  discountBasisPoints: number | null;
  notes: string | null;
  lines: ReturnType<typeof requireInvoiceLines>;
  idempotencyKey: string;
};

type CreateCustomerPublicApiInput = {
  teamId: string;
  name: string;
  email: string | null;
  billingAddress: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactRole: string | null;
  idempotencyKey: string;
};

type CreateProductPublicApiInput = {
  teamId: string;
  name: string;
  type: "product" | "service";
  description: string | null;
  unitPrice: PublicApiMoney;
  defaultTaxRateBasisPoints: number | null;
  idempotencyKey: string;
};

type CreateProjectPublicApiInput = {
  teamId: string;
  customerId: string;
  name: string;
  description: string | null;
  billableRate: PublicApiMoney;
  idempotencyKey: string;
};

type CreateTimeEntryPublicApiInput = {
  teamId: string;
  projectId: string;
  actorId: string | null;
  description: string;
  occurredOn: string;
  durationMinutes: number;
  billableStatus: "billable" | "non_billable";
  billableRate: PublicApiMoney | null;
  idempotencyKey: string;
};

type ReportOverviewPublicApiInput = {
  teamId: string;
  from: string | null;
  to: string | null;
};

type CreateWebhookSubscriptionPublicApiInput = {
  teamId: string;
  url: string;
  eventTypes: string[];
  idempotencyKey: string;
};

const teamIdQueryParameter = {
  name: "teamId",
  in: "query",
  required: true,
} satisfies PublicApiOperationParameter;

const idempotencyHeaderParameter = {
  name: "Idempotency-Key",
  in: "header",
  required: true,
} satisfies PublicApiOperationParameter;

const optionalFromQueryParameter = {
  name: "from",
  in: "query",
  required: false,
} satisfies PublicApiOperationParameter;

const optionalToQueryParameter = {
  name: "to",
  in: "query",
  required: false,
} satisfies PublicApiOperationParameter;

const documentIdPathParameter = {
  name: "documentId",
  in: "path",
  required: true,
} satisfies PublicApiOperationParameter;

const inboxItemIdPathParameter = {
  name: "inboxItemId",
  in: "path",
  required: true,
} satisfies PublicApiOperationParameter;

const suggestionIdPathParameter = {
  name: "suggestionId",
  in: "path",
  required: true,
} satisfies PublicApiOperationParameter;

const listTransactionsPublicApiOperation: PublicApiOperationContract<TeamScopedPublicApiInput> = {
  id: "listTransactions",
  method: "get",
  path: "/transactions",
  summary: "List team transactions",
  scope: "transactions.read",
  permission: "transactions.read",
  idempotency: "none",
  successStatus: 200,
  parameters: [teamIdQueryParameter],
  responses: {
    "200": { description: "Team transaction list" },
  },
  parseInput({ context }) {
    return {
      teamId: requireQueryString(context, "teamId"),
    };
  },
  async execute({ repository, request }) {
    const workspace = await listTransactionReviewWorkspace(repository, request);

    return {
      body: {
        data: workspace.transactions,
      },
    };
  },
};

const createTransactionPublicApiOperation: PublicApiOperationContract<CreateTransactionPublicApiInput> =
  {
    id: "createTransaction",
    method: "post",
    path: "/transactions",
    summary: "Create a ledger transaction",
    scope: "transactions.write",
    permission: "transactions.write",
    idempotency: "required",
    successStatus: 201,
    parameters: [idempotencyHeaderParameter],
    responses: {
      "201": { description: "Created ledger transaction" },
    },
    parseInput({ body, idempotencyKey }) {
      const teamId = requireString(body.teamId, "teamId");

      return {
        teamId,
        command: {
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
          idempotencyKey: requireParsedIdempotencyKey(idempotencyKey()),
        },
      };
    },
    async execute({ repository, request, input }) {
      const result = await createLedgerTransaction(repository, request, input.command);

      return {
        body: result,
        status: 201,
      };
    },
  };

const listBankAccountsPublicApiOperation: PublicApiOperationContract<TeamScopedPublicApiInput> = {
  id: "listBankAccounts",
  method: "get",
  path: "/bank-accounts",
  summary: "List bank accounts and connections",
  scope: "bank_accounts.read",
  permission: "transactions.read",
  idempotency: "none",
  successStatus: 200,
  parameters: [teamIdQueryParameter],
  responses: {
    "200": { description: "Team bank account and connection list" },
  },
  parseInput({ context }) {
    return {
      teamId: requireQueryString(context, "teamId"),
    };
  },
  async execute({ repository, request, input }) {
    const workspace = await listBankConnections(repository, [], request, { teamId: input.teamId });

    return {
      body: {
        data: workspace.connections,
      },
    };
  },
};

const listInvoicesPublicApiOperation: PublicApiOperationContract<TeamScopedPublicApiInput> = {
  id: "listInvoices",
  method: "get",
  path: "/invoices",
  summary: "List team invoices",
  scope: "invoices.read",
  permission: "invoices.read",
  idempotency: "none",
  successStatus: 200,
  parameters: [teamIdQueryParameter],
  responses: {
    "200": { description: "Team invoice list" },
  },
  parseInput({ context }) {
    return {
      teamId: requireQueryString(context, "teamId"),
    };
  },
  async execute({ repository, request }) {
    const billing = await listBillingWorkspace(repository, request);

    return {
      body: {
        data: billing.invoices,
      },
    };
  },
};

const createInvoicePublicApiOperation: PublicApiOperationContract<CreateInvoicePublicApiInput> = {
  id: "createInvoice",
  method: "post",
  path: "/invoices",
  summary: "Create an invoice draft",
  scope: "invoices.write",
  permission: "invoices.write",
  idempotency: "required",
  successStatus: 201,
  parameters: [idempotencyHeaderParameter],
  responses: {
    "201": { description: "Created invoice draft" },
  },
  parseInput({ body, idempotencyKey }) {
    return {
      teamId: requireString(body.teamId, "teamId"),
      customerId: requireString(body.customerId, "customerId"),
      invoiceNumber: requireString(body.invoiceNumber, "invoiceNumber"),
      issueDate: requireString(body.issueDate, "issueDate"),
      dueDate: optionalString(body.dueDate),
      currency: requireString(body.currency, "currency"),
      discountBasisPoints: optionalNumber(body.discountBasisPoints),
      notes: optionalString(body.notes),
      lines: requireInvoiceLines(body.lines),
      idempotencyKey: requireParsedIdempotencyKey(idempotencyKey()),
    };
  },
  async execute({ repository, request, input }) {
    const result = await createDraftInvoice(repository, request, input);

    return {
      body: result,
      status: 201,
    };
  },
};

const listDocumentsPublicApiOperation: PublicApiOperationContract<TeamScopedPublicApiInput> = {
  id: "listDocuments",
  method: "get",
  path: "/documents",
  summary: "List team documents",
  scope: "documents.read",
  permission: "documents.read",
  idempotency: "none",
  successStatus: 200,
  parameters: [teamIdQueryParameter],
  responses: {
    "200": { description: "Team document list" },
  },
  parseInput({ context }) {
    return {
      teamId: requireQueryString(context, "teamId"),
    };
  },
  async execute({ repository, request, input }) {
    const workspace = await listDocuments(repository, request, { teamId: input.teamId });

    return {
      body: {
        data: workspace.documents,
      },
    };
  },
};

const createDocumentUploadPublicApiOperation: PublicApiOperationContract<CreateDocumentUploadPublicApiInput> =
  {
    id: "createDocumentUpload",
    method: "post",
    path: "/documents/uploads",
    summary: "Create a signed document upload",
    scope: "documents.write",
    permission: "documents.write",
    idempotency: "required",
    successStatus: 201,
    parameters: [idempotencyHeaderParameter],
    responses: {
      "201": { description: "Created signed document upload" },
    },
    parseInput({ body, idempotencyKey }) {
      return {
        teamId: requireString(body.teamId, "teamId"),
        fileName: requireString(body.fileName, "fileName"),
        contentType: requireString(body.contentType, "contentType"),
        byteSize: requirePositiveSafeInteger(body.byteSize, "byteSize"),
        checksumSha256: optionalString(body.checksumSha256),
        idempotencyKey: requireParsedIdempotencyKey(idempotencyKey()),
      };
    },
    async execute({ context, repository, request, input }) {
      const result = await createDocumentUpload(
        repository,
        createPublicDocumentUrlSigner(context.env),
        request,
        input,
      );

      return {
        body: result,
        status: 201,
      };
    },
  };

const createDocumentDownloadPublicApiOperation: PublicApiOperationContract<CreateDocumentDownloadPublicApiInput> =
  {
    id: "createDocumentDownload",
    method: "post",
    path: "/documents/:documentId/download",
    summary: "Create a signed document download",
    scope: "documents.read",
    permission: "documents.read",
    idempotency: "none",
    successStatus: 200,
    parameters: [documentIdPathParameter],
    responses: {
      "200": { description: "Created signed document download" },
    },
    parseInput({ context, body }) {
      return {
        teamId: requireString(body.teamId, "teamId"),
        documentId: requirePathString(context, "documentId"),
      };
    },
    async execute({ context, repository, request, input }) {
      const result = await createDocumentDownload(
        repository,
        createPublicDocumentUrlSigner(context.env),
        request,
        input,
      );

      return {
        body: result,
      };
    },
  };

const listInboxItemsPublicApiOperation: PublicApiOperationContract<TeamScopedPublicApiInput> = {
  id: "listInboxItems",
  method: "get",
  path: "/inbox-items",
  summary: "List team inbox items",
  scope: "inbox.read",
  permission: "documents.read",
  idempotency: "none",
  successStatus: 200,
  parameters: [teamIdQueryParameter],
  responses: {
    "200": { description: "Team inbox item list" },
  },
  parseInput({ context }) {
    return {
      teamId: requireQueryString(context, "teamId"),
    };
  },
  async execute({ repository, request, input }) {
    const workspace = await listInboxItems(repository, request, { teamId: input.teamId });

    return {
      body: {
        data: workspace.inboxItems,
      },
    };
  },
};

const correctDocumentExtractionPublicApiOperation: PublicApiOperationContract<CorrectDocumentExtractionPublicApiInput> =
  {
    id: "correctDocumentExtraction",
    method: "post",
    path: "/inbox-items/:inboxItemId/extraction-correction",
    summary: "Correct extracted document fields",
    scope: "inbox.write",
    permission: "documents.write",
    idempotency: "required",
    successStatus: 201,
    parameters: [inboxItemIdPathParameter, idempotencyHeaderParameter],
    responses: {
      "201": { description: "Corrected document extraction" },
    },
    parseInput({ context, body, idempotencyKey }) {
      return {
        teamId: requireString(body.teamId, "teamId"),
        inboxItemId: requirePathString(context, "inboxItemId"),
        fields: requireDocumentExtractionFields(body.fields),
        idempotencyKey: requireParsedIdempotencyKey(idempotencyKey()),
      };
    },
    async execute({ repository, request, input }) {
      const result = await correctDocumentExtraction(repository, request, input);

      return {
        body: result,
        status: 201,
      };
    },
  };

const acceptInboxMatchPublicApiOperation: PublicApiOperationContract<ResolveInboxMatchPublicApiInput> =
  {
    id: "acceptInboxMatch",
    method: "post",
    path: "/inbox-matches/:suggestionId/accept",
    summary: "Accept an inbox transaction match",
    scope: "inbox.write",
    permission: "transactions.write",
    idempotency: "required",
    successStatus: 201,
    parameters: [suggestionIdPathParameter, idempotencyHeaderParameter],
    responses: {
      "201": { description: "Accepted inbox transaction match" },
    },
    parseInput({ context, body, idempotencyKey }) {
      return {
        teamId: requireString(body.teamId, "teamId"),
        suggestionId: requirePathString(context, "suggestionId"),
        idempotencyKey: requireParsedIdempotencyKey(idempotencyKey()),
      };
    },
    async execute({ repository, request, input }) {
      const result = await acceptInboxMatch(repository, request, input);

      return {
        body: result,
        status: 201,
      };
    },
  };

const rejectInboxMatchPublicApiOperation: PublicApiOperationContract<ResolveInboxMatchPublicApiInput> =
  {
    id: "rejectInboxMatch",
    method: "post",
    path: "/inbox-matches/:suggestionId/reject",
    summary: "Reject an inbox transaction match",
    scope: "inbox.write",
    permission: "transactions.write",
    idempotency: "required",
    successStatus: 201,
    parameters: [suggestionIdPathParameter, idempotencyHeaderParameter],
    responses: {
      "201": { description: "Rejected inbox transaction match" },
    },
    parseInput({ context, body, idempotencyKey }) {
      return {
        teamId: requireString(body.teamId, "teamId"),
        suggestionId: requirePathString(context, "suggestionId"),
        reason: optionalString(body.reason),
        idempotencyKey: requireParsedIdempotencyKey(idempotencyKey()),
      };
    },
    async execute({ repository, request, input }) {
      const result = await rejectInboxMatch(repository, request, input);

      return {
        body: result,
        status: 201,
      };
    },
  };

const listCustomersPublicApiOperation: PublicApiOperationContract<TeamScopedPublicApiInput> = {
  id: "listCustomers",
  method: "get",
  path: "/customers",
  summary: "List team customers and contacts",
  scope: "customers.read",
  permission: "invoices.read",
  idempotency: "none",
  successStatus: 200,
  parameters: [teamIdQueryParameter],
  responses: {
    "200": { description: "Team customer and contact list" },
  },
  parseInput({ context }) {
    return {
      teamId: requireQueryString(context, "teamId"),
    };
  },
  async execute({ repository, request }) {
    const billing = await listBillingWorkspace(repository, request);

    return {
      body: {
        data: billing.customers,
        contacts: billing.contacts,
      },
    };
  },
};

const createCustomerPublicApiOperation: PublicApiOperationContract<CreateCustomerPublicApiInput> = {
  id: "createCustomer",
  method: "post",
  path: "/customers",
  summary: "Create a customer",
  scope: "customers.write",
  permission: "invoices.write",
  idempotency: "required",
  successStatus: 201,
  parameters: [idempotencyHeaderParameter],
  responses: {
    "201": { description: "Created customer" },
  },
  parseInput({ body, idempotencyKey }) {
    return {
      teamId: requireString(body.teamId, "teamId"),
      name: requireString(body.name, "name"),
      email: optionalString(body.email),
      billingAddress: optionalString(body.billingAddress),
      contactName: optionalString(body.contactName),
      contactEmail: optionalString(body.contactEmail),
      contactRole: optionalString(body.contactRole),
      idempotencyKey: requireParsedIdempotencyKey(idempotencyKey()),
    };
  },
  async execute({ repository, request, input }) {
    const result = await createCustomer(repository, request, input);

    return {
      body: result,
      status: 201,
    };
  },
};

const listProductsPublicApiOperation: PublicApiOperationContract<TeamScopedPublicApiInput> = {
  id: "listProducts",
  method: "get",
  path: "/products",
  summary: "List team products",
  scope: "products.read",
  permission: "invoices.read",
  idempotency: "none",
  successStatus: 200,
  parameters: [teamIdQueryParameter],
  responses: {
    "200": { description: "Team product list" },
  },
  parseInput({ context }) {
    return {
      teamId: requireQueryString(context, "teamId"),
    };
  },
  async execute({ repository, request }) {
    const billing = await listBillingWorkspace(repository, request);

    return {
      body: {
        data: billing.products,
      },
    };
  },
};

const createProductPublicApiOperation: PublicApiOperationContract<CreateProductPublicApiInput> = {
  id: "createProduct",
  method: "post",
  path: "/products",
  summary: "Create a product",
  scope: "products.write",
  permission: "invoices.write",
  idempotency: "required",
  successStatus: 201,
  parameters: [idempotencyHeaderParameter],
  responses: {
    "201": { description: "Created product" },
  },
  parseInput({ body, idempotencyKey }) {
    return {
      teamId: requireString(body.teamId, "teamId"),
      name: requireString(body.name, "name"),
      type: requireProductType(body.type),
      description: optionalString(body.description),
      unitPrice: requireMoney(body.unitPrice, "unitPrice"),
      defaultTaxRateBasisPoints: optionalNumber(body.defaultTaxRateBasisPoints),
      idempotencyKey: requireParsedIdempotencyKey(idempotencyKey()),
    };
  },
  async execute({ repository, request, input }) {
    const result = await createProduct(repository, request, input);

    return {
      body: result,
      status: 201,
    };
  },
};

const listProjectsPublicApiOperation: PublicApiOperationContract<TeamScopedPublicApiInput> = {
  id: "listProjects",
  method: "get",
  path: "/projects",
  summary: "List team projects and time entries",
  scope: "projects.read",
  permission: "projects.read",
  idempotency: "none",
  successStatus: 200,
  parameters: [teamIdQueryParameter],
  responses: {
    "200": { description: "Team project workspace" },
  },
  parseInput({ context }) {
    return {
      teamId: requireQueryString(context, "teamId"),
    };
  },
  async execute({ repository, request, input }) {
    const workspace = await listProjectWorkspace(repository, request, { teamId: input.teamId });

    return {
      body: {
        data: workspace.projects,
        customers: workspace.customers,
        projectMembers: workspace.projectMembers,
        timeEntries: workspace.timeEntries,
        report: workspace.report,
      },
    };
  },
};

const createProjectPublicApiOperation: PublicApiOperationContract<CreateProjectPublicApiInput> = {
  id: "createProject",
  method: "post",
  path: "/projects",
  summary: "Create a project",
  scope: "projects.write",
  permission: "projects.write",
  idempotency: "required",
  successStatus: 201,
  parameters: [idempotencyHeaderParameter],
  responses: {
    "201": { description: "Created project" },
  },
  parseInput({ body, idempotencyKey }) {
    return {
      teamId: requireString(body.teamId, "teamId"),
      customerId: requireString(body.customerId, "customerId"),
      name: requireString(body.name, "name"),
      description: optionalString(body.description),
      billableRate: requireMoney(body.billableRate, "billableRate"),
      idempotencyKey: requireParsedIdempotencyKey(idempotencyKey()),
    };
  },
  async execute({ repository, request, input }) {
    const result = await createProject(repository, request, input);

    return {
      body: result,
      status: 201,
    };
  },
};

const createTimeEntryPublicApiOperation: PublicApiOperationContract<CreateTimeEntryPublicApiInput> =
  {
    id: "createTimeEntry",
    method: "post",
    path: "/time-entries",
    summary: "Create a time entry",
    scope: "time_entries.write",
    permission: "projects.write",
    idempotency: "required",
    successStatus: 201,
    parameters: [idempotencyHeaderParameter],
    responses: {
      "201": { description: "Created time entry" },
    },
    parseInput({ body, idempotencyKey }) {
      return {
        teamId: requireString(body.teamId, "teamId"),
        projectId: requireString(body.projectId, "projectId"),
        actorId: optionalString(body.actorId),
        description: requireString(body.description, "description"),
        occurredOn: requireString(body.occurredOn, "occurredOn"),
        durationMinutes: requireSafeInteger(body.durationMinutes, "durationMinutes"),
        billableStatus: body.billableStatus === "non_billable" ? "non_billable" : "billable",
        billableRate: optionalMoney(body.billableRate),
        idempotencyKey: requireParsedIdempotencyKey(idempotencyKey()),
      };
    },
    async execute({ repository, request, input }) {
      const result = await createTimeEntry(repository, request, input);

      return {
        body: result,
        status: 201,
      };
    },
  };

const reportOverviewPublicApiOperation: PublicApiOperationContract<ReportOverviewPublicApiInput> = {
  id: "readReportOverview",
  method: "get",
  path: "/reports/overview",
  summary: "Read business report overview",
  scope: "reports.read",
  permission: "transactions.read",
  idempotency: "none",
  successStatus: 200,
  parameters: [teamIdQueryParameter, optionalFromQueryParameter, optionalToQueryParameter],
  responses: {
    "200": { description: "Business report overview" },
  },
  parseInput({ context }) {
    return {
      teamId: requireQueryString(context, "teamId"),
      from: optionalString(context.req.query("from")),
      to: optionalString(context.req.query("to")),
    };
  },
  async execute({ repository, request, input }) {
    const workspace = await listBusinessReport(repository, request, input);

    return {
      body: workspace,
    };
  },
};

const createWebhookSubscriptionPublicApiOperation: PublicApiOperationContract<CreateWebhookSubscriptionPublicApiInput> =
  {
    id: "createWebhookSubscription",
    method: "post",
    path: "/webhook-subscriptions",
    summary: "Create a webhook subscription",
    scope: "webhooks.manage",
    permission: "webhooks.manage",
    idempotency: "required",
    successStatus: 201,
    parameters: [idempotencyHeaderParameter],
    responses: {
      "201": { description: "Created webhook subscription" },
    },
    parseInput({ body, idempotencyKey }) {
      return {
        teamId: requireString(body.teamId, "teamId"),
        url: requireString(body.url, "url"),
        eventTypes: Array.isArray(body.eventTypes)
          ? body.eventTypes.filter(
              (eventType): eventType is string => typeof eventType === "string",
            )
          : [],
        idempotencyKey: requireParsedIdempotencyKey(idempotencyKey()),
      };
    },
    async execute({ repository, request, input }) {
      const result = await createWebhookSubscription(repository, request, input);

      return {
        body: result,
        status: 201,
      };
    },
  };

const publicApiOperationContracts = [
  listTransactionsPublicApiOperation,
  createTransactionPublicApiOperation,
  listBankAccountsPublicApiOperation,
  listInvoicesPublicApiOperation,
  createInvoicePublicApiOperation,
  listDocumentsPublicApiOperation,
  createDocumentUploadPublicApiOperation,
  createDocumentDownloadPublicApiOperation,
  listInboxItemsPublicApiOperation,
  correctDocumentExtractionPublicApiOperation,
  acceptInboxMatchPublicApiOperation,
  rejectInboxMatchPublicApiOperation,
  listCustomersPublicApiOperation,
  createCustomerPublicApiOperation,
  listProductsPublicApiOperation,
  createProductPublicApiOperation,
  listProjectsPublicApiOperation,
  createProjectPublicApiOperation,
  createTimeEntryPublicApiOperation,
  reportOverviewPublicApiOperation,
  createWebhookSubscriptionPublicApiOperation,
] as const;

for (const operation of publicApiOperationContracts) {
  registerPublicApiOperation(operation);
}

app.get("/api/v1/openapi.json", (c) => {
  return c.json(publicApiOpenApiDocument(c.req.url));
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

  const repository = new DrizzleDawnRepository();

  try {
    const result = await requestBankConnectionSyncFromWebhook(
      repository,
      resolveScopedActorAppRequest({
        actor: { id: "provider:sandbox-bank", type: "provider_webhook" },
        source: "provider_webhook",
        requestId: c.req.header("x-request-id"),
        teamId: verification.teamId,
      }),
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
  context.transactionImportPayloadStorage = createTransactionImportPayloadStorage(
    createR2DocumentObjectStorage(c.env.DAWN_DOCUMENTS),
  );

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

function isAccountantPacketDownloadPayload(input: { kind: string; objectKey: string }) {
  return input.kind === "download" && /\/accountant-packets\/[^/]+\.zip$/.test(input.objectKey);
}

class PublicApiHttpError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

function registerPublicApiOperation<TInput extends { teamId: string }>(
  operation: PublicApiOperationContract<TInput>,
) {
  const routePath = `/api/v1${operation.path}`;
  const handler = (c: HonoContext<ServerHonoEnv>) => handlePublicApiOperation(c, operation);

  if (operation.method === "get") {
    app.get(routePath, handler);
    return;
  }

  app.post(routePath, handler);
}

async function handlePublicApiOperation<TInput extends { teamId: string }>(
  c: HonoContext<ServerHonoEnv>,
  operation: PublicApiOperationContract<TInput>,
) {
  const repository = new DrizzleDawnRepository();

  try {
    const body = operation.method === "post" ? await c.req.json<Record<string, unknown>>() : {};
    let parsedIdempotencyKey: string | null | undefined;
    const idempotencyKey = () => {
      if (parsedIdempotencyKey === undefined) {
        parsedIdempotencyKey =
          operation.idempotency === "required"
            ? idempotencyKeyFromRequest(c.req.raw.headers, body)
            : null;
      }

      return parsedIdempotencyKey;
    };
    const input = operation.parseInput({
      context: c,
      body,
      idempotencyKey,
    });
    const requestIdempotencyKey = idempotencyKey();
    const request = await requirePublicApiRequest(
      c.req.raw.headers,
      repository,
      operation.scope,
      operation.permission,
      {
        teamId: input.teamId,
        idempotencyKey: requestIdempotencyKey,
      },
    );
    const response = await operation.execute({
      context: c,
      repository,
      request,
      input,
    });

    return c.json(response.body, response.status ?? operation.successStatus);
  } catch (error) {
    return publicApiError(c, error);
  }
}

async function requirePublicApiRequest(
  headers: Headers,
  repository: DrizzleDawnRepository,
  scope: PublicApiScope,
  permission: PublicApiPermission,
  input: { teamId: string; idempotencyKey?: string | null },
) {
  const authorization = headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : null;

  if (!token) {
    throw new AppError("FORBIDDEN", "Missing API key");
  }

  const resolved = await resolvePublicApiKey(repository, token);

  if (!resolved.apiKey.scopes.includes(scope)) {
    throw new AppError("FORBIDDEN", "API key scope does not allow this operation");
  }

  if (!resolved.actor.permissions?.includes(permission)) {
    throw new AppError("FORBIDDEN", "API key permission does not allow this operation");
  }

  return resolveScopedActorAppRequest({
    actor: resolved.actor,
    source: "api_key",
    requestId: headers.get("x-request-id"),
    teamId: input.teamId,
    idempotencyKey: input.idempotencyKey,
  });
}

function idempotencyKeyFromRequest(headers: Headers, body: Record<string, unknown>) {
  const key = headers.get("idempotency-key") ?? body.idempotencyKey;

  if (typeof key !== "string" || !key.trim()) {
    throw new AppError("CONFLICT", "Idempotency-Key header is required");
  }

  return key.trim();
}

function requireParsedIdempotencyKey(value: string | null) {
  if (!value) {
    throw new AppError("CONFLICT", "Idempotency-Key header is required");
  }

  return value;
}

function requireQueryString(c: HonoContext<ServerHonoEnv>, name: string) {
  const value = c.req.query(name);

  if (!value) {
    throw new PublicApiHttpError(400, `${name} is required`);
  }

  return value;
}

function requirePathString(c: HonoContext<ServerHonoEnv>, name: string) {
  const value = c.req.param(name);

  if (!value) {
    throw new PublicApiHttpError(400, `${name} is required`);
  }

  return value;
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
  if (error instanceof PublicApiHttpError) {
    return c.json({ error: error.message }, error.status);
  }

  if (error instanceof AppError) {
    return c.json({ error: error.message }, appErrorStatus(error));
  }

  return c.json({ error: errorMessage(error) }, 500);
}

function publicApiOpenApiPaths() {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const operation of publicApiOperationContracts) {
    const path = publicApiOpenApiPath(operation.path);
    paths[path] ??= {};
    paths[path][operation.method] = publicApiOpenApiOperation(operation);
  }

  return paths;
}

function publicApiOpenApiPath(path: string) {
  return path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

function publicApiOpenApiOperation<TInput extends { teamId: string }>(
  operation: PublicApiOperationContract<TInput>,
) {
  return {
    operationId: operation.id,
    summary: operation.summary,
    parameters: operation.parameters,
    responses: operation.responses,
    "x-required-scope": operation.scope,
    "x-idempotency": operation.idempotency,
  };
}

export function publicApiOpenApiDocument(requestUrl: string): PublicApiOpenApiDocument {
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
    paths: publicApiOpenApiPaths(),
  };
}

export default {
  fetch: app.fetch.bind(app),
  async queue(batch, env) {
    await handleDawnWorkerQueueBatch(batch, env);
  },
  async scheduled(controller, env) {
    await requestScheduledEmailInboxSyncs({
      env,
      scheduledTime: controller.scheduledTime,
    });
  },
} satisfies ExportedHandler<DawnCloudflareBindings, DawnQueueMessage>;
