# Dawn Quote-To-Cash PRD

Product: Dawn
Status: Active product source of truth
Date: 2026-06-20
Market: Sweden
Initial language: Swedish
Primary integrations: Fortnox and TIC Identity
Accounting-provider posture: Fortnox-first go-to-market, provider-native architecture

Dawn is a Fortnox-native quote-to-cash CRM for Swedish SMBs.

It helps a small B2B team move from a customer opportunity to a signed commercial agreement and a Fortnox invoice without duplicate entry or manual handoffs.

The product spine is:

```text
Account and contact
  -> Deal
    -> Quote or contract
      -> Trust check
        -> BankID signature through TIC
          -> Fortnox invoice
            -> Payment status and follow-up
```

Dawn owns the sales workflow, document versions, signing evidence, trust checks, operational status, and activity timeline. Fortnox remains the first accounting system of record for customers, articles, invoices, invoice accounting state, and payment state.

The MVP should sell as Fortnox-native, but the architecture must not become Fortnox-locked. Accounting-specific records should be provider-qualified so a later Spiris/eAccounting adapter can prove a second provider without rewriting Dawn-owned CRM, document, signing, trust, or timeline workflows.

## Product Thesis

Swedish SMBs often run quote-to-cash through a loose mix of CRM, spreadsheets, Word or Google Docs, PDF tools, e-signing products, Fortnox, email, and manual reminders. That creates duplicate entry, inconsistent customer data, lost context, and uncertainty after an agreement is signed.

Dawn wins by owning one narrow job:

> Turn an accepted customer opportunity into a signed agreement and a ready Fortnox invoice with a complete evidence trail.

The product should feel like one guided workflow, not a set of disconnected modules.

## Goals

- Reduce the time and manual work between a qualified deal and an issued invoice.
- Give small B2B teams a clear view of deal, document, signature, trust-check, invoice, and payment status.
- Make BankID signing a native commercial workflow step.
- Add identity and company-role checks where they reduce risk or uncertainty.
- Keep Fortnox as accounting source of truth.
- Reuse Dawn's existing app/domain/db architecture, audit trail, outbox, jobs, and idempotency foundation.
- Reach a pilot-ready product without expanding into a generic CRM, finance app, or business OS.

The MVP outcome is:

```text
Connect Fortnox
  -> Import customer and article data
    -> Create deal
      -> Build and send quote
        -> Customer signs with BankID
          -> Dawn creates a Fortnox invoice
            -> Dawn shows payment status
```

## Non-Goals

The MVP will not:

- replace Fortnox accounting
- provide bookkeeping, general ledger, bank aggregation, receipt matching, accountant handoff, project management, or time tracking
- provide a generic custom-object CRM platform
- provide a public developer platform or general automation builder
- provide marketing automation, bulk email, full inbox sync, or OCR parity
- provide advanced AI assistance
- provide QES or claim support for every agreement type
- make an authoritative legal determination about signing authority
- support Spiris/Visma or multi-accounting-provider parity in the first MVP

## Initial ICP

The first customer is a Swedish B2B company that:

- has roughly 3 to 50 employees
- already uses Fortnox
- sells services, subscriptions, or standardised products
- sends at least several quotes or agreements per month
- currently uses email, documents, and one or more disconnected tools
- wants BankID signing
- does not need a deeply customised enterprise CRM
- has an owner, seller, or operations person who also handles commercial administration

Likely early verticals: consultancies, agencies, software companies, staffing firms, small wholesalers, and specialised B2B service providers.

The pilot should avoid complex construction billing, financial products, insurance contracts, regulated lending, and highly customised enterprise CRM workflows.

## Personas

- Owner-manager: wants fewer systems and less administration; cares about getting from verbal yes to signed and invoiced quickly.
- Sales or account manager: creates and sends correct quotes, follows up status, and avoids copying data between tools.
- Finance or operations administrator: owns Fortnox connection, invoice handoff, data correctness, and exception recovery.
- External signer: reviews the offer, understands terms, and signs through a familiar BankID flow.

## Product Principles

