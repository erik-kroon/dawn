import { describe, expect, test } from "bun:test";

import {
  createLocalDeterministicDocumentExtractionProvider,
  createOpenAiDocumentExtractionProvider,
  createTanStackDocumentExtractionProvider,
  documentExtractionOutputSchema,
  invoiceExtractionSchema,
  receiptExtractionSchema,
  resolveDocumentExtractionCascade,
  type DocumentExtractionChatCall,
  type DocumentExtractionModelConfig,
} from "./index";

const primaryModel = {
  role: "primary",
  provider: "gemini",
  model: "gemini-3.1-pro-preview",
  timeoutMs: 1500,
} satisfies DocumentExtractionModelConfig;

const secondaryModel = {
  role: "secondary",
  provider: "openrouter",
  model: "mistralai/mistral-medium-3.1",
  timeoutMs: 2500,
} satisfies DocumentExtractionModelConfig;

describe("document extraction schemas", () => {
  test("validate receipt and invoice structured extraction fields", () => {
    expect(
      receiptExtractionSchema.parse({
        documentType: "receipt",
        merchantName: "Acme Supplies",
        storeName: "Acme Downtown",
        totalAmountMinor: 4250,
        currency: "usd",
        issuedAt: "2026-06-14",
        taxAmountMinor: 850,
        website: "https://acme.example",
        language: "en",
        fieldConfidence: { totalAmountMinor: 0.91 },
        overallConfidence: 0.88,
      }),
    ).toMatchObject({
      documentType: "receipt",
      currency: "USD",
      merchantName: "Acme Supplies",
      totalAmountMinor: 4250,
    });
    expect(
      invoiceExtractionSchema.parse({
        documentType: "invoice_received",
        vendorName: "Acme Consulting",
        customerName: "Dawn Studio",
        invoiceNumber: "INV-100",
        issuedAt: "2026-06-01",
        dueAt: "2026-06-30",
        totalAmountMinor: 125000,
        currency: "eur",
        taxAmountMinor: 25000,
        website: null,
        language: "en",
      }),
    ).toMatchObject({
      documentType: "invoice_received",
      currency: "EUR",
      vendorName: "Acme Consulting",
      invoiceNumber: "INV-100",
    });
    expect(documentExtractionOutputSchema.parse({ documentType: "other" })).toMatchObject({
      documentType: "other",
    });
  });
});

describe("local deterministic document extraction provider", () => {
  test("extracts invoice fields from readable PDF text and filename evidence", async () => {
    const provider = createLocalDeterministicDocumentExtractionProvider();
    const result = await provider.extract({
      fileName: "Hetzner_2026-02-05_083000697030.pdf",
      contentType: "application/pdf",
      rawText: [
        "Hetzner Online GmbH • Industriestr. 25 • 91710 Gunzenhausen • Germany",
        "Invoice no.: 083000697030",
        "Invoice date: 05/02/2026",
        "Total € 7.58 € 0.00 € 7.58",
      ].join("\n"),
    });

    expect(result.fields).toMatchObject({
      documentType: "invoice_received",
      vendorName: "Hetzner Online GmbH • Industriestr. 25 • 91710 Gunzenhausen • Germany",
      invoiceNumber: "083000697030",
      issuedAt: "2026-02-05",
      totalAmountMinor: 758,
      currency: "EUR",
    });
  });

  test("uses amount due without treating invoice ids as amounts", async () => {
    const provider = createLocalDeterministicDocumentExtractionProvider();
    const result = await provider.extract({
      fileName: "Payment Reminder (K0744636625).pdf",
      contentType: "application/pdf",
      rawText: [
        "Hetzner Online GmbH • Industriestr. 25 • 91710 Gunzenhausen • Germany",
        "Date: 16/04/2026",
        "Payment Reminder",
        "Invoice Date Invoice amount Return debit note fee Outstanding",
        "86000793725 05/04/2026 € 10.99 € 0.00 € 10.99",
        "Amount due € 10.99",
      ].join("\n"),
    });

    expect(result.fields).toMatchObject({
      documentType: "invoice_received",
      issuedAt: "2026-04-16",
      totalAmountMinor: 1099,
      currency: "EUR",
    });
  });

  test("extracts Swedish invoice currency and total from generic labels", async () => {
    const provider = createLocalDeterministicDocumentExtractionProvider();
    const result = await provider.extract({
      fileName: "90437.pdf",
      contentType: "application/pdf",
      rawText: [
        "Gamlestadsvägen 1",
        "FAKTURA Fakturadatum: 2026-03-02",
        "Fakturanummer: 90437 Förfallodatum: 2026-03-22",
        "Valuta: SEK",
        "Att betala 325 kr",
      ].join("\n"),
    });

    expect(result.fields).toMatchObject({
      documentType: "invoice_received",
      invoiceNumber: "90437",
      issuedAt: "2026-03-02",
      totalAmountMinor: 32500,
      currency: "SEK",
    });
  });
});

