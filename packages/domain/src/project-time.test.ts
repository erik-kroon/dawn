import { describe, expect, test } from "bun:test";

import {
  assertProjectInput,
  assertTimeEntryInput,
  calculateTimeEntryValue,
  summarizeTimeEntries,
  timeEntryToInvoiceLine,
  type Project,
  type TimeEntry,
} from "./index";

const project: Project = {
  id: "project_1",
  teamId: "team_1",
  customerId: "customer_1",
  name: "Website rebuild",
  description: null,
  status: "active",
  billableRate: { amountMinor: 150_00, currency: "USD" },
  createdByActorId: "user_1",
};

const entry: TimeEntry = {
  id: "time_1",
  teamId: "team_1",
  projectId: "project_1",
  actorId: "user_1",
  description: "Design review",
  occurredOn: "2026-06-15T00:00:00.000Z",
  durationMinutes: 90,
  billableStatus: "billable",
  billableRate: { amountMinor: 150_00, currency: "USD" },
};

describe("project time domain", () => {
  test("validates project and time entry input", () => {
    expect(() =>
      assertProjectInput({
        teamId: "team_1",
        customerId: "customer_1",
        name: "Website rebuild",
        billableRate: { amountMinor: 150_00, currency: "USD" },
      }),
    ).not.toThrow();
    expect(() =>
      assertTimeEntryInput({
        teamId: "team_1",
        projectId: "project_1",
        actorId: "user_1",
        description: "Design review",
        occurredOn: "2026-06-15T00:00:00.000Z",
        durationMinutes: 90,
        billableStatus: "billable",
        billableRate: { amountMinor: 150_00, currency: "USD" },
      }),
    ).not.toThrow();
    expect(() =>
      assertTimeEntryInput({
        teamId: entry.teamId,
        projectId: entry.projectId,
        actorId: entry.actorId,
        description: entry.description,
        occurredOn: entry.occurredOn,
        durationMinutes: 0,
        billableStatus: "billable",
        billableRate: entry.billableRate,
      }),
    ).toThrow("Time entry duration must be positive minutes");
  });

  test("calculates billable value and utilization summary", () => {
    expect(calculateTimeEntryValue(entry)).toEqual({
      amountMinor: 225_00,
      currency: "USD",
    });
    expect(
      summarizeTimeEntries(
        [
          entry,
          {
            ...entry,
            id: "time_2",
            durationMinutes: 30,
            billableStatus: "non_billable",
            billableRate: null,
          },
          {
            ...entry,
            id: "time_3",
            durationMinutes: 60,
            billableStatus: "invoiced",
          },
        ],
        "USD",
      ),
    ).toEqual({
      totalMinutes: 180,
      billableMinutes: 150,
      nonBillableMinutes: 30,
      invoicedMinutes: 60,
      billableValue: { amountMinor: 375_00, currency: "USD" },
      utilizationBasisPoints: 8_333,
    });
  });

  test("converts uninvoiced billable time to invoice lines", () => {
    expect(timeEntryToInvoiceLine({ project, entry })).toEqual({
      description: "Website rebuild: Design review",
      quantityMilli: 1_500,
      unitPrice: { amountMinor: 150_00, currency: "USD" },
      discountBasisPoints: 0,
      taxRateBasisPoints: 0,
    });
    expect(() =>
      timeEntryToInvoiceLine({
        project,
        entry: { ...entry, billableStatus: "non_billable" },
      }),
    ).toThrow("Only uninvoiced billable time can become invoice lines");
  });
});