- One guided flow: the default path should move the user from deal to invoice.
- Fortnox first, not Fortnox replacement: Dawn complements Fortnox instead of recreating accounting.
- Provider-native under the hood: Dawn owns the commercial workflow; accounting providers are sync and write targets behind explicit adapter capabilities.
- Fixed model before platform flexibility: first-class objects beat generic custom objects until pilot evidence says otherwise.
- Safe automation: automate the common path and stop clearly when data is missing, conflicting, or risky.
- Evidence by default: every material commercial action creates durable audit and timeline evidence.
- Human-readable status: show "Waiting for customer", "Needs review", and "Invoice creation failed", not provider codes.
- Swedish by design: Swedish copy, dates, currency, organisation number handling, and BankID interaction are first-class.

## Source Of Truth Boundaries

### Dawn Owns

- sales accounts and relationships
- contacts and signer relationships
- deals and pipeline stage
- quote and contract drafts
- immutable commercial document versions
- templates and terms versions
- signature requests and status
- TIC signature evidence
- trust checks and review decisions
- activity timeline
- notifications and reminders
- integration mappings
- workflow audit events
- sync exceptions

### Fortnox Owns

- Fortnox customer number
- accounting customer record
- article catalogue
- price lists where used
- invoices
- invoice accounting state
- invoice payment state
- financial document numbering controlled by Fortnox

### Accounting Provider Boundary

Core Dawn code should use accounting-provider language where the concept is not truly Fortnox-specific: integration connection, provider object, accounting customer projection, accounting article projection, accounting invoice projection, external operation, provider raw payload, and provider capabilities. The provider key is `fortnox` in the MVP and may later include `spiris`.

Provider capabilities must be explicit. Dawn must not assume every accounting provider can read, create, update, send, remind, void, register payment, convert order to invoice, or link attachments in the same way. Fortnox-specific scopes, endpoint shapes, raw payloads, and error codes stay inside the Fortnox adapter boundary.

### Shared-Field Policy

Shared data must have explicit ownership. Dawn must not silently overwrite Fortnox values because another source differs.

| Field                             | Primary owner                    | Behaviour                                        |
| --------------------------------- | -------------------------------- | ------------------------------------------------ |
| Organisation number               | Registry or confirmed user input | Primary matching signal                          |
| Legal company name                | Registry or confirmed user input | Show conflicts before Fortnox update             |
| Fortnox customer number           | Fortnox                          | Read-only in Dawn                                |
| Invoice address                   | Fortnox                          | Editable only through explicit sync action       |
| Sales contact                     | Dawn                             | May sync to Fortnox when supported and requested |
| Payment terms                     | Fortnox                          | Imported into quote defaults                     |
| Article and accounting properties | Fortnox                          | Read-only in Dawn                                |
| Quote description and scope       | Dawn                             | Never overwritten by Fortnox                     |
| Invoice status and payment state  | Fortnox                          | Read-only projection in Dawn                     |

A conflict must resolve by keeping the Dawn value, using the Fortnox value, updating Fortnox through explicit user action, or staying unresolved and blocking the dependent workflow. Background sync must not silently choose a business-critical value.

## P0 Scope

### Team And Access

- Existing team, membership, and permission model.
- Owner, Admin, Sales, and Finance roles.
- Team-level Fortnox connection.
- Team-level TIC configuration.
- Explicit trust-review permission.
- Permission protection for sensitive signer identifiers.
- Audit of permission-sensitive actions.

### Fortnox Connection

- OAuth connection and disconnection.
- Connection health status.
- Company information import.
- Initial and incremental customer sync.
- Initial and incremental article sync.
- Optional price sync after technical validation.
- Invoice and payment-status refresh.
- External ID mappings.
- Idempotent invoice creation.
- Manual retry for failed sync operations.

### Focused CRM

- Account list and account page.
- Contacts under accounts.
- Deal list and basic pipeline.
- Create, update, and archive account/contact/deal.
- Assign owner and next action.
- Add notes.
- Search accounts, contacts, and deals.
- Surface potential account duplicates.
- Timeline across customer, deal, document, signature, trust, Fortnox, and payment activity.
- No generic custom objects.

### Commercial Documents

- Create quote or contract from a deal.
- Add Fortnox article lines and free-form lines.
- Quantity, unit, unit price, discount, VAT, and line description.
- Deterministic totals in exact money representations.
- Commercial summary, valid-until date, payment terms, start date, free-text scope, and terms.
- Template selection.
- Recipient and PDF preview.
- Finalise immutable version.
- SHA-256 hash of exact final bytes.
- Secure recipient link.
- View event.
- Decline with optional reason.
- Duplicate or revise existing document.

