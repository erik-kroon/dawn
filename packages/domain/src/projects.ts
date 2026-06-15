import type { Money } from "./money";
import { assertValidMoney } from "./money";
import type { InvoiceLineDraft } from "./invoices";
import { assertCurrencyCode, assertIsoDate, roundRatio } from "./shared";

export type ProjectStatus = "active" | "archived";

export type BillableStatus = "billable" | "non_billable" | "invoiced";

export type Project = {
  id: string;
  teamId: string;
  customerId: string;
  name: string;
  description?: string | null;
  status: ProjectStatus;
  billableRate: Money;
  createdByActorId: string;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type ProjectMember = {
  id: string;
  teamId: string;
  projectId: string;
  actorId: string;
  role: "manager" | "contributor";
  billableRate?: Money | null;
  createdAt?: string | null;
};

export type TimeEntry = {
  id: string;
  teamId: string;
  projectId: string;
  actorId: string;
  description: string;
  occurredOn: string;
  durationMinutes: number;
  billableStatus: BillableStatus;
  billableRate?: Money | null;
  invoiceId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type ProjectInput = {
  teamId: string;
  customerId: string;
  name: string;
  description?: string | null;
  billableRate: Money;
};

export type TimeEntryInput = {
  teamId: string;
  projectId: string;
  actorId: string;
  description: string;
  occurredOn: string;
  durationMinutes: number;
  billableStatus: Exclude<BillableStatus, "invoiced">;
  billableRate?: Money | null;
};

export type TimeEntryReport = {
  totalMinutes: number;
  billableMinutes: number;
  nonBillableMinutes: number;
  invoicedMinutes: number;
  billableValue: Money;
  utilizationBasisPoints: number;
};

export function assertProjectInput(input: ProjectInput): void {
  if (!input.teamId.trim()) {
    throw new Error("Project team is required");
  }

  if (!input.customerId.trim()) {
    throw new Error("Project customer is required");
  }

  if (!input.name.trim()) {
    throw new Error("Project name is required");
  }

  assertValidMoney(input.billableRate);

  if (input.billableRate.amountMinor < 0) {
    throw new Error("Project billable rate cannot be negative");
  }
}

export function assertTimeEntryInput(input: TimeEntryInput): void {
  if (!input.teamId.trim()) {
    throw new Error("Time entry team is required");
  }

  if (!input.projectId.trim()) {
    throw new Error("Time entry project is required");
  }

  if (!input.actorId.trim()) {
    throw new Error("Time entry actor is required");
  }

  if (!input.description.trim()) {
    throw new Error("Time entry description is required");
  }

  assertIsoDate(input.occurredOn, "Time entry date");

  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes <= 0) {
    throw new Error("Time entry duration must be positive minutes");
  }

  if (input.billableStatus === "billable") {
    if (!input.billableRate) {
      throw new Error("Billable time requires a rate");
    }

    assertValidMoney(input.billableRate);

    if (input.billableRate.amountMinor <= 0) {
      throw new Error("Billable time rate must be positive");
    }
  }
}

export function calculateTimeEntryValue(
  entry: Pick<TimeEntry, "billableRate" | "durationMinutes">,
): Money {
  if (!entry.billableRate) {
    throw new Error("Billable value requires a rate");
  }

  assertValidMoney(entry.billableRate);

  return {
    amountMinor: roundRatio(entry.billableRate.amountMinor, entry.durationMinutes, 60),
    currency: entry.billableRate.currency,
  };
}

export function summarizeTimeEntries(
  entries: readonly TimeEntry[],
  currency: string,
): TimeEntryReport {
  assertCurrencyCode(currency);

  const totalMinutes = entries.reduce((total, entry) => total + entry.durationMinutes, 0);
  const billableEntries = entries.filter(
    (entry) => entry.billableStatus === "billable" || entry.billableStatus === "invoiced",
  );
  const billableMinutes = billableEntries.reduce(
    (total, entry) => total + entry.durationMinutes,
    0,
  );
  const invoicedMinutes = entries
    .filter((entry) => entry.billableStatus === "invoiced")
    .reduce((total, entry) => total + entry.durationMinutes, 0);
  const billableValueMinor = billableEntries.reduce((total, entry) => {
    if (!entry.billableRate) {
      return total;
    }

    if (entry.billableRate.currency !== currency) {
      throw new Error("Time entry report currency must match entry rates");
    }

    return total + calculateTimeEntryValue(entry).amountMinor;
  }, 0);

  return {
    totalMinutes,
    billableMinutes,
    nonBillableMinutes: totalMinutes - billableMinutes,
    invoicedMinutes,
    billableValue: { amountMinor: billableValueMinor, currency },
    utilizationBasisPoints:
      totalMinutes === 0 ? 0 : roundRatio(billableMinutes, 10_000, totalMinutes),
  };
}

export function timeEntryToInvoiceLine(input: {
  project: Project;
  entry: TimeEntry;
}): InvoiceLineDraft {
  if (input.entry.teamId !== input.project.teamId || input.entry.projectId !== input.project.id) {
    throw new Error("Time entry must belong to the project");
  }

  if (input.entry.billableStatus !== "billable") {
    throw new Error("Only uninvoiced billable time can become invoice lines");
  }

  if (!input.entry.billableRate) {
    throw new Error("Billable time requires a rate");
  }

  if (input.entry.billableRate.currency !== input.project.billableRate.currency) {
    throw new Error("Time entry rate currency must match project rate currency");
  }

  return {
    description: `${input.project.name}: ${input.entry.description}`,
    quantityMilli: roundRatio(input.entry.durationMinutes, 1_000, 60),
    unitPrice: input.entry.billableRate,
    discountBasisPoints: 0,
    taxRateBasisPoints: 0,
  };
}
