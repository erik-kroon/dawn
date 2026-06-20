import { chat as tanStackChat } from "@tanstack/ai";
import { createGeminiChat, geminiText } from "@tanstack/ai-gemini";
import { openaiCompatibleText } from "@tanstack/ai-openai/compatible";
import { openRouterText } from "@tanstack/ai-openrouter";
import { extractText, extractTextItems, getDocumentProxy, type StructuredTextItem } from "unpdf";
import { z } from "zod";

export const documentExtractionProviderNames = [
  "gemini",
  "openrouter",
  "openai_compatible",
] as const;
export const documentExtractionModelRoles = ["primary", "secondary", "tertiary"] as const;

export type DocumentExtractionProviderName = (typeof documentExtractionProviderNames)[number];
export type DocumentExtractionModelRole = (typeof documentExtractionModelRoles)[number];
export type FinancialDocumentType = "receipt" | "invoice_received" | "other";

const dateStringSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .optional()
  .transform((value) => value ?? null);
const optionalTextSchema = z
  .string()
  .trim()
  .min(1)
  .nullable()
  .optional()
  .transform((value) => value ?? null);
const optionalUrlSchema = z
  .url()
  .nullable()
  .optional()
  .transform((value) => value ?? null);
const optionalLanguageSchema = z
  .string()
  .trim()
  .min(2)
  .max(16)
  .nullable()
  .optional()
  .transform((value) => value?.toLowerCase() ?? null);
const currencySchema = z
  .string()
  .trim()
  .length(3)
  .nullable()
  .optional()
  .transform((value) => value?.toUpperCase() ?? null);
const optionalMinorAmountSchema = z
  .number()
  .int()
  .safe()
  .nullable()
  .optional()
  .transform((value) => value ?? null);
const confidenceScoreSchema = z.number().min(0).max(1);
const fieldConfidenceSchema = z
  .record(z.string(), confidenceScoreSchema)
  .nullable()
  .optional()
  .transform((value) => value ?? {});

const extractedDocumentBaseSchema = z.object({
  totalAmountMinor: optionalMinorAmountSchema,
  currency: currencySchema,
  taxAmountMinor: optionalMinorAmountSchema,
  website: optionalUrlSchema,
  language: optionalLanguageSchema,
  fieldConfidence: fieldConfidenceSchema,
  overallConfidence: confidenceScoreSchema
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  rawText: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  summary: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
});

export const receiptExtractionSchema = extractedDocumentBaseSchema.extend({
  documentType: z.literal("receipt"),
  merchantName: optionalTextSchema,
  storeName: optionalTextSchema,
  issuedAt: dateStringSchema,
});

export const invoiceExtractionSchema = extractedDocumentBaseSchema.extend({
  documentType: z.literal("invoice_received"),
  vendorName: optionalTextSchema,
  customerName: optionalTextSchema,
  invoiceNumber: optionalTextSchema,
  issuedAt: dateStringSchema,
  dueAt: dateStringSchema,
});

export const otherDocumentExtractionSchema = z.object({
  documentType: z.literal("other"),
  reason: optionalTextSchema,
  language: optionalLanguageSchema,
  fieldConfidence: fieldConfidenceSchema,
  overallConfidence: confidenceScoreSchema
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  rawText: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  summary: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
});

export const documentExtractionOutputSchema = z.discriminatedUnion("documentType", [
  receiptExtractionSchema,
  invoiceExtractionSchema,
  otherDocumentExtractionSchema,
]);