### TIC BankID Signing

- One external signer in the P0 UI.
- Storage model supports several signers later.
- Signer name, email, and optional personal number.
- TIC signing session starts from the backend.
- BankID displays a concise commercial summary.
- Hidden signed data includes document ID, version, hash, and terms version.
- `sign.completed` webhook handling is verified, deduplicated, and idempotent.
- Complete signature data is fetched or retained server-side.
- XML-DSig and OCSP response are stored where available.
- Signed document hash is verified against the finalised version.
- Downloadable evidence package and verification page.
- Safe retry without duplicate completion.

### Trust Check

- Optional TIC CompanyRoles enrichment for an identified signer.
- Compare signer relationship to account organisation number.
- Store original role descriptions and original `signatureDescription`.
- Result is `pass`, `needs_review`, or `unavailable`.
- AI-generated signing-authority analysis is advisory only.
- A named team member must approve a `needs_review` result when policy blocks invoice creation.
- Evidence and review decision are audited.

### Fortnox Invoice Handoff

- After successful signature, team policy controls automatic invoice creation or manual approval.
- Map customer, currency, payment terms, and lines.
- Store request and response identifiers.
- Prevent duplicate invoices on webhook replay or retry.
- Show Fortnox invoice number, state, and link.
- Surface actionable validation errors.
- Do not book or send the invoice automatically in P0 unless Fortnox implementation and pilot workflow explicitly validate that behaviour.

### Notifications

- Quote sent.
- Quote viewed.
- Signing reminder.
- Signed.
- Declined.
- Trust check needs review.
- Invoice creation succeeded.
- Invoice creation failed.
- Payment state changed.

P0 uses Dawn transactional email. A user's Gmail inbox is not required.

### Operational Dashboard

The home/dashboard view should prioritize:

- deals awaiting a quote
- documents awaiting signature
- trust checks awaiting review
- signed deals not yet invoiced
- integration failures
- overdue or unpaid invoices where Fortnox data is available

## P1 Scope

- Multiple signers.
- Parallel and sequential signing.
- Internal countersignature.
- Fortnox order creation.
- Fortnox offer import or export.
- Reusable product bundles.
- Richer document content blocks.
- Template editor.
- Automated reminder schedules.
- Sales email integration.
- Duplicate account merge.
- Pipeline history and forecasts.
- Contract renewal dates.
- Ongoing company monitoring.
- CRM imports.
- Basic reporting.
- User-defined fields on fixed objects.
- Mobile-focused sales UI.
- Spiris/eAccounting provider-2 spike after the Fortnox quote-to-cash path is proven.

## Parked Product Surfaces

These existing or planned areas remain outside the customer-facing MVP:

- banking connections
- ledger and transaction review
- CSV bank import
- receipt matching
- accountant handoff
- projects and time tracking
- generic assistant
- generic automation builder
- public API and OAuth app platform
- advanced developer portal
- generic CRM object types
- generic CRM metadata editor
- advanced reporting
- Gmail inbox sync
- OCR parity work unrelated to commercial documents

Do not delete these immediately. Hide them behind product-surface flags, remove them from primary navigation, and exclude them from the active roadmap.

## Core User Journeys

### Connect Fortnox

The owner/Admin connects Fortnox through OAuth, Dawn validates state, stores tokens securely, retrieves company information, starts resumable customer and article sync jobs, and shows progress. Partial sync failure must not discard successful imports. Repeated callbacks must not create duplicate connections. Revocation must create an actionable warning.

### Create A Deal

A salesperson searches or creates an account, normalises organisation number, sees possible duplicates, creates a contact, and creates a deal with title, value, owner, and expected close date. The deal belongs to one account, uses explicit currency, and records timeline/audit state.

### Build A Quote

The user creates a quote from a deal, pre-fills Fortnox customer/payment defaults, adds Fortnox article lines or free-form lines, calculates deterministic totals, adds scope/terms/validity, previews recipient and PDF output, finalises exact bytes and hash, chooses signer/trust-check level, and sends the document. A finalised version cannot be edited; revision creates a new version.

### Review And Sign

