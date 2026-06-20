import {
  createDeterministicDocumentExtractor,
  resolveAppRequest,
  runStoredDocumentExtraction,
  type DawnRepository,
  type DocumentExtractionConfidence,
  type DocumentExtractionFields,
  type DocumentExtractionObjectStorage,
  type DocumentIntelligenceInput,
  type DocumentIntelligenceProvider,
} from "@dawn/app";
import {
  createOpenAiDocumentExtractionProvider,
  createTanStackDocumentExtractionProvider,
  extractReadablePdfText as extractReadablePdfTextFromDocument,
  type DocumentExtractionModelConfig,
  type DocumentExtractionProvider as StructuredDocumentExtractionProvider,
  type NormalizedDocumentExtractionFields,
} from "@dawn/documents";
import type { DocumentExtractionJob } from "@dawn/jobs";

import type { DocumentObjectStorage } from "./document-storage";

export type StoredDocumentTextExtractionMethod = "plain_text" | "pdf_text";

export type StoredDocumentTextExtractionInput = {
  body: ArrayBuffer;
  contentType: string;
  fileName: string;
};

export type StoredDocumentTextExtractionResult = {
  text: string;
  method: StoredDocumentTextExtractionMethod;
  totalPages?: number | null;
};

export type StoredDocumentTextExtractor = {
  extractText(
    input: StoredDocumentTextExtractionInput,
  ): Promise<StoredDocumentTextExtractionResult>;
};

export type HeicDocumentConverter = {
  convert(input: DocumentIntelligenceInput): Promise<{
    body: ArrayBuffer;
    contentType: string;
    fileName?: string | null;
  }>;
};

export type MimeAwareDocumentIntelligenceProviderOptions = {
  textExtractor?: StoredDocumentTextExtractor;
  deterministicProvider?: DocumentIntelligenceProvider;
  ocrProvider?: DocumentIntelligenceProvider;
  heicConverter?: HeicDocumentConverter;
  maxBytes?: number;
  maxPdfPages?: number;
  inlineByteLimit?: number;
  createSignedUrl?: (input: DocumentIntelligenceInput) => Promise<string>;
};

type DocumentExtractionEnv = Record<string, string | undefined>;

const defaultMaxDocumentExtractionBytes = 20 * 1024 * 1024;
const defaultMaxPdfPages = 100;
const defaultInlineByteLimit = 4 * 1024 * 1024;

export async function processDocumentExtractionJob(input: {
  repository: DawnRepository;
  storage: DocumentObjectStorage;
  message: DocumentExtractionJob;
  documentIntelligenceProvider?: DocumentIntelligenceProvider;
}) {
  return runStoredDocumentExtraction(
    input.repository,
    createDocumentExtractionObjectStorage(input.storage),
    input.documentIntelligenceProvider ?? createDefaultDocumentIntelligenceProvider(),
    resolveAppRequest({
      actor: { id: input.message.actorId, type: "user" },
      source: "system_job",
      requestId: input.message.idempotencyKey,
      teamId: input.message.teamId,
    }),
    {
      teamId: input.message.teamId,
      inboxItemId: input.message.inboxItemId,
      documentId: input.message.documentId,
      versionId: input.message.versionId,
      idempotencyKey: input.message.idempotencyKey,
    },
  );
}

export function createDocumentExtractionObjectStorage(
  storage: DocumentObjectStorage,
): DocumentExtractionObjectStorage {
  return {
    async readDocument(readInput) {
      const object = await storage.get(readInput.objectKey);

      if (!object) {
        return null;
      }

      return {
        body: object.body,
        contentType: object.contentType || readInput.contentType,
        byteSize: object.byteSize,
      };
    },
  };
}

export function createDefaultDocumentIntelligenceProvider(
  textExtractor: StoredDocumentTextExtractor = createDefaultStoredDocumentTextExtractor(),
  env: DocumentExtractionEnv = resolveDocumentExtractionEnv(),
): DocumentIntelligenceProvider {
  const deterministicProvider = createDeterministicDocumentExtractor();
  const structuredProvider = createConfiguredStructuredDocumentExtractionProvider(env);
  const aiProvider = structuredProvider
    ? createDocumentIntelligenceProviderAdapter(structuredProvider)
    : null;
  const textProvider = aiProvider
    ? createReadableTextAiFallbackProvider(aiProvider, deterministicProvider)
    : deterministicProvider;

  return createMimeAwareDocumentIntelligenceProvider({
    textExtractor,
    deterministicProvider: textProvider,
    ocrProvider: aiProvider ?? undefined,
  });
}