const nullableStringSchema = z.string().trim().nullable();
const nullableNumberSchema = z.number().min(0).max(1).nullable();
const openAiDocumentExtractionOutputSchema = z.object({
  documentType: z.enum(["receipt", "invoice_received", "other"]),
  merchantName: nullableStringSchema,
  storeName: nullableStringSchema,
  vendorName: nullableStringSchema,
  customerName: nullableStringSchema,
  invoiceNumber: nullableStringSchema,
  issuedAt: dateStringSchema,
  dueAt: dateStringSchema,
  totalAmountMinor: optionalMinorAmountSchema,
  currency: currencySchema,
  taxAmountMinor: optionalMinorAmountSchema,
  website: z.string().trim().nullable(),
  language: nullableStringSchema,
  rawText: z.string().trim().nullable(),
  summary: z.string().trim().nullable(),
  overallConfidence: nullableNumberSchema,
  fieldConfidence: z.object({
    documentType: nullableNumberSchema,
    merchantName: nullableNumberSchema,
    storeName: nullableNumberSchema,
    vendorName: nullableNumberSchema,
    customerName: nullableNumberSchema,
    invoiceNumber: nullableNumberSchema,
    issuedAt: nullableNumberSchema,
    dueAt: nullableNumberSchema,
    totalAmountMinor: nullableNumberSchema,
    currency: nullableNumberSchema,
    taxAmountMinor: nullableNumberSchema,
  }),
});

const openAiConfidenceFields = [
  "documentType",
  "merchantName",
  "storeName",
  "vendorName",
  "customerName",
  "invoiceNumber",
  "issuedAt",
  "dueAt",
  "totalAmountMinor",
  "currency",
  "taxAmountMinor",
] as const;

const nullableStringJsonSchema = { type: ["string", "null"] };
const nullableNumberJsonSchema = { type: ["number", "null"], minimum: 0, maximum: 1 };
const nullableIntegerJsonSchema = { type: ["integer", "null"] };
const openAiDocumentExtractionJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    documentType: { type: "string", enum: ["receipt", "invoice_received", "other"] },
    merchantName: nullableStringJsonSchema,
    storeName: nullableStringJsonSchema,
    vendorName: nullableStringJsonSchema,
    customerName: nullableStringJsonSchema,
    invoiceNumber: nullableStringJsonSchema,
    issuedAt: nullableStringJsonSchema,
    dueAt: nullableStringJsonSchema,
    totalAmountMinor: nullableIntegerJsonSchema,
    currency: nullableStringJsonSchema,
    taxAmountMinor: nullableIntegerJsonSchema,
    website: nullableStringJsonSchema,
    language: nullableStringJsonSchema,
    rawText: nullableStringJsonSchema,
    summary: nullableStringJsonSchema,
    overallConfidence: nullableNumberJsonSchema,
    fieldConfidence: {
      type: "object",
      additionalProperties: false,
      properties: Object.fromEntries(
        openAiConfidenceFields.map((field) => [field, nullableNumberJsonSchema]),
      ),
      required: openAiConfidenceFields,
    },
  },
  required: [
    "documentType",
    "merchantName",
    "storeName",
    "vendorName",
    "customerName",
    "invoiceNumber",
    "issuedAt",
    "dueAt",
    "totalAmountMinor",
    "currency",
    "taxAmountMinor",
    "website",
    "language",
    "rawText",
    "summary",
    "overallConfidence",
    "fieldConfidence",
  ],
};

export type ReceiptExtractionOutput = z.infer<typeof receiptExtractionSchema>;
export type InvoiceExtractionOutput = z.infer<typeof invoiceExtractionSchema>;
export type OtherDocumentExtractionOutput = z.infer<typeof otherDocumentExtractionSchema>;
export type DocumentExtractionOutput = z.infer<typeof documentExtractionOutputSchema>;

export type NormalizedDocumentExtractionFields = {
  documentType: FinancialDocumentType;
  merchantName?: string | null;
  storeName?: string | null;
  vendorName?: string | null;
  customerName?: string | null;
  invoiceNumber?: string | null;
  issuedAt?: string | null;
  dueAt?: string | null;
  totalAmountMinor?: number | null;
  currency?: string | null;
  taxAmountMinor?: number | null;
  website?: string | null;
  language?: string | null;
};

export type DocumentExtractionConfidence = Partial<
  Record<keyof NormalizedDocumentExtractionFields | "overall", number>
>;