The recipient opens a secure link, views sender/customer/summary/total/validity/terms and the exact PDF, starts BankID signing, and signs through TIC. Dawn verifies webhook authenticity, validates session and document version/hash, stores evidence, marks the document signed, moves the deal to `won_pending_invoice`, and sends confirmations. Superseded versions cannot be signed.

### Trust Review

When enabled, Dawn requests permitted CompanyRoles enrichment after identity is established, compares signer relationship to account organisation number, stores source data, returns `pass`, `needs_review`, or `unavailable`, and requires a team reviewer to approve or reject ambiguous results before invoice handoff if policy requires it.

### Create Fortnox Invoice

An outbox event requests invoice creation after signature and required trust review. The worker reloads the immutable signed version, resolves the Fortnox customer mapping, maps lines/defaults, creates the invoice, stores external IDs and invoice number, updates document/deal status, and records timeline state. One signed document can create at most one active Fortnox invoice.

### Payment Update

Fortnox event or refresh is verified and deduplicated. Dawn retrieves the latest invoice state, updates the local projection without regressing newer data, records meaningful status changes once, shows last sync time, and lets users request manual refresh.

## Information Architecture

Primary navigation:

1. Home
2. Deals
3. Customers
4. Documents
5. Invoices
6. Settings

Home is an action dashboard for exceptions and next steps.

Deals supports pipeline/list views. Each card should show account, value, owner, stage, next action, quote/contract state, signature state, invoice state, and trust state.

Customers contains accounts and account detail: company summary, Fortnox mapping, contacts, open deals, commercial documents, Fortnox invoices, trust/signer information, and timeline.

Documents is a cross-customer list for drafts, sent documents, awaiting signature, signed, declined, expired, and error states.

Invoices is a read-oriented Fortnox projection with linked deal, linked signed document, invoice number, amount, due date, payment state, sync state, and Fortnox link.

Settings contains team, permissions, Fortnox connection, TIC connection, document defaults, invoice handoff policy, trust-check policy, notifications, retention/privacy, and audit access.

## Functional Requirements

### Identity And Permissions

- Every business record is team-scoped.
- Owner and Admin manage integrations.
- Sales manages accounts, contacts, deals, and documents.
- Finance reviews invoice handoff and sync errors.
- Trust review is an explicit permission.
- Sensitive signer identifiers are permission-protected.
- Audit export is limited to authorised roles.

### CRM

- Account can map to one Fortnox customer per connection.
- Deal stages are fixed in P0 and may become team-configurable later.
- Search covers account name, organisation number, contact, and deal.
- Potential duplicates are surfaced before creating second accounts.
- Full merge is P1.
- Generic custom objects are unsupported in P0.

### Commercial Documents

- Quote or contract is created from a deal.
- Lines can reference Fortnox articles or be free-form.
- Totals use deterministic decimal calculation.
- Recipient and PDF previews show the same commercial values as the final version.
- Finalising creates immutable bytes and SHA-256 hash.
- Revision creates a new version and supersedes the old one.
- Terms have explicit versions.
- Multiple reusable templates are P0; rich template editor is P1.

### Recipient Experience

- Recipient access does not require a Dawn account.
- Link is high-entropy, scoped to one document, and expires by policy.
- Recipient can view summary and exact PDF, decline with reason, start BankID signing, and access a completion receipt.
- Superseded or expired documents cannot be signed.
- Recipient flow must be mobile-usable and accessible.

### Signature

- Signature request references exact document version and hash.
- Visible BankID text includes a concise commercial summary.
- Hidden signed data includes document ID, version, hash, and terms version.
- TIC webhook HMAC is verified against raw body.
- Session data is collected server-side.
- XML-DSig and OCSP response are retained where available.
- Duplicate callbacks and webhooks are idempotent.
- P0 supports one external signer in UI; storage supports multiple signers.
- Verification page can validate evidence package integrity.

### Trust Checks

- Team can enable or disable trust checks.
- CompanyRoles data can be requested for an identified signer.
- Check compares signer relationship to account organisation number.
- Output is `pass`, `needs_review`, or `unavailable`.
- AI interpretation is not an authoritative pass condition.
- Manual review records rationale and reviewer.
- Policy can block invoice handoff pending review.
- Ongoing monitoring is P1.

### Fortnox

