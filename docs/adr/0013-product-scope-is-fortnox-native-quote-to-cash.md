# 0013: Product Scope Is Fortnox-Native Quote-To-Cash

Status: Accepted
Date: 2026-06-20

## Context

Dawn's repository contains broad Business OS foundations: banking, ledger, inbox, documents, billing, projects/time, public API, automations, assistant, CRM, provider integrations, jobs, audit, and sync. That breadth is useful as infrastructure, but it creates a product execution risk: agents and contributors can keep expanding generic modules instead of proving one sellable workflow.

The active market wedge is Swedish SMB B2B sales teams that already use Fortnox and need a reliable path from qualified deal to quote, BankID signature, Fortnox invoice, and payment-status follow-up.

## Decision

Dawn's active product scope is a Fortnox-native quote-to-cash CRM:

```text
account/contact
  -> deal
    -> quote or contract
      -> TIC BankID signing and trust check
        -> Fortnox invoice
          -> payment status and timeline
```

Dawn owns the sales workflow, commercial document versions, signing evidence, trust checks, integration mappings, timeline, audit, outbox, jobs, and recovery state.

Fortnox remains the accounting source of truth for customers, articles, invoices, invoice accounting state, invoice payment state, and Fortnox-controlled financial numbering.

TIC Identity remains a signing, trust, and enrichment provider. TIC data is evidence and source material, not canonical CRM state.

For the first beta, Dawn will not expose generic CRM custom objects, generic metadata editing, banking ledger workflows, accountant handoff, projects/time, public API/developer platform positioning, generic automations, or AI copilot as product blockers.

## Consequences

- Product work starts from `docs/product/FORTNOX-SALES-OS-PRD.md` and `docs/work/FORTNOX-SALES-OS-VERTICAL-SLICES.md`.
- Older CRM and Business OS plans are not active repository docs; use git history only when historical context is needed.
- Broad existing modules may be reused only when they directly support quote-to-cash.
- Generic CRM metadata work can be finished only as internal foundation or cleanup; no MVP feature should depend on it.
- Fortnox invoice creation is the P0 external write target unless Phase 0 validation changes the decision. Fortnox order creation is P1 by default.
- Provider webhooks and jobs must translate into application commands; provider payloads must not directly mutate canonical business records.
- Primary navigation and onboarding should emphasise Home, Deals, Customers, Documents, Invoices, and Settings.

## Alternatives Considered

- Continue as a broad Business OS: keeps optionality, but delays proof of a sellable workflow and encourages horizontal module expansion.
- Build a generic CRM platform first: useful long term, but custom objects and metadata do not prove quote-to-cash value for the first Swedish Fortnox pilots.
- Build a signing product first: simpler surface, but risks becoming a document/signature tool instead of owning the commercial path to invoice.
- Build accounting/invoicing replacement features: increases scope and liability while Fortnox already owns the accounting system of record for the target customers.
