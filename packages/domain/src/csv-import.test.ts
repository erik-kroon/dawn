import { describe, expect, test } from "bun:test";

import {
  csvRowToLedgerDraft,
  ledgerDuplicateKey,
  parseCsvTransactionRows,
  parseMoneyAmountMinor,
} from "./index";

describe("csv transaction import", () => {
  test("parses quoted CSV rows with headers", () => {
    expect(
      parseCsvTransactionRows(
        'Date,Description,Amount\n2026-06-14,"Figma, Inc",-12.00\n2026-06-15,Invoice,50.00\n',
      ),
    ).toEqual([
      {
        rowNumber: 2,
        values: {
          Date: "2026-06-14",
          Description: "Figma, Inc",
          Amount: "-12.00",
        },
      },
      {
        rowNumber: 3,
        values: {
          Date: "2026-06-15",
          Description: "Invoice",
          Amount: "50.00",
        },
      },
    ]);
  });

  test("parses semicolon-delimited bank exports with decimal commas", () => {
    const rows = parseCsvTransactionRows(
      'Date;Description;Amount;Currency\n2026-06-14;"Figma; Inc";-12,34;EUR\n',
    );

    expect(rows).toEqual([
      {
        rowNumber: 2,
        values: {
          Date: "2026-06-14",
          Description: "Figma; Inc",
          Amount: "-12,34",
          Currency: "EUR",
        },
      },
    ]);
    expect(parseMoneyAmountMinor("-12,34", "EUR")).toBe(-1234);
    expect(parseMoneyAmountMinor("1.234,56", "EUR")).toBe(123456);
  });

  test("parses decimal money into exact minor units", () => {
    expect(parseMoneyAmountMinor("1,200.34", "USD")).toBe(120034);
    expect(parseMoneyAmountMinor("(12.00)", "USD")).toBe(-1200);
    expect(parseMoneyAmountMinor("1200", "JPY")).toBe(1200);
    expect(() => parseMoneyAmountMinor("12.345", "USD")).toThrow(
      "Money amount has too many decimal places for currency",
    );
  });

  test("normalizes CSV rows into ledger drafts", () => {
    const row = parseCsvTransactionRows(
      "Date,Description,Amount,Currency\n2026-06-14,Figma subscription,-12.00,USD\n",
    )[0];

    expect(row).toBeDefined();

    const draft = csvRowToLedgerDraft({
      teamId: "team_1",
      accountId: "acct_1",
      accountCurrency: "USD",
      mapping: {
        postedAt: "Date",
        description: "Description",
        amount: "Amount",
        currency: "Currency",
      },
      row: row!,
      categoryId: "cat_software",
    });

    expect(draft).toMatchObject({
      teamId: "team_1",
      accountId: "acct_1",
      description: "Figma subscription",
      money: { amountMinor: -1200, currency: "USD" },
      type: "expense",
      source: "csv_import",
      categoryId: "cat_software",
    });
    expect(ledgerDuplicateKey(draft)).toBe(
      "team_1:csv_import:acct_1:2026-06-14:USD:-1200:figma subscription",
    );
  });

  test("normalizes debit and credit columns into signed ledger drafts", () => {
    const rows = parseCsvTransactionRows(
      "Date,Description,Debit,Credit\n2026-06-14,Figma subscription,12.00,\n2026-06-15,Invoice,,50.00\n",
    );

    const expense = csvRowToLedgerDraft({
      teamId: "team_1",
      accountId: "acct_1",
      accountCurrency: "USD",
      mapping: {
        postedAt: "Date",
        description: "Description",
        debit: "Debit",
        credit: "Credit",
      },
      row: rows[0]!,
    });
    const income = csvRowToLedgerDraft({
      teamId: "team_1",
      accountId: "acct_1",
      accountCurrency: "USD",
      mapping: {
        postedAt: "Date",
        description: "Description",
        debit: "Debit",
        credit: "Credit",
      },
      row: rows[1]!,
    });

    expect(expense.money).toEqual({ amountMinor: -1200, currency: "USD" });
    expect(expense.type).toBe("expense");
    expect(income.money).toEqual({ amountMinor: 5000, currency: "USD" });
    expect(income.type).toBe("income");
  });

  test("rejects invalid CSV rows with row-level errors", () => {
    const row = parseCsvTransactionRows("Date,Description,Amount\nnot-a-date,Figma,-12.00\n")[0];

    expect(row).toBeDefined();

    expect(() =>
      csvRowToLedgerDraft({
        teamId: "team_1",
        accountId: "acct_1",
        accountCurrency: "USD",
        mapping: {
          postedAt: "Date",
          description: "Description",
          amount: "Amount",
        },
        row: row!,
      }),
    ).toThrow("CSV row posted date is invalid");
  });
});
