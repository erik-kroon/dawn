import {
  createTanStackDocumentExtractionProvider,
  type DocumentExtractionCascadeConfig,
  type DocumentExtractionInput,
  type DocumentExtractionModelConfig,
  type DocumentExtractionProvider,
  type DocumentExtractionResult,
  type NormalizedDocumentExtractionFields,
} from "./index";

export type DocumentEvalSourceKind = "gmail_body" | "binary";

export type DocumentEvalInput = DocumentExtractionInput & {
  sourceKind: DocumentEvalSourceKind;
};

export type DocumentEvalMatchExpectation = {
  transactionId: string;
  amountMinor: number;
  currency: string;
  bookedAt: string;
  counterpartyName: string;
  invoiceNumber?: string | null;
};

export type DocumentEvalCase = {
  id: string;
  name: string;
  input: DocumentEvalInput;
  expected: {
    financial: boolean;
    fields: NormalizedDocumentExtractionFields;
    match?: DocumentEvalMatchExpectation | null;
  };
};

export type DocumentEvalExtraction = Pick<
  DocumentExtractionResult,
  "fields" | "confidence" | "rawText" | "summary" | "metadata"
>;

export type DocumentEvalExtractor = (
  evaluationCase: DocumentEvalCase,
) => Promise<DocumentEvalExtraction>;

export type DocumentEvalFieldName =
  | "amount"
  | "currency"
  | "date"
  | "merchantOrVendor"
  | "invoiceNumber";

export type DocumentEvalMetric = {
  expected: number;
  correct: number;
  score: number;
};

export type DocumentEvalRecallMetric = {
  expected: number;
  extracted: number;
  score: number;
};

export type DocumentEvalFinding = {
  caseId: string;
  reason: string;
};

export type DocumentEvalReport = {
  totalCases: number;
  criticalFieldRecall: DocumentEvalRecallMetric;
  falseFinancialDocumentClassifications: string[];
  fieldAccuracy: Record<DocumentEvalFieldName, DocumentEvalMetric>;
  matchingImpact: {
    evaluated: number;
    correctTop: number;
    missed: number;
    falsePositive: number;
    accuracy: number;
  };
  findings: DocumentEvalFinding[];
};

export type FixtureDocumentEvalExtractorOptions = {
  overrides?: Partial<Record<string, Partial<DocumentEvalExtraction>>>;
};

export type ProviderDocumentEvalEnv = Record<string, string | undefined>;

type CriticalField =
  | "totalAmountMinor"
  | "currency"
  | "issuedAt"
  | "dueAt"
  | "invoiceNumber"
  | "merchantOrVendor";

const mockMetadata = {
  provider: "openai_compatible",
  model: "document_eval_fixture",
  timeoutMs: 0,
  durationMs: 0,
  attempts: [],
} satisfies DocumentExtractionResult["metadata"];

