import { describe, expect, test } from "bun:test";

import {
  createFortnoxIntegrationProvider,
  createFortnoxTokenCodec,
  createMockFortnoxIntegrationProvider,
  createMockIntegrationProviders,
  normalizeFortnoxConnectionHealth,
  type FortnoxHttpFetch,
} from "./index";

describe("integration provider contracts", () => {
  test("declares capabilities for accounting, payments, messaging, and email adapters", async () => {
    const providers = createMockIntegrationProviders();

    expect(providers.map((provider) => [provider.category, provider.provider])).toEqual([
      ["accounting", "fortnox"],
      ["accounting", "mock-accounting"],
      ["payments", "mock-payments"],
      ["messaging", "mock-messaging"],
      ["email", "mock-email"],
    ]);
    expect(providers.every((provider) => provider.capabilities.includes("connect"))).toBe(true);
    expect(providers.every((provider) => provider.capabilities.includes("disable"))).toBe(true);
  });

  test("syncs Fortnox company, customers, and articles as external objects", async () => {
    const fortnox = createMockIntegrationProviders().find(
      (provider) => provider.provider === "fortnox",
    )!;

    const connection = await fortnox.connect({
      teamId: "team_1",
      actorId: "user_1",
      idempotencyKey: "connect_fortnox_1",
    });
    const synced = await fortnox.sync({
      teamId: "team_1",
      providerConnectionId: connection.providerConnectionId,
    });

    expect(connection).toMatchObject({
      provider: "fortnox",
      category: "accounting",
      displayName: "Fortnox Demo AB",
      token: { keyId: "mock-fortnox-token" },
      rawPayload: { oauth: { stateValidated: true } },
    });
    expect(synced.recordsSynced).toBe(8);
    expect(synced.externalObjects?.map((object) => object.providerObjectType)).toEqual([
      "company",
      "customer",
      "customer",
      "article",
      "article",
      "invoice",
      "invoice",
      "payment",
    ]);
    expect(
      synced.externalObjects?.find((object) => object.providerObjectId === "1001"),
    ).toMatchObject({
      providerObjectType: "customer",
      rawPayload: {
        providerConnectionId: "fortnox_team_1",
        organizationNumber: "5561112222",
      },
    });
    expect(synced.rawPayload).toMatchObject({
      provider: "fortnox",
      customerCount: 2,
      articleCount: 2,
      invoiceCount: 2,
      paymentCount: 1,
      invoicePollingFallback: true,
      paymentPollingFallback: true,
    });
    expect(
      synced.externalObjects?.find((object) => object.providerObjectType === "invoice"),
    ).toMatchObject({
      providerObjectId: "9001",
      rawPayload: { paymentState: "paid", balance: 0 },
    });
    expect(
      synced.externalObjects?.find((object) => object.providerObjectType === "payment"),
    ).toMatchObject({
      providerObjectId: "7001",
      rawPayload: { invoiceNumber: "9001", amount: 250000 },
    });
  });

  test("builds Fortnox OAuth URLs, exchanges callbacks, and disconnects through the adapter", async () => {
    const fortnox = createMockIntegrationProviders().find(
      (provider) => provider.provider === "fortnox",
    )!;
    const authorization = fortnox.createAuthorizationUrl!({
      teamId: "team_1",
      actorId: "user_1",
      redirectUrl: "http://localhost:3001/settings",
      state: "state_1",
    });
    const url = new URL(authorization.authorizationUrl);
    const connection = await fortnox.exchangeOAuthCode!({
      teamId: "team_1",
      actorId: "user_1",
      code: "authorization_code_1234",
      redirectUrl: "http://localhost:3001/settings",
      state: "state_1",
      idempotencyKey: "callback_1",
    });
    const disconnected = await fortnox.disconnect!({
      teamId: "team_1",
      providerConnectionId: connection.providerConnectionId,
    });

    expect(url.origin + url.pathname).toBe("https://apps.fortnox.se/oauth-v1/auth");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("state_1");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("account_type")).toBe("service");
    expect(url.searchParams.get("scope")).toBe("companyinformation customer article invoice");
    expect(connection).toMatchObject({
      provider: "fortnox",
      providerConnectionId: "fortnox_team_1",
      rawPayload: {
        oauth: {
          source: "authorization_code",
          authorizationCodeLastFour: "1234",
          tokenEndpoint: "https://apps.fortnox.se/oauth-v1/token",
        },
      },
    });
    expect(disconnected).toEqual({
      status: "disconnected",
      rawPayload: {
        mock: true,
        provider: "fortnox",
        providerConnectionId: "fortnox_team_1",
        revokeEndpoint: "https://apps.fortnox.se/oauth-v1/revoke",
        tokenTypeHint: "refresh_token",
        revoked: true,
      },
    });
  });

  test("exchanges real Fortnox OAuth codes through the credential-backed token endpoint", async () => {
    const tokenCodec = createFortnoxTokenCodec({
      secret: "fortnox_real_provider_token_secret",
      keyId: "fortnox-real-test",
    });
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchStub: FortnoxHttpFetch = async (input, init) => {
      requests.push({ url: input.toString(), init });

      return Response.json({
        access_token: "fortnox_access_1",
        refresh_token: "fortnox_refresh_1",
        scope: "companyinformation customer article invoice",
        expires_in: 3600,
        token_type: "bearer",
      });
    };
    const fortnox = createFortnoxIntegrationProvider({
      clientId: "fortnox_client_1",
      clientSecret: "fortnox_secret_1",
      tokenCodec,
      fetch: fetchStub,
      now: () => new Date("2026-06-20T08:00:00.000Z"),
    });
    const authorization = fortnox.createAuthorizationUrl!({
      teamId: "team_1",
      actorId: "user_1",
      redirectUrl: "https://app.dawn.test/settings/integrations",
      state: "state_1",
    });
    const connection = await fortnox.exchangeOAuthCode!({
      teamId: "team_1",
      actorId: "user_1",
      code: "authorization_code_1234",
      redirectUrl: "https://app.dawn.test/settings/integrations",
      state: "state_1",
      idempotencyKey: "callback_1",
    });
    const token = await tokenCodec.decrypt(connection.token);
    const tokenRequest = requests[0]!;
    const tokenBody = new URLSearchParams(tokenRequest.init?.body as URLSearchParams);

    expect(new URL(authorization.authorizationUrl).searchParams.get("client_id")).toBe(
      "fortnox_client_1",
    );
    expect(new URL(authorization.authorizationUrl).searchParams.get("scope")).toBe(
      "companyinformation customer article invoice",
    );
    expect(tokenRequest.url).toBe("https://apps.fortnox.se/oauth-v1/token");
    const tokenRequestHeaders = tokenRequest.init?.headers as Record<string, string> | undefined;
    expect(tokenRequestHeaders?.authorization).toBe(
      `Basic ${Buffer.from("fortnox_client_1:fortnox_secret_1").toString("base64")}`,
    );
    expect(tokenBody.get("grant_type")).toBe("authorization_code");
    expect(tokenBody.get("code")).toBe("authorization_code_1234");
    expect(tokenBody.get("redirect_uri")).toBe("https://app.dawn.test/settings/integrations");
    expect(token).toMatchObject({
      accessToken: "fortnox_access_1",
      refreshToken: "fortnox_refresh_1",
      expiresAt: "2026-06-20T09:00:00.000Z",
      scopes: ["companyinformation", "customer", "article", "invoice"],
    });
    expect(connection).toMatchObject({
      provider: "fortnox",
      providerConnectionId: "fortnox:team_1",
      rawPayload: {
        oauth: {
          source: "authorization_code",
          authorizationCodeLastFour: "1234",
          tokenType: "bearer",
        },
        health: { status: "connected", warnings: [] },
      },
    });
    expect(JSON.stringify(connection.rawPayload)).not.toContain("fortnox_refresh_1");
    expect(connection.token.encryptedToken).not.toContain("fortnox_refresh_1");
  });

  test("refreshes real Fortnox tokens and resumes provider-backed catalog pagination", async () => {
    const tokenCodec = createFortnoxTokenCodec({
      secret: "fortnox_real_sync_token_secret",
      keyId: "fortnox-real-sync-test",
    });
    const initialToken = await tokenCodec.encrypt({
      accessToken: "fortnox_access_expired",
      refreshToken: "fortnox_refresh_old",
      expiresAt: "2026-06-20T08:01:00.000Z",
      tokenType: "bearer",
      scopes: ["companyinformation", "customer", "article", "invoice"],
      rawPayload: { provider: "fortnox" },
    });
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchStub: FortnoxHttpFetch = async (input, init) => {
      const url = new URL(input.toString());
      requests.push({ url: url.toString(), init });

      if (url.pathname === "/oauth-v1/token") {
        return Response.json({
          access_token: "fortnox_access_refreshed",
          refresh_token: "fortnox_refresh_new",
          scope: "companyinformation customer article invoice",
          expires_in: 3600,
          token_type: "bearer",
        });
      }

      const headers = init?.headers as Record<string, string> | undefined;
      expect(headers?.authorization).toBe("Bearer fortnox_access_refreshed");

      if (url.pathname === "/3/companyinformation") {
        return Response.json({
          CompanyInformation: {
            Name: "Fortnox Live AB",
            OrganizationNumber: "556677-8899",
          },
        });
      }

      if (url.pathname === "/3/customers" && url.searchParams.get("page") === "1") {
        return Response.json({
          Customers: [
            {
              CustomerNumber: "1001",
              Name: "Acme Sverige AB",
              OrganisationNumber: "556111-2222",
              Currency: "SEK",
              TermsOfPayment: "30",
            },
          ],
          MetaInformation: { "@CurrentPage": 1, "@TotalPages": 2 },
        });
      }

      if (url.pathname === "/3/customers" && url.searchParams.get("page") === "2") {
        return Response.json({
          Customers: [
            {
              CustomerNumber: "1002",
              Name: "Nordic Supply AB",
              OrganisationNumber: "559999-0000",
              Currency: "SEK",
              TermsOfPayment: "15",
            },
          ],
          MetaInformation: { "@CurrentPage": 2, "@TotalPages": 2 },
        });
      }

      if (url.pathname === "/3/articles") {
        return Response.json({
          Articles: [
            {
              ArticleNumber: "KONSULT",
              Description: "Konsulttimme",
              SalesPrice: 125000,
              VAT: 25,
              Unit: "tim",
            },
          ],
          MetaInformation: { "@CurrentPage": 1, "@TotalPages": 1 },
        });
      }

      if (url.pathname === "/3/invoices") {
        return Response.json({
          Invoices: [
            {
              DocumentNumber: "9001",
              CustomerNumber: "1001",
              CustomerName: "Acme Sverige AB",
              InvoiceDate: "2026-06-15",
              DueDate: "2026-07-15",
              Balance: "0",
              Total: "250000",
              Currency: "SEK",
              Booked: true,
            },
          ],
          MetaInformation: { "@CurrentPage": 1, "@TotalPages": 1 },
        });
      }

      if (url.pathname === "/3/invoicepayments") {
        return Response.json({
          InvoicePayments: [
            {
              Number: "7001",
              InvoiceNumber: "9001",
              Amount: "250000",
              PaymentDate: "2026-06-20",
              Currency: "SEK",
              ModeOfPayment: "BG",
            },
          ],
          MetaInformation: { "@CurrentPage": 1, "@TotalPages": 1 },
        });
      }

      return Response.json(
        { ErrorInformation: { message: "unexpected Fortnox URL" } },
        {
          status: 404,
        },
      );
    };
    const fortnox = createFortnoxIntegrationProvider({
      clientId: "fortnox_client_1",
      clientSecret: "fortnox_secret_1",
      tokenCodec,
      fetch: fetchStub,
      now: () => new Date("2026-06-20T08:00:00.000Z"),
      maxPagesPerSync: 2,
    });

    const firstSync = await fortnox.sync({
      teamId: "team_1",
      providerConnectionId: "fortnox:team_1",
      token: initialToken,
      syncMode: "initial",
    });
    const refreshed = await tokenCodec.decrypt(firstSync.refreshedToken!);
    const resumed = await fortnox.sync({
      teamId: "team_1",
      providerConnectionId: "fortnox:team_1",
      token: firstSync.refreshedToken!,
      syncMode: "initial",
      cursor: firstSync.recovery?.retryCursor ?? null,
    });
    const completed = await fortnox.sync({
      teamId: "team_1",
      providerConnectionId: "fortnox:team_1",
      token: firstSync.refreshedToken!,
      syncMode: "initial",
      cursor: resumed.recovery?.retryCursor ?? null,
    });
    const tokenRequest = requests.find((request) => request.url.endsWith("/oauth-v1/token"))!;
    const refreshBody = new URLSearchParams(tokenRequest.init?.body as URLSearchParams);

    expect(refreshBody.get("grant_type")).toBe("refresh_token");
    expect(refreshBody.get("refresh_token")).toBe("fortnox_refresh_old");
    expect(refreshed).toMatchObject({
      accessToken: "fortnox_access_refreshed",
      refreshToken: "fortnox_refresh_new",
      expiresAt: "2026-06-20T09:00:00.000Z",
    });
    expect(firstSync).toMatchObject({
      status: "partial",
      recordsSynced: 3,
      recovery: {
        retryCursor: {
          resource: "article",
          page: 1,
        },
      },
    });
    expect(firstSync.externalObjects?.map((object) => object.providerObjectId)).toEqual([
      "5566778899",
      "1001",
      "1002",
    ]);
    expect(resumed).toMatchObject({
      status: "partial",
      recordsSynced: 2,
      recovery: {
        retryCursor: {
          resource: "payment",
          page: 1,
        },
      },
    });
    expect(resumed.externalObjects?.map((object) => object.providerObjectId)).toEqual([
      "KONSULT",
      "9001",
    ]);
    expect(completed).toMatchObject({ status: "completed", recordsSynced: 1 });
    expect(completed.externalObjects?.map((object) => object.providerObjectId)).toEqual(["7001"]);
  });

  test("encrypts Fortnox tokens and refreshes near-expiry credentials during sync", async () => {
    const tokenCodec = createFortnoxTokenCodec({
      secret: "fortnox_provider_token_secret",
      keyId: "fortnox-test",
    });
    const fortnox = createMockFortnoxIntegrationProvider({
      tokenCodec,
      grantedScopes: ["companyinformation", "customer"],
      licensedScopes: ["companyinformation", "customer", "article"],
      now: () => new Date("2026-06-15T10:29:00.000Z"),
    });
    const connection = await fortnox.exchangeOAuthCode!({
      teamId: "team_1",
      actorId: "user_1",
      code: "authorization_code_1234",
      redirectUrl: "http://localhost:3001/settings",
      state: "state_1",
      idempotencyKey: "callback_1",
    });

    const decrypted = await tokenCodec.decrypt(connection.token);
    const synced = await fortnox.sync({
      teamId: "team_1",
      providerConnectionId: connection.providerConnectionId,
      token: connection.token,
      rawPayload: connection.rawPayload,
    });
    const refreshed = await tokenCodec.decrypt(synced.refreshedToken!);

    expect(connection.token.encryptedToken).toStartWith("v1:");
    expect(connection.token.encryptedToken).not.toContain(decrypted.refreshToken);
    expect(decrypted.scopes).toEqual(["companyinformation", "customer"]);
    expect(refreshed.accessToken).toStartWith("mock_fortnox_refreshed_");
    expect(synced.connectionRawPayload?.health).toMatchObject({
      status: "warning",
      missingScopes: ["article", "invoice"],
      warnings: expect.arrayContaining([
        expect.objectContaining({ code: "missing_scope", scope: "article" }),
        expect.objectContaining({ code: "missing_license", scope: "invoice" }),
      ]),
    });
  });

  test("returns partial Fortnox sync recovery cursors without dropping successful objects", async () => {
    const fortnox = createMockFortnoxIntegrationProvider({ partialFailure: true });
    const connection = await fortnox.connect({
      teamId: "team_1",
      actorId: "user_1",
      idempotencyKey: "connect_partial_1",
    });

    const partial = await fortnox.sync({
      teamId: "team_1",
      providerConnectionId: connection.providerConnectionId,
      token: connection.token,
      rawPayload: connection.rawPayload,
      syncMode: "initial",
    });
    const resumed = await fortnox.sync({
      teamId: "team_1",
      providerConnectionId: connection.providerConnectionId,
      token: connection.token,
      rawPayload: connection.rawPayload,
      syncMode: "initial",
      cursor: partial.recovery?.retryCursor ?? null,
    });

    expect(partial).toMatchObject({
      status: "partial",
      recordsSynced: 4,
      error: "Fortnox article sync partially failed",
      recovery: {
        retryCursor: {
          resumeFrom: "fortnox:article:SUPPORT",
          failedObjectType: "article",
        },
      },
    });
    expect(partial.externalObjects?.map((object) => object.providerObjectId)).toEqual([
      "5566778899",
      "1001",
      "1002",
      "KONSULT",
    ]);
    expect(resumed).toMatchObject({ status: "completed", recordsSynced: 1 });
    expect(resumed.externalObjects?.map((object) => object.providerObjectId)).toEqual(["SUPPORT"]);
  });

  test("normalizes Fortnox connection health warnings", () => {
    expect(
      normalizeFortnoxConnectionHealth({
        grantedScopes: ["companyinformation", "customer", "article", "invoice"],
        expiresAt: "2026-06-15T11:00:00.000Z",
        now: new Date("2026-06-15T10:00:00.000Z"),
      }),
    ).toMatchObject({
      status: "connected",
      warnings: [],
      missingScopes: [],
    });
    expect(
      normalizeFortnoxConnectionHealth({
        grantedScopes: ["companyinformation"],
        licensedScopes: ["companyinformation", "customer"],
        expiresAt: "2026-06-15T10:02:00.000Z",
        now: new Date("2026-06-15T10:00:00.000Z"),
      }).warnings.map((warning) => warning.code),
    ).toEqual([
      "missing_scope",
      "missing_scope",
      "missing_scope",
      "missing_license",
      "missing_license",
      "token_expiring",
    ]);
  });

  test("returns encrypted token metadata instead of raw provider secrets", async () => {
    const provider = createMockIntegrationProviders()[0]!;
    const connection = await provider.connect({
      teamId: "team_1",
      actorId: "user_1",
      idempotencyKey: "connect_1",
    });

    expect(connection.token.encryptedToken).toStartWith("v1:");
    expect(connection.token.encryptedToken).not.toContain("mock_secret");
    expect(connection.token.keyId).toBe("mock-fortnox-token");
    expect(connection.token.lastFour).toHaveLength(4);
  });

  test("exports accounting transactions and invoices through typed contracts", async () => {
    const accounting = createMockIntegrationProviders().find(
      (provider) => provider.provider === "mock-accounting",
    )!;
    const payments = createMockIntegrationProviders().find(
      (provider) => provider.provider === "mock-payments",
    )!;

    const transactionExport = await accounting.exportTransactions!({
      teamId: "team_1",
      providerConnectionId: "mock-accounting_team_1",
      transactions: [
        {
          id: "txn_1",
          teamId: "team_1",
          description: "Consulting payment",
          postedAt: "2026-06-15T00:00:00.000Z",
          money: { amountMinor: 5_000_00, currency: "USD" },
          categoryId: null,
          reviewState: "reviewed",
          source: "manual",
        },
      ],
    });
    const invoiceExport = await accounting.exportInvoices!({
      teamId: "team_1",
      providerConnectionId: "mock-accounting_team_1",
      invoices: [
        {
          id: "invoice_1",
          teamId: "team_1",
          customerId: "customer_1",
          invoiceNumber: "INV-001",
          status: "sent",
          issueDate: "2026-06-15T00:00:00.000Z",
          currency: "USD",
          discountBasisPoints: 0,
          lines: [],
          totals: {
            subtotal: { amountMinor: 5_000_00, currency: "USD" },
            discount: { amountMinor: 0, currency: "USD" },
            tax: { amountMinor: 0, currency: "USD" },
            total: { amountMinor: 5_000_00, currency: "USD" },
          },
          amountPaid: { amountMinor: 0, currency: "USD" },
          createdByActorId: "user_1",
        },
      ],
    });

    expect(transactionExport).toMatchObject({
      recordsExported: 1,
      rawPayload: { exportType: "transactions" },
    });
    expect(invoiceExport).toMatchObject({
      recordsExported: 1,
      rawPayload: { exportType: "invoices" },
    });
    await expect(
      payments.exportTransactions!({
        teamId: "team_1",
        providerConnectionId: "mock-payments_team_1",
        transactions: [],
      }),
    ).rejects.toThrow("mock-payments does not export transactions");
  });

  test("normalizes payment provider events through typed contracts", async () => {
    const payments = createMockIntegrationProviders().find(
      (provider) => provider.provider === "mock-payments",
    )!;
    const messaging = createMockIntegrationProviders().find(
      (provider) => provider.provider === "mock-messaging",
    )!;

    const result = await payments.receivePaymentEvent!({
      teamId: "team_1",
      providerConnectionId: "mock-payments_team_1",
      rawPayload: {
        providerEventId: "evt_payment_1",
        invoiceId: "invoice_1",
        amountMinor: 5_000_00,
        currency: "usd",
        paidAt: "2026-06-15T12:00:00.000Z",
        method: "card",
      },
    });

    expect(result.paymentEvent).toMatchObject({
      providerEventId: "evt_payment_1",
      invoiceId: "invoice_1",
      amount: { amountMinor: 5_000_00, currency: "USD" },
      method: "card",
    });
    await expect(
      messaging.receivePaymentEvent!({
        teamId: "team_1",
        providerConnectionId: "mock-messaging_team_1",
        rawPayload: {},
      }),
    ).rejects.toThrow("mock-messaging does not receive payment events");
  });

  test("sends messaging and email deliveries through typed contracts", async () => {
    const providers = createMockIntegrationProviders();
    const messaging = providers.find((provider) => provider.provider === "mock-messaging")!;
    const email = providers.find((provider) => provider.provider === "mock-email")!;
    const accounting = providers.find((provider) => provider.provider === "mock-accounting")!;

    const message = await messaging.sendMessage!({
      teamId: "team_1",
      providerConnectionId: "mock-messaging_team_1",
      channel: "#finance",
      text: "Invoice paid",
    });
    const sentEmail = await email.sendEmail!({
      teamId: "team_1",
      providerConnectionId: "mock-email_team_1",
      to: "owner@example.com",
      subject: "Invoice paid",
      text: "Acme paid INV-001.",
    });

    expect(message).toMatchObject({
      status: "completed",
      rawPayload: { channel: "#finance", textLength: 12 },
    });
    expect(sentEmail).toMatchObject({
      status: "completed",
      rawPayload: { to: "owner@example.com", subject: "Invoice paid" },
    });
    await expect(
      accounting.sendMessage!({
        teamId: "team_1",
        providerConnectionId: "mock-accounting_team_1",
        channel: "#finance",
        text: "Invoice paid",
      }),
    ).rejects.toThrow("mock-accounting does not send messages");
  });
});