export type DocumentExtractionInput = {
  fileName: string;
  contentType: string;
  body?: ArrayBuffer | null;
  sourceUrl?: string | null;
  rawText?: string | null;
  documentTypeHint?: FinancialDocumentType | null;
};

export type DocumentExtractionModelConfig = {
  role: DocumentExtractionModelRole;
  provider: DocumentExtractionProviderName;
  model: string;
  timeoutMs?: number;
  apiKey?: string;
  baseURL?: string;
};

export type DocumentExtractionCascadeConfig = {
  primary: DocumentExtractionModelConfig;
  secondary?: DocumentExtractionModelConfig | null;
  tertiary?: DocumentExtractionModelConfig | null;
};

export type DocumentExtractionAttemptMetadata = {
  attempt: number;
  role: DocumentExtractionModelRole;
  provider: DocumentExtractionProviderName;
  model: string;
  timeoutMs: number;
  durationMs: number;
  status: "completed" | "failed";
  errorClass?: string;
  errorMessage?: string;
};

export type DocumentExtractionMetadata = {
  provider: DocumentExtractionProviderName;
  model: string;
  timeoutMs: number;
  durationMs: number;
  attempts: DocumentExtractionAttemptMetadata[];
};

export type DocumentExtractionResult = {
  fields: NormalizedDocumentExtractionFields;
  confidence: DocumentExtractionConfidence;
  rawText?: string | null;
  summary?: string | null;
  metadata: DocumentExtractionMetadata;
};

export type DocumentExtractionProvider = {
  source: "tanstack_ai" | "local_deterministic";
  extract(input: DocumentExtractionInput): Promise<DocumentExtractionResult>;
};

export type DocumentExtractionBinarySource =
  | { type: "data"; value: string; mimeType: string }
  | { type: "url"; value: string; mimeType: string };

export type DocumentExtractionContentPart =
  | { type: "text"; content: string }
  | {
      type: "image" | "document";
      source: DocumentExtractionBinarySource;
    };

export type DocumentExtractionMessage = {
  role: "user";
  content: string | DocumentExtractionContentPart[];
};

export type DocumentExtractionChatCall = (input: {
  adapter: unknown;
  messages: DocumentExtractionMessage[];
  outputSchema: z.ZodType<unknown>;
  signal?: AbortSignal;
}) => Promise<unknown>;

export type DocumentExtractionAdapterFactory = (model: DocumentExtractionModelConfig) => unknown;

export type CreateTanStackDocumentExtractionProviderOptions = {
  cascade: DocumentExtractionCascadeConfig;
  chat?: DocumentExtractionChatCall;
  createAdapter?: DocumentExtractionAdapterFactory;
};

export type OpenAiDocumentExtractionProviderOptions = {
  apiKey: string;
  baseURL?: string;
  model?: string;
  timeoutMs?: number;
  fetch?: DocumentExtractionFetch;
};

export type DocumentExtractionFetch = (url: string, init: RequestInit) => Promise<Response>;

export type ReadablePdfTextExtraction = {
  text: string;
  totalPages: number;
};

const defaultDocumentExtractionTimeoutMs = 20_000;

export function resolveDocumentExtractionCascade(
  config: DocumentExtractionCascadeConfig,
): DocumentExtractionModelConfig[] {
  return [config.primary, config.secondary ?? null, config.tertiary ?? null].filter(
    (model): model is DocumentExtractionModelConfig => Boolean(model),
  );
}