describe("OpenAI document extraction provider", () => {
  test("calls chat completions with structured output and normalizes fields", async () => {
    const requests: unknown[] = [];
    const provider = createOpenAiDocumentExtractionProvider({
      apiKey: "test-key",
      model: "gpt-4o-mini",
      fetch: async (_url, init) => {
        requests.push(JSON.parse(String(init?.body)));
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    documentType: "invoice_received",
                    merchantName: null,
                    storeName: null,
                    vendorName: "Google Cloud EMEA Limited",
                    customerName: "Drastic AB",
                    invoiceNumber: "5580091738",
                    issuedAt: "2026-05-31",
                    dueAt: null,
                    totalAmountMinor: 1620,
                    currency: "EUR",
                    taxAmountMinor: 0,
                    website: null,
                    language: "sv",
                    rawText: null,
                    summary: "Google Workspace invoice",
                    overallConfidence: 0.9,
                    fieldConfidence: {
                      documentType: 0.9,
                      merchantName: null,
                      storeName: null,
                      vendorName: 0.9,
                      customerName: 0.7,
                      invoiceNumber: 0.95,
                      issuedAt: 0.9,
                      dueAt: null,
                      totalAmountMinor: 0.95,
                      currency: 0.95,
                      taxAmountMinor: 0.8,
                    },
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        );
      },
    });

    const result = await provider.extract({
      fileName: "5580091738.pdf",
      contentType: "application/pdf",
      rawText: "Google Cloud EMEA Limited\nFakturanummer: 5580091738\nTotalt i EUR 16,20 €",
    });

    expect(requests[0]).toMatchObject({
      model: "gpt-4o-mini",
      response_format: { type: "json_schema" },
    });
    expect(result.fields).toMatchObject({
      documentType: "invoice_received",
      merchantName: "Google Cloud EMEA Limited",
      invoiceNumber: "5580091738",
      issuedAt: "2026-05-31",
      totalAmountMinor: 1620,
      currency: "EUR",
    });
    expect(result.confidence).toMatchObject({ overall: 0.9, invoiceNumber: 0.95 });
  });
});