export const documentEvalFixtures = [
  {
    id: "body-only-receipt-email",
    name: "Body-only receipt email",
    input: {
      sourceKind: "gmail_body",
      fileName: "gmail-body-delta-coffee.txt",
      contentType: "text/plain",
      rawText: [
        "Delta Coffee",
        "Date: 2026-06-03",
        "Total USD 12.50",
        "Paid with card ending 4242",
      ].join("\n"),
    },
    expected: {
      financial: true,
      fields: {
        documentType: "receipt",
        merchantName: "Delta Coffee",
        issuedAt: "2026-06-03",
        totalAmountMinor: 1250,
        currency: "USD",
      },
      match: {
        transactionId: "txn_body_delta_coffee",
        amountMinor: 1250,
        currency: "USD",
        bookedAt: "2026-06-03",
        counterpartyName: "Delta Coffee",
      },
    },
  },
  {
    id: "clear-image-receipt",
    name: "Clear image receipt",
    input: {
      sourceKind: "binary",
      fileName: "clear-image-receipt.png",
      contentType: "image/png",
      body: new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer,
      rawText: ["Northwind Market", "2026-06-04", "Total USD 48.32"].join("\n"),
    },
    expected: {
      financial: true,
      fields: {
        documentType: "receipt",
        merchantName: "Northwind Market",
        issuedAt: "2026-06-04",
        totalAmountMinor: 4832,
        currency: "USD",
      },
      match: {
        transactionId: "txn_image_northwind",
        amountMinor: 4832,
        currency: "USD",
        bookedAt: "2026-06-04",
        counterpartyName: "Northwind Market",
      },
    },
  },
  {
    id: "scanned-pdf-receipt",
    name: "Scanned PDF receipt",
    input: {
      sourceKind: "binary",
      fileName: "scanned-receipt.pdf",
      contentType: "application/pdf",
      body: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]).buffer,
      rawText: ["Bluebird Office", "2026-06-05", "Total USD 93.10"].join("\n"),
    },
    expected: {
      financial: true,
      fields: {
        documentType: "receipt",
        merchantName: "Bluebird Office",
        issuedAt: "2026-06-05",
        totalAmountMinor: 9310,
        currency: "USD",
      },
      match: {
        transactionId: "txn_scanned_bluebird",
        amountMinor: 9310,
        currency: "USD",
        bookedAt: "2026-06-05",
        counterpartyName: "Bluebird Office",
      },
    },
  },
  {
    id: "readable-pdf-receipt",
    name: "Readable PDF receipt",
    input: {
      sourceKind: "binary",
      fileName: "readable-receipt.pdf",
      contentType: "application/pdf",
      body: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]).buffer,
      rawText: ["Contoso Books", "2026-06-06", "Total USD 27.44"].join("\n"),
    },
    expected: {
      financial: true,
      fields: {
        documentType: "receipt",
        merchantName: "Contoso Books",
        issuedAt: "2026-06-06",
        totalAmountMinor: 2744,
        currency: "USD",
      },
      match: {
        transactionId: "txn_readable_contoso",
        amountMinor: 2744,
        currency: "USD",
        bookedAt: "2026-06-06",
        counterpartyName: "Contoso Books",
      },
    },
  },
  {
    id: "invoice-due-date-number",
    name: "Invoice with due date and invoice number",
    input: {
      sourceKind: "binary",
      fileName: "invoice-inv-2048.pdf",
      contentType: "application/pdf",
      body: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x32]).buffer,
      rawText: [
        "Acme Consulting",
        "Invoice INV-2048",
        "Issued 2026-06-01",
        "Due 2026-06-30",
        "Total USD 1250.00",
      ].join("\n"),
    },
    expected: {
      financial: true,
      fields: {
        documentType: "invoice_received",
        vendorName: "Acme Consulting",
        customerName: "Dawn Studio",
        invoiceNumber: "INV-2048",
        issuedAt: "2026-06-01",
        dueAt: "2026-06-30",
        totalAmountMinor: 125000,
        currency: "USD",
      },
      match: {
        transactionId: "txn_invoice_acme",
        amountMinor: 125000,
        currency: "USD",
        bookedAt: "2026-06-01",
        counterpartyName: "Acme Consulting",
        invoiceNumber: "INV-2048",
      },
    },
  },
  {
    id: "non-financial-pdf",
    name: "Non-financial PDF",
    input: {
      sourceKind: "binary",
      fileName: "board-minutes.pdf",
      contentType: "application/pdf",
      body: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x33]).buffer,
      rawText: "Board minutes for June planning. No receipt or invoice.",
    },
    expected: {
      financial: false,
      fields: {
        documentType: "other",
        language: "en",
      },
      match: null,
    },
  },
  {
    id: "receipt-multiple-totals",
    name: "Receipt with multiple totals",
    input: {
      sourceKind: "binary",
      fileName: "multiple-totals-receipt.jpg",
      contentType: "image/jpeg",
      body: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer,
      rawText: [
        "City Hardware",
        "2026-06-07",
        "Subtotal USD 80.00",
        "Tax USD 20.00",
        "Total USD 100.00",
      ].join("\n"),
    },
    expected: {
      financial: true,
      fields: {
        documentType: "receipt",
        merchantName: "City Hardware",
        issuedAt: "2026-06-07",
        totalAmountMinor: 10000,
        currency: "USD",
        taxAmountMinor: 2000,
      },
      match: {
        transactionId: "txn_multi_city_hardware",
        amountMinor: 10000,
        currency: "USD",
        bookedAt: "2026-06-07",
        counterpartyName: "City Hardware",
      },
    },
  },
  {
    id: "foreign-currency-receipt",
    name: "Foreign-currency receipt",
    input: {
      sourceKind: "binary",
      fileName: "foreign-currency-receipt.webp",
      contentType: "image/webp",
      body: new Uint8Array([0x52, 0x49, 0x46, 0x46]).buffer,
      rawText: ["Nordic Taxi", "2026-06-08", "Total SEK 342.00"].join("\n"),
    },
    expected: {
      financial: true,
      fields: {
        documentType: "receipt",
        merchantName: "Nordic Taxi",
        issuedAt: "2026-06-08",
        totalAmountMinor: 34200,
        currency: "SEK",
      },
      match: {
        transactionId: "txn_foreign_nordic_taxi",
        amountMinor: 34200,
        currency: "SEK",
        bookedAt: "2026-06-08",
        counterpartyName: "Nordic Taxi",
      },
    },
  },
  {
    id: "tax-heavy-receipt",
    name: "Tax-heavy receipt",
    input: {
      sourceKind: "binary",
      fileName: "tax-heavy-receipt.png",
      contentType: "image/png",
      body: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]).buffer,
      rawText: [
        "Metro Supplies",
        "2026-06-09",
        "Tax 1 USD 8.40",
        "Tax 2 USD 2.10",
        "Total USD 64.50",
      ].join("\n"),
    },
    expected: {
      financial: true,
      fields: {
        documentType: "receipt",
        merchantName: "Metro Supplies",
        issuedAt: "2026-06-09",
        totalAmountMinor: 6450,
        currency: "USD",
        taxAmountMinor: 1050,
      },
      match: {
        transactionId: "txn_tax_metro_supplies",
        amountMinor: 6450,
        currency: "USD",
        bookedAt: "2026-06-09",
        counterpartyName: "Metro Supplies",
      },
    },
  },
] as const satisfies readonly DocumentEvalCase[];