export function createTanStackDocumentExtractionProvider(
  options: CreateTanStackDocumentExtractionProviderOptions,
): DocumentExtractionProvider {
  const models = resolveDocumentExtractionCascade(options.cascade);
  const chat = options.chat ?? (tanStackChat as unknown as DocumentExtractionChatCall);
  const createAdapter = options.createAdapter ?? createTanStackDocumentExtractionAdapter;

  if (models.length === 0) {
    throw new Error("At least one document extraction model is required");
  }

  return {
    source: "tanstack_ai",
    async extract(input) {
      const attempts: DocumentExtractionAttemptMetadata[] = [];

      for (const [index, model] of models.entries()) {
        const attemptNumber = index + 1;
        const timeoutMs = model.timeoutMs ?? defaultDocumentExtractionTimeoutMs;
        const startedAt = performance.now();

        try {
          const output = documentExtractionOutputSchema.parse(
            await withTimeout(
              (signal) =>
                chat({
                  adapter: createAdapter(model),
                  messages: buildExtractionMessages(input),
                  outputSchema: documentExtractionOutputSchema,
                  signal,
                }),
              timeoutMs,
            ),
          );
          const durationMs = elapsedMs(startedAt);
          const attemptMetadata = {
            attempt: attemptNumber,
            role: model.role,
            provider: model.provider,
            model: model.model,
            timeoutMs,
            durationMs,
            status: "completed" as const,
          };

          attempts.push(attemptMetadata);

          return {
            fields: fieldsForOutput(output),
            confidence: confidenceForOutput(output),
            rawText: output.rawText,
            summary: output.summary,
            metadata: {
              provider: model.provider,
              model: model.model,
              timeoutMs,
              durationMs,
              attempts,
            },
          };
        } catch (error) {
          attempts.push({
            attempt: attemptNumber,
            role: model.role,
            provider: model.provider,
            model: model.model,
            timeoutMs,
            durationMs: elapsedMs(startedAt),
            status: "failed",
            ...errorMetadata(error),
          });
        }
      }

      throw new DocumentExtractionCascadeError(
        "Document extraction failed for every configured model",
        attempts,
      );
    },
  };
}

export function createTanStackDocumentExtractionAdapter(
  model: DocumentExtractionModelConfig,
): unknown {
  switch (model.provider) {
    case "gemini":
      return model.apiKey
        ? createGeminiChat(
            model.model as Parameters<typeof createGeminiChat>[0],
            model.apiKey,
            model.baseURL ? { baseURL: model.baseURL } : {},
          )
        : geminiText(model.model as Parameters<typeof geminiText>[0]);
    case "openrouter":
      return openRouterText(model.model as Parameters<typeof openRouterText>[0]);
    case "openai_compatible":
      if (!model.apiKey || !model.baseURL) {
        throw new Error("OpenAI-compatible document extraction requires apiKey and baseURL");
      }

      return openaiCompatibleText(model.model, {
        apiKey: model.apiKey,
        baseURL: model.baseURL,
      });
  }
}