export function createMimeAwareDocumentIntelligenceProvider(
  options: MimeAwareDocumentIntelligenceProviderOptions = {},
): DocumentIntelligenceProvider {
  const deterministic = createDeterministicDocumentExtractor();
  const textExtractor = options.textExtractor ?? createDefaultStoredDocumentTextExtractor();
  const maxBytes = options.maxBytes ?? defaultMaxDocumentExtractionBytes;
  const maxPdfPages = options.maxPdfPages ?? defaultMaxPdfPages;
  const inlineByteLimit = options.inlineByteLimit ?? defaultInlineByteLimit;

  return {
    source:
      options.ocrProvider?.source ?? options.deterministicProvider?.source ?? deterministic.source,
    async extract(input) {
      if (!input.body) {
        return (options.deterministicProvider ?? deterministic).extract(input);
      }
      const inputWithBody = { ...input, body: input.body };

      if (inputWithBody.byteSize > maxBytes || inputWithBody.body.byteLength > maxBytes) {
        throw new Error(`Document exceeds extraction size limit of ${maxBytes} bytes`);
      }

      const contentType = normalizedContentType(input.contentType);

      if (isTextLikeDocument(contentType, input.fileName)) {
        return extractTextLikeDocument(
          inputWithBody,
          textExtractor,
          options.deterministicProvider ?? deterministic,
        );
      }

      if (isPdfDocument(contentType, input.fileName)) {
        const readable = await maybeExtractReadablePdfText(inputWithBody, textExtractor);

        if (readable.totalPages && readable.totalPages > maxPdfPages) {
          throw new Error(`PDF exceeds extraction page limit of ${maxPdfPages}`);
        }

        if (readable.text.trim()) {
          return (options.deterministicProvider ?? deterministic).extract({
            ...inputWithBody,
            rawText: readable.text.trim(),
          });
        }

        return extractWithOcrProvider(inputWithBody, contentType, options, inlineByteLimit);
      }

      if (isHeicDocument(contentType, input.fileName)) {
        if (!options.heicConverter) {
          throw new Error("HEIC document conversion is not configured");
        }

        const converted = await options.heicConverter.convert(inputWithBody);
        const convertedInput = {
          ...inputWithBody,
          body: converted.body,
          byteSize: converted.body.byteLength,
          contentType: converted.contentType,
          fileName: converted.fileName ?? input.fileName.replace(/\.(heic|heif)$/i, ".jpg"),
        };

        return extractWithOcrProvider(
          convertedInput,
          normalizedContentType(converted.contentType),
          options,
          inlineByteLimit,
        );
      }

      if (isSupportedImageDocument(contentType, input.fileName)) {
        return extractWithOcrProvider(inputWithBody, contentType, options, inlineByteLimit);
      }

      throw new Error(`Document extraction is not configured for ${contentType || input.fileName}`);
    },
  };
}

export function createDocumentIntelligenceProviderAdapter(
  provider: StructuredDocumentExtractionProvider,
): DocumentIntelligenceProvider {
  return {
    source: provider.source,
    async extract(input) {
      const result = await provider.extract({
        fileName: input.fileName,
        contentType: input.contentType,
        body: input.body,
        sourceUrl: input.sourceUrl,
        rawText: input.rawText,
      });

      return {
        source: provider.source,
        fields: appFieldsForStructuredExtraction(result.fields),
        confidence: appConfidenceForStructuredExtraction(result.fields, result.confidence),
        rawText: result.rawText ?? null,
        metadata: result.metadata,
      };
    },
  };
}

export function createConfiguredStructuredDocumentExtractionProvider(
  env: DocumentExtractionEnv = resolveDocumentExtractionEnv(),
): StructuredDocumentExtractionProvider | null {
  const models = documentExtractionModelsFromEnv(env);

  if (models.length === 0) {
    return null;
  }

  if (models[0]?.provider === "openai_compatible" && models[0].apiKey) {
    return createOpenAiDocumentExtractionProvider({
      apiKey: models[0].apiKey,
      baseURL: models[0].baseURL,
      model: models[0].model,
      timeoutMs: models[0].timeoutMs,
    });
  }

  return createTanStackDocumentExtractionProvider({
    cascade: {
      primary: models[0]!,
      secondary: models[1] ?? null,
      tertiary: models[2] ?? null,
    },
  });
}