export async function evaluateDocumentExtractionCases(input: {
  cases: readonly DocumentEvalCase[];
  extractor: DocumentEvalExtractor;
}): Promise<DocumentEvalReport> {
  const fieldAccuracy = emptyFieldAccuracy();
  const falseFinancialDocumentClassifications: string[] = [];
  const findings: DocumentEvalFinding[] = [];
  const matchingImpact = {
    evaluated: 0,
    correctTop: 0,
    missed: 0,
    falsePositive: 0,
    accuracy: 0,
  };
  let criticalExpected = 0;
  let criticalExtracted = 0;

  for (const evaluationCase of input.cases) {
    const extraction = await input.extractor(evaluationCase);
    const actualFields = extraction.fields;
    const actualFinancial = isFinancialDocument(actualFields);

    if (!evaluationCase.expected.financial && actualFinancial) {
      falseFinancialDocumentClassifications.push(evaluationCase.id);
      findings.push({
        caseId: evaluationCase.id,
        reason: "Non-financial document classified as receipt or invoice",
      });
    }

    for (const criticalField of criticalFieldsForCase(evaluationCase)) {
      criticalExpected += 1;

      if (hasCriticalField(actualFields, criticalField)) {
        criticalExtracted += 1;
      } else {
        findings.push({
          caseId: evaluationCase.id,
          reason: `Missing critical field ${criticalField}`,
        });
      }
    }

    scoreFieldAccuracy(evaluationCase, actualFields, fieldAccuracy, findings);
    scoreMatchingImpact(evaluationCase, actualFields, matchingImpact, findings);
  }

  for (const metric of Object.values(fieldAccuracy)) {
    metric.score = ratio(metric.correct, metric.expected);
  }

  matchingImpact.accuracy = ratio(matchingImpact.correctTop, matchingImpact.evaluated);

  return {
    totalCases: input.cases.length,
    criticalFieldRecall: {
      expected: criticalExpected,
      extracted: criticalExtracted,
      score: ratio(criticalExtracted, criticalExpected),
    },
    falseFinancialDocumentClassifications,
    fieldAccuracy,
    matchingImpact,
    findings,
  };
}

export function createFixtureDocumentEvalExtractor(
  options: FixtureDocumentEvalExtractorOptions = {},
): DocumentEvalExtractor {
  return async (evaluationCase) => {
    const override = options.overrides?.[evaluationCase.id] ?? {};
    const fields = override.fields ?? evaluationCase.expected.fields;

    return {
      fields,
      confidence: override.confidence ?? confidenceForFields(fields),
      rawText: override.rawText ?? evaluationCase.input.rawText ?? null,
      summary: override.summary ?? null,
      metadata: override.metadata ?? mockMetadata,
    };
  };
}

export function createProviderDocumentEvalExtractor(
  provider: DocumentExtractionProvider,
): DocumentEvalExtractor {
  return async (evaluationCase) => {
    const { sourceKind: _sourceKind, ...providerInput } = evaluationCase.input;
    return provider.extract(providerInput);
  };
}

export function shouldRunProviderDocumentEvals(
  env: ProviderDocumentEvalEnv = process.env,
): boolean {
  return documentEvalModelsFromEnv(env).length > 0;
}