- P0 supports one Fortnox company per team.
- Connection requests minimum viable scopes and explains them.
- Customer and article data can be imported and incrementally synced.
- Invoice can be created from signed document.
- Duplicate invoice creation is prevented.
- Invoice state can be refreshed.
- Payment-related state is projected into Dawn.
- Provider errors map to actionable user messages.
- Fortnox order creation and multiple Fortnox companies per team are P1.

### Timeline And Audit

- Material mutations produce audit events.
- Provider webhook receipt is recorded without leaking secrets.
- Timeline shows human-readable business events.
- Duplicate provider delivery creates one business event.
- Evidence package includes relevant business timestamps.
- Support can trace workflow by correlation ID.

## State Models

Deal stages:

```text
new
qualified
proposal_preparation
proposal_sent
negotiation
won_pending_invoice
won
lost
archived
```

Commercial document statuses:

```text
draft
finalised
sent
viewed
signing
signed
declined
expired
superseded
voided
error
```

Rules:

- Only `draft` can be edited.
- `finalised` stores immutable bytes and hash.
- `superseded`, `expired`, `declined`, and `voided` cannot start signing.
- `signed` cannot be reverted by ordinary users.
- Corrections after signing create a new commercial document or formal amendment.

Signature request statuses:

```text
pending
started
complete
cancelled
expired
failed
invalid
```

Trust-check statuses:

```text
not_requested
pending
pass
needs_review
approved
rejected
unavailable
failed
```

Fortnox handoff statuses:

```text
not_requested
blocked
queued
processing
created
failed
cancelled
```

Invoice payment projection:

```text
unknown
unpaid
partially_paid
paid
overdue
credited
cancelled
```

The simplified state must not destroy access to the provider-native Fortnox status.

## Conceptual Data Model

Existing tables should be reused where semantics match. Names below are conceptual, not a mandate to create files exactly this way.

- Account: team-scoped sales relationship, legal/display name, organisation number, VAT number, contact addresses, status, Fortnox customer mapping, version.
- Contact: team/account-scoped person, email/phone/title, role, encrypted personal number where needed, status, version.
- Deal: team/account-scoped sales workflow, owner, title, stage, value/currency, expected close date, next action, lost reason, version.
- CommercialDocument: team/account/deal-scoped quote or contract with status, active version, validity, creator, timestamps.
- CommercialDocumentVersion: immutable snapshot, version number, PDF object key, SHA-256 hash, terms version, subtotal, VAT total, total, currency, finaliser.
- SignatureRequest: provider session, document version, status, state token hash, started/completed/expires timestamps, idempotency key.
- SignatureParty: future-ready signer rows with role, order, contact/name/email, encrypted personal number, status.
- SignatureEvidence: signature value, OCSP response, visible/non-visible signed data, document hash, provider completion timestamp, collection timestamp, verification status, evidence object key.
- TrustCheck: TIC CompanyRoles evidence, source organisation number, role descriptions, signature description, encrypted provider payload, summary, reviewer, decision, rationale.
- ExternalMapping: provider/connection/local/external identity mapping with uniqueness on provider, connection, external type, and external ID.

Constrain one active invoice mapping per signed document workflow.

## Integration Policy

### Fortnox

Fortnox scopes provide read/write access for a resource. Dawn should request only the smallest scope set required for the current workflow and explain access during onboarding.

P0 resources to validate during implementation:

- company information
- customers
- articles
- prices only when required
- invoices
- payments or invoice payment state
- settings needed for payment terms and defaults

Offers and orders remain P1 unless a pilot proves they are essential.

Sync policy:

- Initial backfill runs as resumable jobs.
- Incremental updates use Fortnox realtime events where supported.
- Events are hints that trigger entity retrieval.
- Consumers are idempotent because delivery can repeat.
- Topic offsets are persisted for recovery.
- Manual reconciliation is available.
- Polling may be used as a limited fallback.

Invoice creation command must include team ID, signed document version ID, Fortnox connection ID, stable idempotency key, expected totals, customer mapping, and line snapshot. The worker must reload source data and confirm that the signed version is still valid before calling Fortnox.

### TIC Identity

TIC requests run from the backend. API keys and webhook secrets must never reach the browser.

`userVisibleData` should include document type, agreement or quote number, seller legal name, customer legal name, total/currency, validity or start date, terms version, and a clear statement of what the user signs.