export function createDefaultStoredDocumentTextExtractor(): StoredDocumentTextExtractor {
  return {
    async extractText(input) {
      const contentType = normalizedContentType(input.contentType);

      if (isTextLikeDocument(contentType, input.fileName)) {
        return {
          text: documentObjectText(input.body),
          method: "plain_text",
        };
      }

      if (isPdfDocument(contentType, input.fileName)) {
        const extracted = await extractReadablePdfTextFromDocument(input.body);

        if (!extracted.text) {
          throw new Error("PDF text extraction failed: no readable text found");
        }

        return {
          text: extracted.text,
          method: "pdf_text",
          totalPages: extracted.totalPages,
        };
      }

      throw new Error(
        `Document text extraction is not configured for ${contentType || input.fileName}`,
      );
    },
  };
}

function createReadableTextAiFallbackProvider(
  aiProvider: DocumentIntelligenceProvider,
  fallbackProvider: DocumentIntelligenceProvider,
): DocumentIntelligenceProvider {
  return {
    source: aiProvider.source,
    async extract(input) {
      try {
        return await aiProvider.extract(input);
      } catch (error) {
        if (!input.rawText?.trim()) {
          throw error;
        }

        return fallbackProvider.extract(input);
      }
    },
  };
}

async function extractTextLikeDocument(
  input: DocumentIntelligenceInput & { body: ArrayBuffer },
  textExtractor: StoredDocumentTextExtractor,
  deterministic: DocumentIntelligenceProvider,
) {
  const extracted = await textExtractor.extractText({
    body: input.body,
    contentType: input.contentType,
    fileName: input.fileName,
  });

  return deterministic.extract({
    ...input,
    rawText: extracted.text.trim(),
  });
}

async function maybeExtractReadablePdfText(
  input: DocumentIntelligenceInput & { body: ArrayBuffer },
  textExtractor: StoredDocumentTextExtractor,
) {
  try {
    return await textExtractor.extractText({
      body: input.body,
      contentType: input.contentType,
      fileName: input.fileName,
    });
  } catch (error) {
    if (!/no readable text found/i.test(errorMessage(error))) {
      throw error;
    }

    return { text: "", method: "pdf_text" as const, totalPages: null };
  }
}

async function extractWithOcrProvider(
  input: DocumentIntelligenceInput & { body: ArrayBuffer },
  contentType: string,
  options: MimeAwareDocumentIntelligenceProviderOptions,
  inlineByteLimit: number,
) {
  if (!options.ocrProvider) {
    throw new Error(`Document OCR is not configured for ${contentType || input.fileName}`);
  }

  const preparedInput = await prepareOcrInput(input, options, inlineByteLimit);
  const extracted = await options.ocrProvider.extract(preparedInput);

  return {
    ...extracted,
    source: extracted.source ?? options.ocrProvider.source,
  };
}

async function prepareOcrInput(
  input: DocumentIntelligenceInput & { body: ArrayBuffer },
  options: MimeAwareDocumentIntelligenceProviderOptions,
  inlineByteLimit: number,
): Promise<DocumentIntelligenceInput> {
  if (input.body.byteLength > inlineByteLimit && options.createSignedUrl) {
    return {
      ...input,
      body: null,
      sourceUrl: await options.createSignedUrl(input),
    };
  }

  return {
    ...input,
    sourceUrl: null,
  };
}

function documentObjectText(body: ArrayBuffer) {
  return new TextDecoder("utf-8", { fatal: false }).decode(body).trim();
}

function resolveDocumentExtractionEnv(): DocumentExtractionEnv {
  const env = (globalThis as { process?: { env?: DocumentExtractionEnv } }).process?.env ?? {};

  if (env.NODE_ENV === "test" && env.DAWN_DOCUMENTS_FORCE_AI !== "true") {
    return {};
  }

  return env;
}