export function createDocumentEvalProviderFromEnv(
  env: ProviderDocumentEvalEnv = process.env,
): DocumentExtractionProvider | null {
  const models = documentEvalModelsFromEnv(env);

  if (models.length === 0) {
    return null;
  }

  return createTanStackDocumentExtractionProvider({
    cascade: cascadeFromModels(models),
  });
}

function emptyFieldAccuracy(): Record<DocumentEvalFieldName, DocumentEvalMetric> {
  return {
    amount: emptyMetric(),
    currency: emptyMetric(),
    date: emptyMetric(),
    merchantOrVendor: emptyMetric(),
    invoiceNumber: emptyMetric(),
  };
}

function emptyMetric(): DocumentEvalMetric {
  return {
    expected: 0,
    correct: 0,
    score: 0,
  };
}

function criticalFieldsForCase(evaluationCase: DocumentEvalCase): CriticalField[] {
  if (!evaluationCase.expected.financial) {
    return [];
  }

  const fields: CriticalField[] = ["totalAmountMinor", "currency", "issuedAt", "merchantOrVendor"];
  const expectedFields = evaluationCase.expected.fields;

  if (expectedFields.documentType === "invoice_received" && expectedFields.dueAt) {
    fields.push("dueAt");
  }

  if (expectedFields.documentType === "invoice_received" && expectedFields.invoiceNumber) {
    fields.push("invoiceNumber");
  }

  return fields;
}

function hasCriticalField(fields: NormalizedDocumentExtractionFields, field: CriticalField) {
  if (field === "merchantOrVendor") {
    return Boolean(counterpartyName(fields));
  }

  const value = fields[field];
  return value !== null && value !== undefined && value !== "";
}

function scoreFieldAccuracy(
  evaluationCase: DocumentEvalCase,
  actualFields: NormalizedDocumentExtractionFields,
  fieldAccuracy: Record<DocumentEvalFieldName, DocumentEvalMetric>,
  findings: DocumentEvalFinding[],
) {
  if (!evaluationCase.expected.financial) {
    return;
  }

  const expectedFields = evaluationCase.expected.fields;
  scoreField(
    evaluationCase,
    "amount",
    expectedFields.totalAmountMinor,
    actualFields.totalAmountMinor,
    fieldAccuracy,
    findings,
  );
  scoreField(
    evaluationCase,
    "currency",
    expectedFields.currency,
    actualFields.currency,
    fieldAccuracy,
    findings,
  );
  scoreField(
    evaluationCase,
    "date",
    expectedFields.issuedAt,
    actualFields.issuedAt,
    fieldAccuracy,
    findings,
  );
  scoreField(
    evaluationCase,
    "merchantOrVendor",
    counterpartyName(expectedFields),
    counterpartyName(actualFields),
    fieldAccuracy,
    findings,
  );
  scoreField(
    evaluationCase,
    "invoiceNumber",
    expectedFields.invoiceNumber,
    actualFields.invoiceNumber,
    fieldAccuracy,
    findings,
  );
}

function scoreField(
  evaluationCase: DocumentEvalCase,
  fieldName: DocumentEvalFieldName,
  expected: string | number | null | undefined,
  actual: string | number | null | undefined,
  fieldAccuracy: Record<DocumentEvalFieldName, DocumentEvalMetric>,
  findings: DocumentEvalFinding[],
) {
  if (expected === null || expected === undefined || expected === "") {
    return;
  }

  const metric = fieldAccuracy[fieldName];
  metric.expected += 1;

  if (normalizedComparable(expected) === normalizedComparable(actual)) {
    metric.correct += 1;
    return;
  }

  findings.push({
    caseId: evaluationCase.id,
    reason: `Incorrect ${fieldName}`,
  });
}

function scoreMatchingImpact(
  evaluationCase: DocumentEvalCase,
  actualFields: NormalizedDocumentExtractionFields,
  matchingImpact: DocumentEvalReport["matchingImpact"],
  findings: DocumentEvalFinding[],
) {
  const expectedMatch = evaluationCase.expected.match;

  if (!expectedMatch) {
    return;
  }

  matchingImpact.evaluated += 1;

  const matchedTransactionId = predictedMatchedTransactionId(actualFields, expectedMatch);

  if (matchedTransactionId === expectedMatch.transactionId) {
    matchingImpact.correctTop += 1;
  } else if (matchedTransactionId) {
    matchingImpact.falsePositive += 1;
    findings.push({
      caseId: evaluationCase.id,
      reason: "Downstream matching would choose the wrong transaction",
    });
  } else {
    matchingImpact.missed += 1;
    findings.push({
      caseId: evaluationCase.id,
      reason: "Downstream matching would miss the expected transaction",
    });
  }
}

