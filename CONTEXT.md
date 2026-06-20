# Context

Dawn's active product focus is a Fortnox-native quote-to-cash CRM for Swedish SMBs. It should help a seller create or sync an account/contact, manage a deal, build a quote or contract, verify/sign with TIC BankID, create a linked Fortnox invoice, and follow status on the customer/deal timeline.

The broader business-OS codebase remains valuable as reusable infrastructure, but banking ledger, accountant handoff, projects/time, public API, AI copilot, generic automations, and generic CRM metadata are parked product surfaces for the first beta.

Current product source of truth:

- Dawn quote-to-cash PRD: `docs/product/FORTNOX-SALES-OS-PRD.md`
- Dawn quote-to-cash slices: `docs/work/FORTNOX-SALES-OS-VERTICAL-SLICES.md`

Use ADRs for durable architecture decisions. Keep detailed product scope in the Fortnox PRD, not scattered work plans.

## Product Domains

### Identity And Tenancy

Users belong to teams. Teams own business data. Permissions are team-scoped. API keys, OAuth apps, assistant tools, webhooks, jobs, and user sessions must resolve to an actor and team before reading or mutating scoped data.

Better Auth is the identity plane for authentication, sessions, base organizations, invitations, and membership. Dawn maps Better Auth users, organizations, and memberships into its own tenant, principal, membership, and authorization model through explicit auth links; Better Auth organizations and roles are not the CRM domain model or record-level permission system.

### Banking And Ledger

Bank connections import accounts, balances, and transactions. Transactions can be categorized, tagged, matched to documents, reviewed, split, reported on, and synced with external providers. Financial correctness and auditability matter more than convenience.

This is parked as a product surface for the first beta. Reuse its money, audit, idempotency, matching, and provider patterns only where they support quote-to-cash.

### Documents And Inbox

The system ingests uploaded files, forwarded emails, receipts, invoices, statements, and other business artifacts. Files live in object storage. Metadata, extraction results, matches, and review state live in Postgres.

For the active product, documents are quote PDFs, contract PDFs, signed evidence packages, terms versions, customer attachments, and later Fortnox attachments. Receipt matching and inbox parity are parked.

### Matching

Inbox items and documents can be matched to transactions using deterministic signals, provider metadata, user feedback, and AI assistance. Low-confidence matches should be suggested, not silently applied.

### Sales And Billing

Customers, products/services, invoices, invoice lines, payments, recurring schedules, reminders, and invoice events form the billing domain. Sending invoices and recording payments are sensitive state transitions.

For the active product, Fortnox is the economic source of truth for customers, articles, orders, invoices, and payment status. Dawn should store commercial-document snapshots, mappings, provenance, and workflow state rather than becoming the accounting source.

### CRM And Customer Graph

CRM records should distinguish real parties from the tenant's commercial relationship to them. Organizations and people represent external real-world entities; accounts represent a team's or legal entity's relationship with an organization; opportunities, contracts, commercial documents, activities, timeline entries, and AI insights build on those records. Built-in CRM fields should stay strongly typed, while customer-specific fields and relationships use the metadata extension model.

The CRM foundation is now implemented: the record envelope and tracer tables (`organization`, `account`, `opportunity`) live in `packages/db/src/schema/crm.ts`, and the domain types are in `packages/domain/src/crm.ts`.

For the quote-to-cash pilot, keep CRM narrow: accounts, contacts, deals, Fortnox mappings, quotes/contracts, trust checks, signatures, invoices, and timeline. Generic custom object metadata may be kept internally, but no MVP feature should depend on it.

### Work Management

Projects and time entries connect team work to customers and invoices. Billable work can become invoice lines and reporting inputs.

This is parked for the first beta.

### AI And Automations

AI can search, explain, draft, classify, extract, match, and propose actions. AI tools must use the same application use cases and permission checks as normal users. Risky actions require approval unless a user-configured automation explicitly permits them.