describe("TanStack document extraction provider", () => {
  test("extracts a receipt with structured output and attempt metadata", async () => {
    const calls: Parameters<DocumentExtractionChatCall>[0][] = [];
    const chat: DocumentExtractionChatCall = async (input) => {
      calls.push(input);
      return {
        documentType: "receipt",
        merchantName: "Acme Supplies",
        totalAmountMinor: 4250,
        currency: "USD",
        issuedAt: "2026-06-14",
        taxAmountMinor: 850,
        website: "https://acme.example",
        language: "en",
        fieldConfidence: {
          merchantName: 0.9,
          totalAmountMinor: 0.94,
        },
        overallConfidence: 0.91,
      };
    };
    const provider = createTanStackDocumentExtractionProvider({
      chat,
      cascade: { primary: primaryModel },
      createAdapter: (model) => ({ provider: model.provider, model: model.model }),
    });

    const result = await provider.extract({
      fileName: "receipt.png",
      contentType: "image/png",
      body: new Uint8Array([1, 2, 3]).buffer,
    });

    expect(result.fields).toMatchObject({
      documentType: "receipt",
      merchantName: "Acme Supplies",
      totalAmountMinor: 4250,
      currency: "USD",
      issuedAt: "2026-06-14",
      taxAmountMinor: 850,
      website: "https://acme.example",
      language: "en",
    });
    expect(result.confidence).toMatchObject({
      merchantName: 0.9,
      totalAmountMinor: 0.94,
      overall: 0.91,
    });
    expect(result.metadata).toMatchObject({
      provider: "gemini",
      model: "gemini-3.1-pro-preview",
      timeoutMs: 1500,
      attempts: [
        { attempt: 1, provider: "gemini", model: "gemini-3.1-pro-preview", status: "completed" },
      ],
    });
    expect(calls[0]?.messages[0]).toMatchObject({
      role: "user",
      content: [
        { type: "text" },
        { type: "image", source: { type: "data", mimeType: "image/png" } },
      ],
    });
  });

  test("uses URL content when preprocessing chooses signed document input", async () => {
    const calls: Parameters<DocumentExtractionChatCall>[0][] = [];
    const chat: DocumentExtractionChatCall = async (input) => {
      calls.push(input);
      return {
        documentType: "receipt",
        merchantName: "Acme Supplies",
        totalAmountMinor: 4250,
        currency: "USD",
        issuedAt: "2026-06-14",
        overallConfidence: 0.91,
      };
    };
    const provider = createTanStackDocumentExtractionProvider({
      chat,
      cascade: { primary: primaryModel },
      createAdapter: (model) => ({ provider: model.provider, model: model.model }),
    });

    await provider.extract({
      fileName: "receipt.pdf",
      contentType: "application/pdf",
      sourceUrl: "https://signed.example/receipt.pdf",
    });

    expect(calls[0]?.messages[0]).toMatchObject({
      role: "user",
      content: [
        { type: "text" },
        {
          type: "document",
          source: {
            type: "url",
            value: "https://signed.example/receipt.pdf",
            mimeType: "application/pdf",
          },
        },
      ],
    });
  });

  test("cascades to the secondary model after a provider failure", async () => {
    const attemptedModels: string[] = [];
    const chat: DocumentExtractionChatCall = async (input) => {
      const adapter = input.adapter as { model: string };
      attemptedModels.push(adapter.model);

      if (adapter.model === primaryModel.model) {
        throw new Error("primary unavailable");
      }

      return {
        documentType: "invoice_received",
        vendorName: "Acme Consulting",
        customerName: "Dawn Studio",
        invoiceNumber: "INV-100",
        issuedAt: "2026-06-01",
        dueAt: "2026-06-30",
        totalAmountMinor: 125000,
        currency: "USD",
        taxAmountMinor: 25000,
        language: "en",
        overallConfidence: 0.86,
      };
    };
    const provider = createTanStackDocumentExtractionProvider({
      chat,
      cascade: { primary: primaryModel, secondary: secondaryModel },
      createAdapter: (model) => ({ model: model.model }),
    });

    const result = await provider.extract({
      fileName: "invoice.pdf",
      contentType: "application/pdf",
      body: new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer,
    });

    expect(attemptedModels).toEqual([primaryModel.model, secondaryModel.model]);
    expect(result.fields).toMatchObject({
      documentType: "invoice_received",
      vendorName: "Acme Consulting",
      invoiceNumber: "INV-100",
      dueAt: "2026-06-30",
      totalAmountMinor: 125000,
    });
    expect(result.metadata.attempts).toMatchObject([
      {
        attempt: 1,
        status: "failed",
        provider: "gemini",
        model: primaryModel.model,
        errorClass: "Error",
      },
      {
        attempt: 2,
        status: "completed",
        provider: "openrouter",
        model: secondaryModel.model,
      },
    ]);
  });

  test("resolves primary secondary and tertiary model cascade", () => {
    expect(
      resolveDocumentExtractionCascade({
        primary: primaryModel,
        secondary: secondaryModel,
        tertiary: {
          role: "tertiary",
          provider: "openai_compatible",
          model: "mistral-document",
          baseURL: "https://api.example.com/v1",
          apiKey: "secret",
          timeoutMs: 3500,
        },
      }),
    ).toEqual([primaryModel, secondaryModel, expect.objectContaining({ role: "tertiary" })]);
  });
});
