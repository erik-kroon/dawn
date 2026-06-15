import { describe, expect, test } from "bun:test";

import { createMockInvoiceEmailDeliveryProvider } from "./index";

describe("invoice email delivery provider", () => {
  test("accepts invoice messages with pdf attachments", async () => {
    const provider = createMockInvoiceEmailDeliveryProvider();

    const result = await provider.sendInvoice({
      teamId: "team_1",
      invoiceId: "invoice_1",
      to: "billing@acme.test",
      subject: "Invoice INV-001",
      text: "Attached invoice INV-001",
      attachment: {
        fileName: "INV-001.pdf",
        contentType: "application/pdf",
        bodyBase64: Buffer.from("%PDF-1.4").toString("base64"),
      },
    });

    expect(result).toEqual({
      providerMessageId: "mock_email_team_1_invoice_1",
      acceptedAt: "2026-06-15T12:00:00.000Z",
    });
  });

  test("accepts accountant packet link messages", async () => {
    const provider = createMockInvoiceEmailDeliveryProvider();

    const result = await provider.sendAccountantPacket({
      teamId: "team_1",
      packetId: "packet_1",
      to: "accountant@acme.test",
      cc: ["owner@acme.test"],
      subject: "Accountant packet",
      text: "Download the packet.",
      downloadUrl: "https://app.example.com/documents/download/token",
      downloadExpiresAt: "2026-06-15T12:05:00.000Z",
      fileName: "accountant-packet.zip",
    });

    expect(result).toEqual({
      providerMessageId: "mock_email_team_1_packet_1",
      acceptedAt: "2026-06-15T12:00:00.000Z",
    });
  });
});