`userNonVisibleData` should be deterministic canonical JSON:

```json
{
  "schemaVersion": 1,
  "teamId": "team_...",
  "documentId": "doc_...",
  "documentVersionId": "docv_...",
  "versionNumber": 3,
  "sha256": "...",
  "termsVersion": "2026.1"
}
```

Webhook handling:

1. Read raw request bytes.
2. Validate HMAC.
3. Validate timestamp and event type.
4. Write a provider webhook receipt.
5. Deduplicate by provider event identity or stable derived key.
6. Return success quickly.
7. Enqueue collection and verification.
8. Collect complete session data server-side.
9. Apply business transition through `packages/app`.
10. Record outbox events and timeline entries.

CompanyRoles enrichment may inform a signer relationship check. Original role data and original `signatureDescription` must be retained for review. AI-generated signing-authority analysis is advisory.

## Event And Job Model

Recommended domain and integration events:

```text
fortnox.connection.created
fortnox.connection.failed
fortnox.customer.synced
fortnox.article.synced
account.created
contact.created
deal.created
deal.stage_changed
commercial_document.created
commercial_document.version_finalised
commercial_document.sent
commercial_document.viewed
commercial_document.declined
signature.requested
signature.completed
signature.invalid
trust_check.requested
trust_check.completed
trust_check.reviewed
fortnox.invoice_creation_requested
fortnox.invoice_created
fortnox.invoice_creation_failed
fortnox.invoice_status_changed
notification.requested
timeline.activity_recorded
```

A provider event is not a domain event. A verified provider event becomes an application command. The application use case validates rules and emits domain/outbox events.

Recommended jobs:

```text
fortnox.initial_sync
fortnox.sync_customer
fortnox.sync_article
fortnox.sync_invoice
fortnox.create_invoice
fortnox.reconcile_connection
tic.collect_signature
tic.verify_signature
tic.request_company_roles
document.render_pdf
document.build_evidence_package
notification.send
signature.send_reminder
```

Every job needs typed payload, stable idempotency identity, max attempt policy, retry classification, dead-letter or failed state, correlation ID, team scope, and user-visible recovery path for business failures.

## Non-Functional Requirements

Security:

- Encrypt Fortnox tokens, TIC keys, webhook secrets, full personal numbers, and signature evidence at rest.
- Redact secrets, tokens, full personal numbers, and signature payloads from logs.
- Verify raw webhook bodies before JSON transformation when required.
- Use short-lived recipient access tokens or signed server sessions.
- Rate-limit public recipient and BankID start endpoints.
- Apply tenant scope in every repository call.
- Record privileged data access in audit logs.
- Complete a threat model before private beta.

Privacy and GDPR:

- Collect personal number only when required for signing or verification.
- Display purpose before collecting identity data.
- Define controller/processor responsibilities for each integration.
- Support access, export, correction, and deletion where legally permitted.
- Separate ordinary CRM retention from signed evidence retention.
- Define production retention policy with legal counsel before launch.
- Prevent sensitive enrichment data from broad exports unless authorised.
- Store a lawful-purpose marker for enrichment requests.

Reliability:

- No provider callback may directly create an invoice without app-level validation.
- Every external mutation is idempotent.
- Provider timeouts have bounded retries.
- Partial failures are visible.
- Sync health is observable by team and provider.
- Evidence generation can be replayed from immutable inputs.
- Provider outage must not corrupt local workflow state.

Performance targets for P0:

- common authenticated page load p95 under 2.5 seconds
- account/deal search p95 under 800 ms for pilot-scale tenants
- commercial document preview p95 under 5 seconds
- provider webhook acknowledgement under 2 seconds
- timeline update after completed signature normally under 30 seconds
- initial sync progress visible within 10 seconds of connection

Accessibility:

- Core authenticated UI targets WCAG 2.2 AA.
- Recipient signing flow is mobile-usable.
- Status does not rely on colour alone.
- Keyboard navigation covers critical actions.
- PDF and recipient HTML preserve readable structure.

Observability:

- Cross-system workflows are traceable by correlation ID, team ID, local entity ID, provider connection ID, provider entity ID, job ID, and idempotency key.
- Operational dashboards show Fortnox failures, sync lag, invoice creation failures, TIC webhook verification failures, signature collection failures, document rendering failures, and email delivery failures.