function documentExtractionModelsFromEnv(
  env: DocumentExtractionEnv,
): DocumentExtractionModelConfig[] {
  const timeoutMs = documentExtractionTimeoutMs(env);
  const models: Array<Omit<DocumentExtractionModelConfig, "role">> = [];
  const geminiApiKey = env.GEMINI_API_KEY ?? env.GOOGLE_GENERATIVE_AI_API_KEY;
  const openRouterApiKey = env.OPENROUTER_API_KEY;
  const openAiCompatibleApiKey = env.DAWN_DOCUMENTS_OPENAI_COMPATIBLE_API_KEY ?? env.OPENAI_API_KEY;
  const openAiCompatibleBaseUrl =
    env.DAWN_DOCUMENTS_OPENAI_COMPATIBLE_BASE_URL ??
    env.OPENAI_BASE_URL ??
    (openAiCompatibleApiKey ? "https://api.openai.com/v1" : undefined);

  if (geminiApiKey) {
    models.push({
      provider: "gemini",
      model: env.DAWN_DOCUMENTS_GEMINI_MODEL ?? "gemini-3.1-pro-preview",
      apiKey: geminiApiKey,
      timeoutMs,
    });
  }

  if (openRouterApiKey) {
    models.push({
      provider: "openrouter",
      model: env.DAWN_DOCUMENTS_OPENROUTER_MODEL ?? "mistralai/mistral-medium-3.1",
      apiKey: openRouterApiKey,
      timeoutMs,
    });
  }

  if (openAiCompatibleApiKey && openAiCompatibleBaseUrl) {
    models.push({
      provider: "openai_compatible",
      model: env.DAWN_DOCUMENTS_OPENAI_COMPATIBLE_MODEL ?? env.OPENAI_MODEL ?? "gpt-4o-mini",
      apiKey: openAiCompatibleApiKey,
      baseURL: openAiCompatibleBaseUrl,
      timeoutMs,
    });
  }

  return models.slice(0, 3).map((model, index) => ({
    ...model,
    role: (["primary", "secondary", "tertiary"] as const)[index]!,
  }));
}

function documentExtractionTimeoutMs(env: DocumentExtractionEnv) {
  const parsed = Number(env.DAWN_DOCUMENTS_TIMEOUT_MS ?? env.DAWN_DOCUMENTS_AI_TIMEOUT_MS);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function normalizedContentType(contentType: string) {
  return contentType.split(";")[0]?.trim().toLowerCase() ?? "";
}

function isTextLikeDocument(contentType: string, fileName: string) {
  return (
    contentType.startsWith("text/") ||
    ["application/json", "application/xml", "application/csv"].includes(contentType) ||
    /\.(txt|text|csv|tsv|json|xml|html|htm|eml)$/i.test(fileName)
  );
}

function isPdfDocument(contentType: string, fileName: string) {
  return contentType === "application/pdf" || /\.pdf$/i.test(fileName);
}

function isSupportedImageDocument(contentType: string, fileName: string) {
  return (
    ["image/jpeg", "image/png", "image/webp"].includes(contentType) ||
    /\.(jpe?g|png|webp)$/i.test(fileName)
  );
}

function isHeicDocument(contentType: string, fileName: string) {
  return ["image/heic", "image/heif"].includes(contentType) || /\.(heic|heif)$/i.test(fileName);
}

function appFieldsForStructuredExtraction(
  fields: NormalizedDocumentExtractionFields,
): DocumentExtractionFields {
  return {
    documentType: fields.documentType,
    merchantName: fields.merchantName ?? fields.storeName ?? fields.vendorName ?? null,
    customerName: fields.customerName ?? null,
    issuedAt: fields.issuedAt ?? null,
    dueAt: fields.dueAt ?? null,
    invoiceNumber: fields.invoiceNumber ?? null,
    totalAmountMinor: fields.totalAmountMinor ?? null,
    currency: fields.currency ?? null,
    taxAmountMinor: fields.taxAmountMinor ?? null,
  };
}

function appConfidenceForStructuredExtraction(
  fields: NormalizedDocumentExtractionFields,
  confidence: Partial<Record<keyof NormalizedDocumentExtractionFields | "overall", number>>,
): DocumentExtractionConfidence {
  const mapped: DocumentExtractionConfidence = {};
  const merchantConfidence =
    confidence.merchantName ?? confidence.storeName ?? confidence.vendorName ?? null;

  if (typeof merchantConfidence === "number") {
    mapped.merchantName = merchantConfidence;
  }

  for (const field of [
    "documentType",
    "customerName",
    "issuedAt",
    "dueAt",
    "invoiceNumber",
    "totalAmountMinor",
    "currency",
    "taxAmountMinor",
  ] as const) {
    if (fields[field] !== undefined && typeof confidence[field] === "number") {
      mapped[field] = confidence[field];
    }
  }

  return mapped;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