export function createOpenAiDocumentExtractionProvider(
  options: OpenAiDocumentExtractionProviderOptions,
): DocumentExtractionProvider {
  const baseURL = (options.baseURL ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = options.model ?? "gpt-4o-mini";
  const timeoutMs = options.timeoutMs ?? defaultDocumentExtractionTimeoutMs;
  const requestFetch = options.fetch ?? fetch;

  return {
    source: "tanstack_ai",
    async extract(input) {
      const startedAt = performance.now();
      const output = openAiDocumentExtractionOutputSchema.parse(
        await withTimeout(async (signal) => {
          const response = await requestFetch(`${baseURL}/chat/completions`, {
            method: "POST",
            headers: {
              authorization: `Bearer ${options.apiKey}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              model,
              messages: [
                {
                  role: "system",
                  content:
                    "You extract accounting document fields. Return only fields visible in the document. Use null for unknown fields. Amounts are integer minor units.",
                },
                {
                  role: "user",
                  content: openAiDocumentExtractionContent(input),
                },
              ],
              response_format: {
                type: "json_schema",
                json_schema: {
                  name: "document_extraction",
                  strict: true,
                  schema: openAiDocumentExtractionJsonSchema,
                },
              },
            }),
            signal,
          });

          if (!response.ok) {
            throw new Error(
              `OpenAI document extraction failed: ${response.status} ${await response.text()}`,
            );
          }

          return JSON.parse(openAiResponseContent(await response.json()));
        }, timeoutMs),
      );
      const durationMs = elapsedMs(startedAt);

      return {
        fields: openAiFieldsForOutput(output),
        confidence: openAiConfidenceForOutput(output),
        rawText: output.rawText ?? input.rawText ?? null,
        summary: output.summary,
        metadata: {
          provider: "openai_compatible",
          model,
          timeoutMs,
          durationMs,
          attempts: [
            {
              attempt: 1,
              role: "primary",
              provider: "openai_compatible",
              model,
              timeoutMs,
              durationMs,
              status: "completed",
            },
          ],
        },
      };
    },
  };
}

export function createLocalDeterministicDocumentExtractionProvider(): DocumentExtractionProvider {
  return {
    source: "local_deterministic",
    async extract(input) {
      const bodyText = input.rawText?.trim() ?? "";
      const text = [input.fileName, bodyText].filter(Boolean).join("\n").trim();
      const totalAmountMinor = extractTotalAmountMinor(text);
      const currency = extractCurrency(text);
      const issuedAt = extractIssuedAt(text);
      const invoiceNumber = extractInvoiceNumber(text);
      const isInvoice = /\b(invoice|faktura|payment\s+(?:reminder|warning))\b/i.test(text);
      const documentType = isInvoice
        ? "invoice_received"
        : totalAmountMinor != null
          ? "receipt"
          : "other";
      const displayText = bodyText || text;
      const fields = {
        documentType,
        merchantName:
          documentType === "receipt" ? firstDocumentLine(displayText, input.fileName) : null,
        vendorName:
          documentType === "invoice_received"
            ? firstDocumentLine(displayText, input.fileName)
            : null,
        invoiceNumber: documentType === "invoice_received" ? invoiceNumber : null,
        issuedAt,
        totalAmountMinor,
        currency,
      } satisfies NormalizedDocumentExtractionFields;
      const confidence = Object.fromEntries(
        Object.entries(fields)
          .filter(([, value]) => value !== null && value !== "other")
          .map(([field]) => [field, 0.72]),
      ) as DocumentExtractionConfidence;

      return {
        fields,
        confidence,
        rawText: input.rawText ?? null,
        metadata: {
          provider: "openai_compatible",
          model: "local_deterministic",
          timeoutMs: 0,
          durationMs: 0,
          attempts: [],
        },
      };
    },
  };
}

export async function extractReadablePdfText(
  body: ArrayBuffer | Uint8Array,
): Promise<ReadablePdfTextExtraction> {
  const bytes = body instanceof Uint8Array ? body : new Uint8Array(body);
  const pdf = await getDocumentProxy(bytes);
  const extracted = await extractText(pdf, { mergePages: true });
  const structuredText = await extractTextItems(pdf)
    .then((items) => structuredPdfText(items.items))
    .catch(() => "");

  return {
    text: structuredText || extracted.text.trim(),
    totalPages: extracted.totalPages,
  };
}

export class DocumentExtractionCascadeError extends Error {
  constructor(
    message: string,
    public readonly attempts: DocumentExtractionAttemptMetadata[],
  ) {
    super(message);
  }
}

export class DocumentExtractionTimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`Document extraction timed out after ${timeoutMs}ms`);
  }
}

function buildExtractionMessages(input: DocumentExtractionInput): DocumentExtractionMessage[] {
  const prompt = [
    "Extract normalized business document fields from this receipt or invoice.",
    "Return receipt, invoice_received, or other.",
    "Amounts must be integer minor units. Dates must be YYYY-MM-DD. Currency must be ISO 4217.",
    `File name: ${input.fileName}`,
    `Content type: ${input.contentType}`,
    input.documentTypeHint ? `Document type hint: ${input.documentTypeHint}` : null,
    input.rawText ? `Text:\n${input.rawText}` : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");

  if (!input.body && !input.sourceUrl) {
    return [{ role: "user", content: prompt }];
  }

  const source = input.body
    ? ({
        type: "data" as const,
        value: Buffer.from(input.body).toString("base64"),
        mimeType: normalizedContentType(input.contentType),
      } satisfies DocumentExtractionBinarySource)
    : ({
        type: "url" as const,
        value: input.sourceUrl ?? "",
        mimeType: normalizedContentType(input.contentType),
      } satisfies DocumentExtractionBinarySource);

  return [
    {
      role: "user",
      content: [
        { type: "text", content: prompt },
        {
          type: contentPartType(input.contentType),
          source,
        },
      ],
    },
  ] satisfies DocumentExtractionMessage[];
}

function contentPartType(contentType: string): "image" | "document" {
  return normalizedContentType(contentType).startsWith("image/") ? "image" : "document";
}

function openAiDocumentExtractionContent(input: DocumentExtractionInput) {
  const prompt = [
    "Extract normalized business document fields from this receipt or invoice.",
    "Classify as receipt, invoice_received, or other.",
    "Use the invoice issue date for issuedAt. Use YYYY-MM-DD dates.",
    "Use ISO 4217 currency codes. Infer EUR from €, GBP from £, USD from $, and SEK from kr only when the document clearly uses that currency.",
    "For totalAmountMinor, use the final payable total or amount due, not invoice numbers, customer IDs, dates, VAT IDs, account numbers, or line-item unit prices.",
    "For invoiceNumber, use a labelled invoice number/fakturanummer/invoice no. value only.",
    `File name: ${input.fileName}`,
    `Content type: ${input.contentType}`,
    input.documentTypeHint ? `Document type hint: ${input.documentTypeHint}` : null,
    input.rawText ? `Text:\n${input.rawText}` : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");

  if (input.body && normalizedContentType(input.contentType).startsWith("image/")) {
    return [
      { type: "text", text: prompt },
      {
        type: "image_url",
        image_url: {
          url: `data:${normalizedContentType(input.contentType)};base64,${Buffer.from(input.body).toString("base64")}`,
        },
      },
    ];
  }

  return prompt;
}

function openAiResponseContent(response: unknown) {
  const content = (response as { choices?: Array<{ message?: { content?: unknown } }> })
    .choices?.[0]?.message?.content;

  if (typeof content !== "string" || !content.trim()) {
    throw new Error("OpenAI document extraction returned no content");
  }

  return content.trim();
}

function openAiFieldsForOutput(
  output: z.infer<typeof openAiDocumentExtractionOutputSchema>,
): NormalizedDocumentExtractionFields {
  if (output.documentType === "other") {
    return {
      documentType: "other",
      language: output.language,
    };
  }

  return {
    documentType: output.documentType,
    merchantName:
      output.documentType === "receipt"
        ? (output.merchantName ?? output.storeName ?? output.vendorName)
        : (output.vendorName ?? output.merchantName),
    storeName: output.storeName,
    vendorName: output.vendorName,
    customerName: output.customerName,
    invoiceNumber: output.documentType === "invoice_received" ? output.invoiceNumber : null,
    issuedAt: output.issuedAt,
    dueAt: output.documentType === "invoice_received" ? output.dueAt : null,
    totalAmountMinor: output.totalAmountMinor,
    currency: output.currency,
    taxAmountMinor: output.taxAmountMinor,
    website: output.website,
    language: output.language,
  };
}

function openAiConfidenceForOutput(
  output: z.infer<typeof openAiDocumentExtractionOutputSchema>,
): DocumentExtractionConfidence {
  const confidence: DocumentExtractionConfidence = {};

  if (typeof output.overallConfidence === "number") {
    confidence.overall = output.overallConfidence;
  }

  for (const field of openAiConfidenceFields) {
    const value = output.fieldConfidence[field];

    if (typeof value === "number") {
      confidence[field] = value;
    }
  }

  return confidence;
}

function fieldsForOutput(output: DocumentExtractionOutput): NormalizedDocumentExtractionFields {
  if (output.documentType === "receipt") {
    return {
      documentType: output.documentType,
      merchantName: output.merchantName,
      storeName: output.storeName,
      issuedAt: output.issuedAt,
      totalAmountMinor: output.totalAmountMinor,
      currency: output.currency,
      taxAmountMinor: output.taxAmountMinor,
      website: output.website,
      language: output.language,
    };
  }

  if (output.documentType === "invoice_received") {
    return {
      documentType: output.documentType,
      vendorName: output.vendorName,
      customerName: output.customerName,
      invoiceNumber: output.invoiceNumber,
      issuedAt: output.issuedAt,
      dueAt: output.dueAt,
      totalAmountMinor: output.totalAmountMinor,
      currency: output.currency,
      taxAmountMinor: output.taxAmountMinor,
      website: output.website,
      language: output.language,
    };
  }

  return {
    documentType: output.documentType,
    language: output.language,
  };
}

function confidenceForOutput(output: DocumentExtractionOutput): DocumentExtractionConfidence {
  const confidence = Object.fromEntries(
    Object.entries(output.fieldConfidence).map(([field, score]) => [field, clampConfidence(score)]),
  ) as DocumentExtractionConfidence;

  if (typeof output.overallConfidence === "number") {
    confidence.overall = clampConfidence(output.overallConfidence);
  }

  return confidence;
}

function withTimeout<T>(work: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  if (timeoutMs <= 0) {
    return work(new AbortController().signal);
  }

  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new DocumentExtractionTimeoutError(timeoutMs));
    }, timeoutMs);
  });

  return Promise.race([work(controller.signal), timeoutPromise]).finally(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
  });
}

function errorMetadata(error: unknown) {
  return {
    errorClass: error instanceof Error && error.constructor.name ? error.constructor.name : "Error",
    errorMessage: error instanceof Error ? error.message : "Unknown document extraction error",
  };
}

function elapsedMs(startedAt: number) {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

function clampConfidence(score: number) {
  return Math.max(0, Math.min(1, score));
}

function normalizedContentType(contentType: string) {
  return contentType.split(";")[0]?.trim().toLowerCase() || "application/octet-stream";
}

function structuredPdfText(pages: StructuredTextItem[][]) {
  return pages
    .map((items) => pageTextLines(items).join("\n"))
    .filter(Boolean)
    .join("\n")
    .trim();
}

function pageTextLines(items: StructuredTextItem[]) {
  const lines: Array<{ y: number; items: StructuredTextItem[] }> = [];

  for (const item of items) {
    if (!item.str.trim()) {
      continue;
    }

    const line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= 2);

    if (line) {
      line.items.push(item);
    } else {
      lines.push({ y: item.y, items: [item] });
    }
  }

  return lines
    .sort((left, right) => right.y - left.y)
    .map((line) =>
      line.items
        .sort((left, right) => left.x - right.x)
        .map((item) => item.str.trim())
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
}

function firstDocumentLine(text: string, fileName: string) {
  return (
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line && !/^(total|amount|date|invoice)\b/i.test(line)) ??
    fileName.replace(/\.[^.]+$/, "")
  );
}

function extractTotalAmountMinor(text: string) {
  const totalLinePatterns = [
    /\b(amount\s+due|balance\s+due|total\s+due|grand\s+total|amount\s+to\s+pay)\b/i,
    /\b(total|totalt|att\s+betala)\b/i,
  ];
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const pattern of totalLinePatterns) {
    for (const line of lines) {
      if (!pattern.test(line)) {
        continue;
      }

      const amounts = moneyValuesInLine(line);

      if (amounts.length > 0) {
        return decimalAmountToMinor(amounts.at(-1)!);
      }
    }
  }

  const fallback = text.match(/(?:total|amount|paid)[^\d-]*(-?\d+(?:[.,]\d{1,2})?)/i)?.[1];

  return fallback ? decimalAmountToMinor(fallback) : null;
}

function moneyValuesInLine(line: string) {
  const values: string[] = [];
  const moneyPattern =
    /(?:\b(?:USD|EUR|GBP|SEK|NOK|DKK)\b\s*)?(?:[$€£]\s*)?-?\d[\d\s.,]*(?:\s*(?:[$€£]|kr|\b(?:USD|EUR|GBP|SEK|NOK|DKK)\b))?/gi;

  for (const match of line.matchAll(moneyPattern)) {
    const value = match[0]?.trim();

    if (value && /\d/.test(value)) {
      values.push(value);
    }
  }

  return values;
}

function extractCurrency(text: string) {
  const code = text.match(/\b(USD|EUR|GBP|SEK|NOK|DKK)\b/i)?.[1];

  if (code) {
    return code.toUpperCase();
  }

  if (/[€]/.test(text)) {
    return "EUR";
  }

  if (/[£]/.test(text)) {
    return "GBP";
  }

  if (/[$]/.test(text)) {
    return "USD";
  }

  if (/\bkr\b/i.test(text)) {
    return "SEK";
  }

  return null;
}

function extractIssuedAt(text: string) {
  const fileDate = text.match(/\b(\d{4}[-/.]\d{2}[-/.]\d{2})\b/)?.[1];

  if (fileDate) {
    return normalizeDateToken(fileDate);
  }

  const labeledDate = text.match(
    /\b(?:invoice\s+date|fakturadatum|date|datum)\s*[:.]?\s*(\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4})/i,
  )?.[1];

  return labeledDate ? normalizeDateToken(labeledDate) : null;
}

function extractInvoiceNumber(text: string) {
  const patterns = [
    /\b(?:invoice\s*(?:no\.?|number|#)|faktura\s*(?:nr\.?|nummer)|fakturanummer)\s*[:.#-]*\s*([A-Z0-9][A-Z0-9-]{3,})\b/i,
    /\binvoice\s+([0-9][0-9-]{3,})\b/i,
  ];

  for (const pattern of patterns) {
    const value = pattern.exec(text)?.[1]?.trim();

    if (value && !/^(date|amount|total)$/i.test(value) && !normalizeDateToken(value)) {
      return value;
    }
  }

  return null;
}

function normalizeDateToken(value: string) {
  const trimmed = value.trim().replace(/[/.]/g, "-");
  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

  if (iso) {
    return validIsoDate(iso[1]!, iso[2]!, iso[3]!);
  }

  const local = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);

  if (!local) {
    return null;
  }

  const first = Number(local[1]);
  const second = Number(local[2]);
  const year = local[3]!.length === 2 ? `20${local[3]}` : local[3]!;
  const day = first > 12 ? first : second > 12 ? second : first;
  const month = first > 12 ? second : second > 12 ? first : second;

  return validIsoDate(year, String(month), String(day));
}

function validIsoDate(year: string, month: string, day: string) {
  const normalized = `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const parsed = new Date(`${normalized}T00:00:00.000Z`);

  return Number.isNaN(parsed.getTime()) || normalized !== parsed.toISOString().slice(0, 10)
    ? null
    : normalized;
}

function decimalAmountToMinor(value: string) {
  let normalized = value
    .replace(/\u00a0/g, " ")
    .replace(/\b(?:USD|EUR|GBP|SEK|NOK|DKK)\b/gi, "")
    .replace(/[$€£]|kr/gi, "")
    .replace(/\s+/g, "")
    .replace(/[^0-9,.-]/g, "");
  const negative = normalized.startsWith("-");

  normalized = normalized.replace(/^-/, "");

  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");

  if (lastComma >= 0 && lastDot >= 0) {
    normalized =
      lastComma > lastDot
        ? normalized.replace(/\./g, "").replace(",", ".")
        : normalized.replace(/,/g, "");
  } else if (lastComma >= 0) {
    normalized = normalized.replace(",", ".");
  }

  const [major = "0", fraction = ""] = normalized.split(".");
  const amountMinor =
    Number.parseInt(major, 10) * 100 + Number.parseInt(fraction.padEnd(2, "0").slice(0, 2), 10);
  return negative ? -amountMinor : amountMinor;
}