AI copilot and user-facing automation builder are parked for the first beta. Internal workflow rules remain useful for signing completion, Fortnox handoff, reminders, and trust-check review.

### Registry Data And Prospecting

External registry providers such as TIC.io can power Swedish company search, enrichment, risk/status signals, annual report observations, role graphs, and prospecting. Registry data lands as external objects, snapshots, observations, links, candidates, provenance, and authority-controlled field promotions. TIC.io or any other registry provider is not CRM source of truth.

## Domain Terms

- Actor: user, API key, OAuth app, provider webhook, system job, or assistant tool acting on the system.
- Team: tenant boundary for business data.
- Auth mapping layer: explicit links from Better Auth users, organizations, and memberships into Dawn user identities, tenants, and tenant memberships.
- Legal entity: a company owned by a team/tenant, separate from external customer organizations.
- Party: a real external person or organization, independent of the commercial relationship.
- Account: the team's or legal entity's commercial relationship to an organization.
- Record: common tenant-scoped identity envelope for ownership, lifecycle, versioning, custom fields, tags, permissions, audit, search, and relations.
- Registry provider: an external data source such as TIC.io used for search, enrichment, observations, prospecting, and monitoring.
- Fortnox: accounting/economic source of truth for Swedish customers, articles, orders, invoices, and payment status in the active product.
- TIC Identity: trust, enrichment, and BankID signing provider used for signer/company checks and signature evidence.
- Deal: sales workflow record that leads to a quote, signing request, and Fortnox invoice. Order creation is P1 unless Phase 0 changes the first Fortnox write target.
- Commercial document: Dawn-owned quote or contract snapshot, not the canonical Fortnox invoice.
- Signature request: provider-backed signing workflow tied to a commercial document version, signer, evidence, and audit trail.
- Trust check: company/signer/risk/enrichment check with evidence and review status.
- Field provenance: source metadata explaining where a field value came from and why it was selected.
- Use case: application-layer command or query that enforces permissions, transactions, idempotency, audit, and outbox behavior.
- Domain event: durable fact emitted by a business state transition.
- Outbox event: database-persisted event used to drive jobs, realtime sync, analytics, notifications, and indexing.
- Provider adapter: isolated integration implementation for banking, accounting, payments, email, storage, messaging, or AI.
- Sync collection: TanStack DB-backed client collection with a server-owned authorization, cursor, and conflict policy.
- Durable Object: Cloudflare coordination primitive for tenant-local realtime, presence, locks, progress, and fanout. It is not the financial database.
- Assistant tool: permissioned AI-callable action backed by an application use case.

## Architectural North Star

Every surface should converge on the same core flow:

1. Resolve actor, team, permissions, request ID, locale, timezone, and idempotency key.
2. Validate command or query input.
3. Call a `packages/app` use case.
4. Enforce permissions and domain invariants.
5. Commit database changes and outbox events in one transaction when state changes.
6. Dispatch side effects through jobs, Durable Objects, provider adapters, and projections.
7. Return typed responses to web, API, workers, assistant, or automations.

## Non-Negotiables

- Authoritative financial state belongs in Postgres.
- Money must not be represented with JavaScript floating point for authoritative calculations.
- Provider raw payloads should be preserved enough for debugging and reconciliation.
- Webhooks must be verified before mutable work.
- Sensitive state changes must be auditable.
- AI-originated actions must be permissioned, explainable, and traceable.
- CRM data must separate real parties, tenant commercial relationships, transactional objects, external source data, and derived projections.
- Better Auth must not replace Dawn's CRM tenant, principal, record access, field security, workflow, integration, export, or AI authorization model.
- Registry provider data must not overwrite CRM values without authority rules and provenance; persondata from registry providers requires legal basis, purpose, retention, and deletion behavior.

## Reference Material

- Dawn quote-to-cash PRD: `docs/product/FORTNOX-SALES-OS-PRD.md`
- Dawn quote-to-cash slices: `docs/work/FORTNOX-SALES-OS-VERTICAL-SLICES.md`
- Midday reference clone: `ref/midday`