## Success Metrics

North-star metric: completed quote-to-cash workflows per active team per month.

A completed workflow means:

1. a Dawn commercial document was sent
2. the document was signed
3. a linked Fortnox invoice was created successfully

Activation within 14 days:

- connects Fortnox
- imports or creates one customer
- creates one deal
- sends one commercial document
- receives one successful BankID signature
- creates one linked Fortnox invoice

Quality metrics:

- duplicate invoice incidents: target zero
- signed hash mismatch incidents: target zero
- provider webhook processing success
- invoice creation success without manual intervention
- support cases per completed workflow
- sync freshness
- percentage of trust checks requiring manual review
- false-confidence incidents from trust checks: target zero

Private beta can expand when at least 5 external companies use Dawn, 100 commercial documents have been sent, 50 signatures have completed, 40 linked Fortnox invoices have been created, Dawn has caused no duplicate invoice or unexplained hash mismatch, at least 70 percent of signed workflows create an invoice without support intervention, and 3 pilot companies use Dawn weekly for four consecutive weeks.

## Rollout

### Phase 0: Product Cut And Technical Validation

- Hide non-core surfaces.
- Park generic CRM metadata work.
- Confirm Fortnox OAuth, licences, scopes, and invoice semantics.
- Confirm TIC production agreement, signing API, and enrichment access.
- Define evidence retention and privacy requirements.
- Build provider contract tests.
- Record source-of-truth boundaries in ADRs.

### Phase 1: Internal Alpha

- Fortnox connection.
- Focused CRM.
- Quote builder.
- One external signer.
- Invoice handoff.
- Basic dashboard.
- Manual trust review.
- 20 internal end-to-end workflows.
- Replay tests show no duplicate invoice.
- Basic threat model and support trace view.

### Phase 2: Private Beta

- 5 to 10 design partners.
- Guided onboarding.
- Transactional email.
- Automated reminders.
- Pilot analytics.
- Support tooling.
- Improved sync recovery.

### Phase 3: Paid Beta

- Self-serve onboarding for supported Fortnox configurations.
- Billing.
- Polished templates.
- Multi-user workflows.
- Improved trust review.
- Integration marketplace preparation.

### Phase 4: General Availability

- Production privacy documentation.
- Legal review of signing claims and retention.
- Security review.
- Tested incident procedures.
- Reliable provider reconciliation.
- Customer export/deletion handling.
- Clear support ownership.
- Commercial Fortnox and TIC terms.

## Repo Implementation Plan

Business mutations must remain in `packages/app`:

```text
apps/web
  -> packages/api contracts
    -> packages/app use cases
      -> packages/domain rules
      -> packages/db repositories

apps/server and workers
  -> packages/app use cases
```

Reuse or adapt:

- identity, team, and permissions
- CRM account graph and legal entity concepts
- document storage and signed upload/download
- billing calculations where semantics match
- audit, outbox, jobs, idempotency
- provider webhook handling
- integration connection patterns
- timeline primitives
- sync infrastructure

Likely modules to add or reshape:

```text
packages/domain/src/sales.ts
packages/domain/src/commercial-documents.ts
packages/domain/src/signatures.ts
packages/domain/src/trust.ts
packages/domain/src/fortnox.ts

packages/app/src/sales.ts
packages/app/src/commercial-documents.ts
packages/app/src/signatures.ts
packages/app/src/trust.ts
packages/app/src/fortnox.ts
```

Exact file boundaries should follow the repo's decomposition. Avoid putting all new use cases into one large adapter.

Parked implementation work:

- Stop CRM Slice 4 from blocking quote-to-cash work.
- Keep generic metadata work separate or finish only what is required to leave the repository clean.
- Do not expose custom object types or metadata in the product.
- Do not delete old domains during the first product cut.
- Remove parked areas from navigation and active orchestration plans.
- Add explicit product-surface flags so parked code does not accidentally reappear.

## End-To-End Test Scenarios

The release suite must cover:

1. Connect Fortnox, sync customer, and create deal.
2. Create quote with Fortnox article lines and verify totals.
3. Finalise quote and prove later editing creates a new version.
4. Open secure link and record one view event despite refreshes.
5. Complete TIC signing and verify stored PDF hash.
6. Replay the same TIC webhook and confirm one signature completion.
7. Force signature collection retry and confirm one evidence package.
8. Trigger trust check unavailable and confirm configured blocking behaviour.
9. Approve manual trust review and continue invoice handoff.
10. Create Fortnox invoice and store mapping.
11. Replay invoice job and confirm no duplicate invoice.
12. Receive duplicate Fortnox events and create one status transition.
13. Receive older Fortnox event and preserve newer local projection.
14. Revoke Fortnox connection and show recovery action.
15. Supersede a quote and confirm old recipient link cannot sign.
16. Attempt cross-team access to account, document, signature, and invoice data.
17. Confirm full personal number does not appear in logs.
18. Confirm provider webhook with invalid HMAC is rejected.
19. Confirm PDF, signed summary, and Fortnox invoice totals reconcile.
20. Export a signed evidence package and verify its manifest.

## Risks

- Product remains too broad: hide parked areas and reject features that do not improve quote-to-cash completion.
- Fortnox consent feels too permissive: request minimum scopes, explain each permission, and stage optional capabilities.
- Duplicate invoice from retries: stable idempotency, unique workflow constraint, provider reconciliation, and replay tests.
- Wrong interpretation of firmateckning: show source `signatureDescription`, label AI as advisory, and require manual review when ambiguous.
- Signed document differs from displayed or invoiced data: immutable bytes, SHA-256 hash, canonical hidden data, and reconciliation before invoice creation.
- Sensitive personal data spreads: minimise collection, encrypt identifiers/evidence, redact logs, restrict access, and separate evidence storage.
- Fortnox and Dawn customer data conflict: explicit field ownership and no silent overwrite.
- Provider outage blocks deals: durable jobs, clear status, manual retry, and no corrupt intermediate state.
- MVP becomes a signing-tool clone: keep document features subordinate to deal-to-invoice completion.

## Open Decisions

Resolve during Phase 0:

1. Should P0 always create an invoice, or allow an order-first option for selected pilots?
2. Which Fortnox fields are required to create valid invoices across the initial ICP?
3. Which Fortnox scopes and licences are required for the exact P0 path?
4. Is one Fortnox connection per team enough for the first paid cohort?
5. What document templates are required for the first vertical?
6. Which trust-check policy is the safe default?
7. Should signer personal number be pre-bound or discovered through BankID?
8. What retention period applies to signed evidence and enrichment data?
9. Should recipient receive only signed PDF or full evidence receipt?
10. Which email provider sends transactional messages?
11. Which existing billing tables can be reused without carrying invoice-system assumptions into commercial documents?
12. Does the initial ICP need recurring agreements, or should recurrence remain P1?
13. What is the minimum supported Fortnox licence configuration?
14. What legal copy can Dawn use when describing BankID signatures?
15. What is the commercial model: per team, per user, per signature, or hybrid?

## External Capability Assumptions

These provider assumptions must be revalidated during implementation and before launch:

- Fortnox API scopes for customers, articles, prices, offers, orders, invoices, and payments. Fortnox documents that resource scopes provide both read and write access.
- Fortnox realtime events for relevant resources where available. Events are treated as hints and may require follow-up reads.
- TIC Identity BankID signing with visible signed text and hidden signed data.
- TIC Identity signature completion webhooks, HMAC verification, XML-DSig, and OCSP response handling.
- TIC Identity CompanyRoles enrichment with company roles, company status, firmateckning descriptions, and advisory AI analysis.

Official references:

- [Fortnox API scopes](https://www.fortnox.se/developer/guides-and-good-to-know/scopes)
- [Fortnox Websockets](https://www.fortnox.se/developer/guides-and-good-to-know/websockets)
- [TIC Identity signing API](https://id.tic.io/docs/api/signing)
- [TIC Identity enrichment API](https://id.tic.io/docs/api/enrichment)
- [TIC Identity webhooks](https://id.tic.io/docs/webhooks)

## Final Product Definition

Dawn is not a general business OS.

Dawn is a focused Swedish commercial workflow:

> A Fortnox-native CRM that takes a B2B deal from quote to BankID signature to invoice with company context, safe automation, and a complete evidence trail.

The MVP should be judged by the reliability and speed of that workflow, not by the number of modules in the repository.