function predictedMatchedTransactionId(
  fields: NormalizedDocumentExtractionFields,
  expectedMatch: DocumentEvalMatchExpectation,
) {
  if (!isFinancialDocument(fields)) {
    return null;
  }

  if (fields.totalAmountMinor !== expectedMatch.amountMinor) {
    return null;
  }

  if (normalizedComparable(fields.currency) !== normalizedComparable(expectedMatch.currency)) {
    return null;
  }

  if (fields.issuedAt !== expectedMatch.bookedAt) {
    return null;
  }

  if (!textContains(counterpartyName(fields), expectedMatch.counterpartyName)) {
    return null;
  }

  if (
    expectedMatch.invoiceNumber &&
    normalizedComparable(fields.invoiceNumber) !== normalizedComparable(expectedMatch.invoiceNumber)
  ) {
    return null;
  }

  return expectedMatch.transactionId;
}

function isFinancialDocument(fields: NormalizedDocumentExtractionFields) {
  return fields.documentType === "receipt" || fields.documentType === "invoice_received";
}

function counterpartyName(fields: NormalizedDocumentExtractionFields) {
  return fields.merchantName ?? fields.vendorName ?? fields.storeName ?? null;
}

function textContains(value: string | null | undefined, expected: string) {
  return normalizedComparable(value).includes(normalizedComparable(expected));
}

function normalizedComparable(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return String(value);
  }

  return (value ?? "").trim().toLowerCase();
}

function confidenceForFields(fields: NormalizedDocumentExtractionFields) {
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([, value]) => value !== null && value !== undefined && value !== "other")
      .map(([field]) => [field, 1]),
  ) as DocumentExtractionResult["confidence"];
}

function ratio(numerator: number, denominator: number) {
  if (denominator === 0) {
    return 1;
  }

  return Math.round((numerator / denominator) * 1000) / 1000;
}

function documentEvalModelsFromEnv(env: ProviderDocumentEvalEnv): DocumentExtractionModelConfig[] {
  const models: Array<Omit<DocumentExtractionModelConfig, "role">> = [];
  const geminiApiKey = env.GEMINI_API_KEY ?? env.GOOGLE_GENERATIVE_AI_API_KEY;
  const openRouterApiKey = env.OPENROUTER_API_KEY;
  const openAiCompatibleApiKey = env.DAWN_DOCUMENTS_OPENAI_COMPATIBLE_API_KEY ?? env.OPENAI_API_KEY;
  const openAiCompatibleBaseUrl =
    env.DAWN_DOCUMENTS_OPENAI_COMPATIBLE_BASE_URL ?? env.OPENAI_BASE_URL;

  if (geminiApiKey) {
    models.push({
      provider: "gemini",
      model: env.DAWN_DOCUMENTS_GEMINI_MODEL ?? "gemini-3.1-pro-preview",
      apiKey: geminiApiKey,
      timeoutMs: providerTimeoutMs(env),
    });
  }

  if (openRouterApiKey) {
    models.push({
      provider: "openrouter",
      model: env.DAWN_DOCUMENTS_OPENROUTER_MODEL ?? "mistralai/mistral-medium-3.1",
      apiKey: openRouterApiKey,
      timeoutMs: providerTimeoutMs(env),
    });
  }

  if (openAiCompatibleApiKey && openAiCompatibleBaseUrl) {
    models.push({
      provider: "openai_compatible",
      model: env.DAWN_DOCUMENTS_OPENAI_COMPATIBLE_MODEL ?? "mistral-document",
      apiKey: openAiCompatibleApiKey,
      baseURL: openAiCompatibleBaseUrl,
      timeoutMs: providerTimeoutMs(env),
    });
  }

  return models.slice(0, 3).map((model, index) => ({
    ...model,
    role: roleForIndex(index),
  }));
}

function cascadeFromModels(
  models: DocumentExtractionModelConfig[],
): DocumentExtractionCascadeConfig {
  const [primary, secondary, tertiary] = models;

  if (!primary) {
    throw new Error("At least one provider model is required");
  }

  return {
    primary,
    secondary,
    tertiary,
  };
}

function roleForIndex(index: number) {
  return (["primary", "secondary", "tertiary"] as const)[index] ?? "tertiary";
}

function providerTimeoutMs(env: ProviderDocumentEvalEnv) {
  const value = Number(env.DAWN_DOCUMENTS_EVAL_TIMEOUT_MS ?? 20_000);
  return Number.isFinite(value) && value > 0 ? value : 20_000;
}
