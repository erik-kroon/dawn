# Dawn Unified Vertical Slices

Triage: ready-for-agent
Publication: Local repo artifact. No project issue tracker or remote is assumed.
Status: Active unified execution plan
Date: 2026-06-20

This is the single working plan for Dawn's product cut from broad Business OS toward a Fortnox-native quote-to-cash CRM, then toward the north-star AI-native CRM and autonomous revenue engine.

The immediate build path is still the Fortnox quote-to-cash spine, but it now includes a narrow market/registry-origin bridge before signing. Dawn should prove that a Swedish company can enter from market context, become a prospect/account/deal, and carry lineage into a commercial document before BankID signing and invoice handoff are built on top.

## Outcome

The first milestone is one sellable workflow:

```text
Fortnox-connected account/contact
  -> deal
    -> quote or contract
      -> TIC BankID signing and trust check
        -> Fortnox invoice
          -> payment status and timeline follow-up
```

The private beta is not judged by module count. It is judged by whether a pilot team can connect Fortnox, import data, create a deal, send a commercial document, get one external signer through BankID, create one linked Fortnox invoice without duplicates, and understand status from the timeline.

The north-star milestone extends that workflow into a market-to-revenue loop:

```text
Goal or ICP seed
  -> Swedish company discovery
    -> AI-authored company and workspace intelligence
      -> prospect and account strategy
        -> governed agent run
          -> outreach and conversation handling
            -> deal, proposal, signing, invoice and payment
              -> outcome attribution and learning
```

Current implementation checkpoint: quote-to-cash slices 0 through 3 are the implemented foundation. Treat slice 3.5 as the next executable backlog item, then continue with TIC signing, the recipient signing surface, signer trust, invoice handoff and pilot surface.

## Accounting Provider Posture

Dawn is Fortnox-native for the first go-to-market motion and provider-native in the architecture. The core commercial model owns accounts, contacts, deals, commercial documents, signature requests, trust checks, timeline, audit, and outcome learning. Accounting providers own provider-qualified projections and write targets: accounting customers, articles, invoices, orders, payment status, attachments, and raw provider state.

Do not build a Visma/Spiris integration before the Fortnox quote-to-cash path is usable. Do keep shared naming and data boundaries generic enough that a later Spiris/eAccounting adapter can be added through the provider port without rewriting CRM, document, signing, invoice-handoff orchestration, or timeline code.

The accounting layer should model:

- provider identity: `fortnox` first, `spiris`/Visma-ready later
- connection health: healthy, needs reauth, limited, failed
- provider capabilities: customer/article/order/invoice/payment/attachment read/write/send/reminder support
- external mappings and projections by provider and connection, never provider IDs as Dawn canonical IDs
- provider-specific raw state stored behind generic accounting connection/object names

Visma/Spiris is strategically important because it is a large Swedish SMB accounting base and its API/MCP direction validates AI-tool-first accounting workflows. Do not build Spiris in P0. Design Fortnox work so a later spike can prove:

```text
Spiris OAuth connect
  -> read customers
  -> read articles
  -> create one sandbox invoice
```

This means internal names should prefer `AccountingConnection`, `AccountingExternalMapping`, `AccountingCustomerProjection`, and `AccountingInvoiceProjection` over new Fortnox-only generic names. Fortnox adapter files and public product copy may still say Fortnox.

## Signing Surface Posture

BankID signing should have its own focused public recipient surface, but not a separate product or backend service.

Target shape:

```text
apps/web      = Dawn CRM, prospecting and quote-to-cash
apps/sign     = public recipient signing surface
packages/sign = signing domain/app glue and evidence UI helpers where useful
```

The recipient app should have no CRM shell, no sidebar and no Dawn user authentication. It should be mobile-first, high-trust, fast-loading and token-based.

Backend and business logic stay shared:

```text
apps/sign
  -> packages/api recipient/signing routes
    -> packages/app signing and commercial-document use cases
      -> packages/domain rules
      -> packages/db
      -> TIC adapter
```

Do not create a separate signing service, database, auth system or evidence store. The signing surface is an entry point into Dawn's quote-to-cash and market-to-revenue loop, not a standalone Scrive/GetAccept/Oneflow competitor.

## Source Of Truth

- Active beta PRD: `docs/product/FORTNOX-SALES-OS-PRD.md`
- North-star PRD: `docs/product/DAWN-AI-NATIVE-CRM-NORTH-STAR-PRD.md`
- Domain language: `CONTEXT.md`
- Code map: `CONTEXT-MAP.md`
- Architecture decisions: `docs/adr/`
- Reference repos: `ref/`

Broad CRM/backend plans and the north-star slice draft have been mined into this file. Treat this document as the single execution plan for new Dawn product work.

## Current Repo Assets To Reuse

- App/domain/use-case architecture in `packages/app` and `packages/domain`.
- Audit, outbox, idempotency, job, and request-context behavior.
- CRM record envelope, organizations, legal entities, accounts, opportunities, and CRM permissions.
- CRM request intake and access policy helpers in `packages/app/src/index.ts`, `packages/domain/src/crm-permissions.ts`, and `packages/app/src/crm.ts`.
- Document storage, document versioning, signed upload/download, and PDF/document primitives.
- Billing/invoice money math and line-total behavior where semantics match.
- Provider adapter and integration connection patterns in `packages/integrations` and `packages/app/src/integrations.ts`.
- Worker runtime and queue contracts in `apps/server/src/worker-runtime.ts` and `packages/jobs`.
- Timeline/audit/event patterns already present in the broad system.

## Reference Mining Ledger

Reference repos reduce guesswork, but they are not requirements. Dawn's source-of-truth requirements are this slice plan, the PRD, context docs, ADRs, and existing app/domain/db boundaries.

Use this format when adding new references to a slice:

```text
Reference: ref/<repo>/<path>
Use: mine | adapt | avoid | optional
Reason: <one sentence>
Boundary: <Dawn rule that still controls the implementation>
```

### NextCRM

Reference: `ref/nextcrm-app/public/SKILL.md`  
Use: mine  
Reason: Its MCP inventory shows useful AI-callable product boundaries for accounts, contacts, opportunities, activities, documents, products, contracts, enrichment, and reports.  
Boundary: Dawn should expose agent tools only after the matching app use cases, CRM permissions, idempotency, audit, and approval behavior exist.

Reference: `ref/nextcrm-app/lib/authz/scopes/crm.ts`  
Use: adapt  
Reason: Linked-entity read scopes are useful for account/contact/opportunity/document visibility and activity dispatch.  
Boundary: Dawn already has team capabilities, CRM record grants, field security, and `ResolvedAppRequest`; do not copy route-local Prisma authorization.

Reference: `ref/nextcrm-app/lib/invoices/totals.ts` and `ref/nextcrm-app/lib/invoices/numbering.ts`  
Use: adapt  
Reason: Line totals, VAT buckets, discounts, and transactionally consumed number-series behavior are the right shape for quote/document issuance.  
Boundary: Dawn authoritative money should use exact minor units/decimal domain helpers, with issuance behind app use cases and outbox jobs.

### Midday

Reference: `ref/midday/packages/invoice/src/types.ts`, `ref/midday/packages/invoice/src/utils/calculate.ts`, `ref/midday/packages/invoice/src/templates/*`  
Use: mine  
Reason: Its invoice model captures practical document surface area: draft/scheduled/unpaid/overdue/paid/canceled/refunded statuses, line item product references, template snapshots, public token, viewed timestamp, sent recipient, notes, payment details, logo, and rendering targets.  
Boundary: Dawn commercial documents are Dawn-owned quote/contract snapshots; Fortnox owns canonical invoice state. Avoid JSON-heavy canonical invoice storage.

Reference: `ref/midday/apps/worker/src/processors/invoices/generate-invoice.ts`, `send-invoice-email.ts`, `upcoming-notification.ts`, and `packages/jobs/src/tasks/invoice/operations/check-status.ts`  
Use: adapt  
Reason: Good worker split for render/upload, send, status refresh, upcoming reminders, batching, and duplicate-notification prevention.  
Boundary: Dawn should drive these through transactional outbox/job contracts and provider projections, not direct worker writes to canonical business records.

Reference: `ref/midday/docs/invoice-recurring.md`  
Use: optional later  
Reason: Recurring-series state, sequence numbers, timezone-aware schedules, failure counters, auto-pause, and upcoming notifications are valuable once contracts/subscriptions need recurring commercial documents.  
Boundary: Recurring billing is P1; do not let it block first quote-to-Fortnox-invoice handoff.

Reference: `ref/midday/apps/api/src/rest/routers/apps/fortnox/*`  
Use: mine  
Reason: OAuth source-aware redirects, encrypted state, provider lookup, company info import, and user-friendly error redirects match the Fortnox connect surface.  
Boundary: Dawn already has a provider adapter port, encrypted token codec, idempotent callback replay, and app use cases; keep provider code behind those boundaries.

### Atomic CRM

Reference: `ref/atomic-crm/src/components/atomic-crm/deals/*`  
Use: adapt  
Reason: Simple deal columns, stable stage configuration, stage fallback, per-stage ordering, expected close dates, and "only mine" filtering are enough for the first pipeline UI.  
Boundary: Dawn deal stages must be fixed domain values for P0 and validated in app/domain code.

Reference: `ref/atomic-crm/src/components/atomic-crm/activity/*` and `providers/commons/activity.ts`  
Use: adapt  
Reason: Account/company/deal/contact notes and creation events become a simple chronological timeline.  
Boundary: Dawn should generate timeline projections from audit/domain/outbox events, not aggregate many UI queries as source of truth.

Reference: `ref/atomic-crm/supabase/functions/merge_contacts` and merge-contact docs  
Use: optional later  
Reason: Merge behavior is useful when duplicate account/contact handling becomes productized.  
Boundary: P0 should show duplicate suggestions before create; merging can wait.

### Erxes

Reference: `ref/erxes/docs/customersAdd-mutation.md`  
Use: mine  
Reason: Contact/customer creation documents duplicate checks, contact state auto-upgrade, profile completeness scoring, validation status, side effects, and activity logging.  
Boundary: Dawn should keep organization, person/contact, account relationship, and Fortnox customer mapping separate; no single customer state field on the organization.

### Open Mercato

Reference: `ref/open-mercato/apps/mercato/src/modules/example_customers_sync/lib/mappings.ts` and `lib/sync.ts`  
Use: adapt  
Reason: External mapping upsert, raw/canonical value preservation, sync status, last error, source update time, duplicate-key recovery, and reconcile jobs are useful for Fortnox/Spiris projections.  
Boundary: Dawn's provider objects and mappings must remain provider-agnostic and tenant/team scoped, with idempotent app commands and audit/outbox events.

### ERPJS

Reference: `ref/erpjs/apps/api/src/model/lib/sales.invoice*.ts`  
Use: mine  
Reason: Invoice header, line, VAT report, accounting-currency totals, payment terms, bank account, reverse charge, print status, and factoring provider fields are useful accounting edge reminders.  
Boundary: Dawn P0 only needs signed-document-to-Fortnox-invoice handoff; deeper accounting fields stay provider projections or future invoice hardening.

## Parked Scope

These are not product blockers for the first pilot:

- generic CRM custom object platform
- user-visible CRM metadata editor
- banking ledger dashboard and CSV/accountant workflows
- project/time product
- assistant/copilot product
- public API/OAuth/developer platform
- generic automation builder
- standalone e-sign product with arbitrary PDF upload, signing-order management, independent templates, API and admin console
- Gmail inbox/OCR parity as a primary product wedge
- advanced reporting
- full Spiris/Visma support or multi-accounting-provider parity

CRM metadata Slice 4 from the older CRM plan may be finished only as internal foundation if it is already near complete or needed to leave the worktree clean. No MVP feature should depend on it.

## Horizontal Temptations To Avoid

- Do not build a full Fortnox SDK before one sync/write path needs it.
- Do not build every TIC enrichment feature before the narrow market-origin bridge and signing prove useful.
- Do not rename every existing invoice/customer concept before one quote-to-cash path works.
- Do not expose generic automation, custom objects, or public API positioning.
- Do not let Fortnox or TIC external IDs become canonical Dawn IDs.
- Do not let provider webhooks mutate canonical records outside app use cases.
- Do not hard-code Fortnox vocabulary into shared mapping/projection names when the concept is accounting-provider generic.
- Do not start a provider-platform project; prove Fortnox first and keep Spiris/Visma as a later provider-2 spike.
- Do not split backend, UI, and tests into separate slices unless each proves standalone value.
- Do not make Fortnox order creation a P0 blocker; invoice creation is the P0 write target unless Phase 0 changes the decision.
- Do not build a broad Swedish company mirror before one market-to-revenue path needs it.
- Do not build an agent runtime dashboard before one governed run can create useful product state.
- Do not expose AI-authored fields as loose notes if they need to be queryable product state.
- Do not make autonomous sending the default before sender policy, suppression, evaluation and stop-condition gates exist.
- Do not make chat the primary product surface. Natural language is a command surface over structured goals, runs, companies, accounts, deals and outcomes.
- Do not build signing as a quote-only lane that cannot carry market-origin, company snapshot, prospect or ICP lineage.
- Do not turn `apps/sign` into a separate backend service, separate database or standalone e-sign product before Dawn's CRM-to-revenue loop proves demand.

## Ordered Slices

The order intentionally has two horizons plus one parked provider proof:

1. Quote-to-cash spine with market-origin bridge: slices 0 through 7 plus slices 3.5 and 4.5.
2. AI-native market-to-revenue expansion: slices 8 through 19.

The Spiris/Visma provider-2 spike stays parked as slice 20 until Fortnox invoice handoff has real product signal.

## Phase 1: Quote-To-Cash Spine With Market-Origin Bridge

### 0. Product Cut And Source-Of-Truth Contract

Status: completed

#### Goal

Make Dawn present and execute as one Fortnox-native quote-to-cash CRM, while preserving broad Business OS code as reusable infrastructure or parked surface.

#### Scope

- Promote the quote-to-cash PRD as the active product source of truth.
- Update repo entrypoints so agents start from the quote-to-cash roadmap.
- Add or update an ADR that records the product-scope cut.
- Hide or feature-flag parked product surfaces from primary navigation.
- Gate parked routes behind `VITE_ENABLE_PARKED_SURFACES` for internal access.
- Make Home, Deals, Customers, Documents, Invoices, and Settings the target navigation model.
- Document which existing code stays reusable versus parked.

#### Areas To Inspect

- `docs/product/FORTNOX-SALES-OS-PRD.md`
- `docs/work/FORTNOX-SALES-OS-VERTICAL-SLICES.md`
- `README.md`
- `CONTEXT.md`
- `CONTEXT-MAP.md`
- `AGENTS.md`
- `docs/adr/`
- `apps/web/src/routes`

#### Acceptance Criteria

- [x] Product PRD exists for the quote-to-cash direction.
- [x] Vertical slice plan exists for the quote-to-cash direction.
- [x] Source-of-truth ADR records the product cut.
- [x] `README.md`, `CONTEXT.md`, `CONTEXT-MAP.md`, and `AGENTS.md` point agents at the new priority.
- [x] Existing broad plans are not deleted; they are demoted to historical or parked context.
- [x] Parked routes are hidden or feature-flagged from normal users.

#### Verification

- Read the product PRD and this slice plan.
- Check context docs for stale "generic CRM", "business OS", or "order creation as P0" language.
- Manually inspect primary navigation after UI work lands.

#### Dependencies

- None.

### 1. Fortnox Foundation

Status: in-progress

#### Goal

A team can connect one Fortnox company and import the customer/article data needed to build quotes.

#### Scope

- Add Fortnox provider contract and adapter boundary.
- Keep the accounting provider contract capability-based so Fortnox-specific fields stay in provider payloads and shared app/domain concepts stay provider-agnostic.
- Add OAuth connection start/callback/disconnect.
- Store encrypted tokens and connection health state.
- Import company information.
- Add or extend external mapping records for Fortnox customers and articles.
- Run resumable initial customer and article sync jobs.
- Add incremental sync hooks or polling fallback for customers, articles, invoices, and payment-related updates.
- Preserve raw payload/provenance enough for support and replay.
- Use app request context, permissions, audit, idempotency, outbox, and worker jobs.

#### Progress Landed

- Added `fortnox` as an accounting integration provider behind the existing provider port.
- Added Fortnox identifier and Swedish organisation-number normalisation helpers in `packages/domain`.
- Added Fortnox OAuth start/callback use cases with signed state validation and idempotent callback replay.
- Fortnox mock connect returns encrypted token metadata, company payload, health payload, and OAuth-state provenance.
- Fortnox mock adapter builds an Authorization Code URL using Fortnox's documented auth endpoint, offline access, and service-account option.
- Added Fortnox AES-GCM token codec and token-aware sync path so provider syncs receive encrypted connection secrets through the app repository boundary.
- Added Fortnox token refresh handling in the adapter contract; sync can return a refreshed token and updated raw connection payload for persistence.
- Added Fortnox connection-health normalization for missing OAuth scopes, missing licence/scope access, and expiring tokens.
- Added cursor-aware Fortnox sync contract with `partial` sync-run status, recovery cursor metadata, and persisted successful provider objects before recovery.
- Added credential-backed Fortnox HTTP adapter for Authorization Code token exchange, refresh-token rotation, bearer-auth API requests, and page-cursor company/customer/article sync.
- Added runtime provider configuration: missing `FORTNOX_CLIENT_ID`/`FORTNOX_CLIENT_SECRET` keeps local/test on mocks; setting both switches API and worker Fortnox paths to the real adapter.
- Fortnox disconnect calls the provider revoke boundary before disabling the Dawn integration connection.
- Fortnox sync emits company, customer, and article external objects with raw provider payloads.
- Fortnox sync now polls invoice and invoice-payment projections as provider objects with cursor recovery, keeping payment status as Fortnox-owned raw provider state.
- `syncIntegration` now persists provider external objects through `provider_object` without making Fortnox IDs canonical Dawn IDs.
- Added `listFortnoxCatalog` app use case and `integrations.fortnoxCatalog` API route for connected company/customer/article projections.
- Added `fortnox.sync` queue contract; `integration.connected` for Fortnox queues initial sync.
- Worker registry handles `fortnox.sync` through the app `syncIntegration` use case with system-job context.

#### Areas To Inspect

- `packages/app/src/integrations.ts`
- `packages/integrations/src/index.ts`
- `packages/db/src/schema/core.ts`
- `packages/db/src/repositories/integrations.ts`
- `apps/server/src/worker-runtime.ts`
- `packages/jobs/src/index.ts`
- `docs/adr/0009-provider-adapters-are-isolated-behind-ports.md`
- Reference mining: `ref/midday/apps/api/src/rest/routers/apps/fortnox/*`, `ref/open-mercato/apps/mercato/src/modules/example_customers_sync/lib/mappings.ts`

#### Acceptance Criteria

- [x] Owner/Admin can start and complete Fortnox OAuth.
- [x] OAuth state is validated.
- [x] Tokens are encrypted at rest in the provider/integration connection contract.
- [x] The connected Fortnox company is visible through the Fortnox catalog read model.
- [x] Customer and article sync is resumable and idempotent.
- [x] Real Fortnox OAuth token exchange and refresh-token rotation are implemented behind the provider port.
- [x] Real Fortnox company/customer/article sync uses provider-backed pagination cursors.
- [x] Invoice/payment polling fallback persists provider-qualified projections without making Fortnox IDs canonical.
- [x] Replaying callback or sync does not duplicate connection/mappings.
- [x] Partial sync failure keeps successful imports and surfaces recovery.
- [x] External Fortnox IDs are stored as mappings/provenance, not canonical IDs.
- [x] Provider connection/object storage is generic enough that a later Spiris spike does not require changing Dawn canonical CRM records.
- [x] Connection can be revoked by an authorised user.
- [x] Connection health and missing licence/scope warnings are actionable.

#### Verification

- [x] Domain tests for Fortnox identifier normalisation and mapping rules.
- [x] App tests for connect/sync idempotency, mapping behaviour, token refresh, and health warning persistence.
- [x] Adapter contract tests with mock Fortnox OAuth, encrypted token, refresh, health, and sync payloads.
- [x] API tests for OAuth connection, sync, catalog, and disconnect endpoints.
- [x] Worker/job tests for initial sync job mapping and handler registration.
- [x] HTTP adapter contract tests for Fortnox authorization-code exchange, refresh, bearer API calls, and catalog resume cursors.
- [x] Adapter, app, and API tests cover Fortnox invoice/payment polling projections and cursor resume.

Remaining verification before this slice is complete:

- Live Fortnox sandbox/staging smoke with real credentials for OAuth, customer/article/invoice/payment polling, and disconnect.

#### Dependencies

- Slice 0.

### 2. Minimal Sales CRM

Status: in-progress

#### Goal

A seller can manage the account/contact/deal records needed for quote-to-cash without generic custom metadata.

#### Progress Landed

- CRM request context resolves actor, team, principal, session metadata, correlation ID, locale/timezone, and idempotency key.
- CRM permissions cover organization, legal entity, account, and opportunity read/write actions.
- Record grants can expose selected CRM records without full team-wide CRM read capability.
- Field security can redact selected fields and reject selected writes.
- Unauthorized CRM reads are masked as `NOT_FOUND`.
- API keys and other non-user actors use explicit actor permissions and effective principal IDs.
- Legal entities and account roles are implemented as CRM record-envelope objects.
- Account list queries can filter by legal entity, relationship status, and account type.
- Account contacts now use the CRM record envelope with separate `person` identity and `contact` account relationship records.
- Sales users can create account contacts through app/API use cases with CRM permissions, idempotency, audit, outbox, and account-summary read-back.
- Accounts can be linked to synced Fortnox customer projections through provider-object mappings without adding Fortnox IDs to canonical CRM records.
- Organization and legal-entity organization numbers are normalized for Swedish matching before persistence.
- Account duplicate suggestions can search by normalized organization number and case-insensitive legal name before a seller creates another account.
- Account timeline reads now project CRM audit events for account creation, contact creation, Fortnox customer linking, deal creation, and deal-stage updates through CRM record permissions and field redaction.
- Opportunities now carry fixed P0 deal stages:
  `new`, `qualified`, `proposal_preparation`, `proposal_sent`, `negotiation`, `won_pending_invoice`, `won`, `lost`, and `archived`.
- Deal stage transitions are validated in domain/app code and exposed through a protected API route with idempotency, optimistic record versioning, audit, and outbox events.
- Deal stage is persisted as a typed workflow field while coarse `open`/`won`/`lost` status remains available for existing summaries and filters.
- Account, contact, and deal archive commands now use the CRM record lifecycle envelope with optimistic versioning, idempotency replay, audit/outbox events, and account timeline projection.
- Account, contact, and deal update commands now use optimistic CRM record versions, CRM field write policies, idempotency replay, audit/outbox events, and account timeline projection.

Verified locally on 2026-06-20:

```text
bun test packages/domain/src/crm-metadata.test.ts packages/domain/src/permissions.test.ts packages/app/src/team-permissions.test.ts packages/app/src/crm.test.ts packages/api/src/router.test.ts
```

Result: 103 pass, 0 fail.

Verified duplicate suggestion increment locally on 2026-06-20:

```text
bun test packages/app/src/crm.test.ts packages/api/src/router.test.ts
```

Result: 68 pass, 0 fail.

Verified account timeline increment locally on 2026-06-20:

```text
bun test packages/app/src/crm.test.ts packages/api/src/router.test.ts
```

Result: 69 pass, 0 fail.

Verified archive increment locally on 2026-06-20:

```text
bun test packages/app/src/crm.test.ts packages/api/src/router.test.ts
```

Result: 70 pass, 0 fail.

Verified update increment locally on 2026-06-20:

```text
bun test packages/app/src/crm.test.ts packages/api/src/router.test.ts
```

Result: 74 pass, 0 fail.

#### Scope

- Keep organization/legal entity/account separation.
- Add or adapt contact/person support under accounts.
- Add `Deal` semantics if current opportunity naming is insufficient for the sales flow.
- Add fixed P0 deal stages:

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

- Add account-to-Fortnox-customer mapping.
- Add account/deal timeline entries for CRM actions and Fortnox mapping.
- Add duplicate suggestions by organisation number and name.
- Add owner, next action, expected close date, value, and currency.

#### Areas To Inspect

- `packages/domain/src/crm.ts`
- `packages/app/src/crm.ts`
- `packages/db/src/schema/crm.ts`
- `packages/db/src/dawn-repository.ts`
- `packages/api/src/routers/index.ts`
- `packages/domain/src/identity.ts`
- Reference mining: `ref/atomic-crm/src/components/atomic-crm/deals/*`, `ref/atomic-crm/src/components/atomic-crm/activity/*`, `ref/erxes/docs/customersAdd-mutation.md`, `ref/nextcrm-app/lib/authz/scopes/crm.ts`

#### Acceptance Criteria

- [x] Sales user can create/update/archive account, contact, and deal.
- [x] Deal belongs to exactly one account.
- [x] Deal value and currency are explicit.
- [x] Organisation number is normalised before matching.
- [x] Potential duplicates are shown before creating a second account.
- [x] Account can attach to one Fortnox customer per connection.
- [x] Organization identity remains separate from account/customer relationship.
- [x] Deal stage transitions are validated in domain/app code.
- [x] Timeline records account, contact, deal, and Fortnox mapping events.
- [x] Current CRM mutations use CRM permissions, audit, outbox, and idempotency.
- [x] New account/contact/deal/timeline/Fortnox-mapping mutations use the same CRM permissions, audit, outbox, and idempotency behavior.

#### Verification

- [x] Domain tests for fixed deal-stage normalization and transition rules.
- [x] Domain tests for fixed deal-stage normalization, contact person identity normalization, and transition rules.
- [x] App tests for account/contact/deal invariants, team isolation, permission denial, idempotency, contact summary read-back, and deal-stage transitions.
- [x] API tests for account/contact/deal create, contact summary read-back, and deal-stage transition behaviour.
- [x] Domain/app/API tests for contact support.
- [x] App/API tests for Fortnox customer mapping.
- [x] App/API tests for duplicate suggestions.
- [x] App/API tests for account/contact/deal update and archive flows.
- [x] Timeline projection tests for account/contact/deal/Fortnox mapping events.

#### Dependencies

- Slices 0 and 1.

### 3. Commercial Document And Quote Builder

Status: in-progress

#### Goal

A seller can build, preview, finalise, send, revise, and decline a quote tied to a deal.

#### Progress Landed

- Added a Dawn-owned commercial document domain model for quotes/contracts, separate from Fortnox invoice projections and the older internal invoice module.
- Added deterministic quote line totals with exact minor-unit money, line discounts, and VAT breakdowns.
- Added Fortnox article-backed quote lines that snapshot provider-object payloads so later Fortnox catalog changes do not mutate the commercial document.
- Added canonical immutable commercial document version payloads for stable hashing/signing context.
- Added app use cases for quote draft creation from a CRM deal, draft update, deterministic PDF preview, finalisation, send, recipient view, and recipient decline.
- Added persistence tables and Drizzle repository methods for commercial documents, lines, and immutable versions.
- Finalisation writes an immutable version record with PDF object key, byte size, stored final PDF bytes, and SHA-256 of the exact generated bytes.
- Protected and recipient PDF reads reconstruct the exact finalised bytes from the immutable version and verify the stored SHA-256 before returning them.
- Send creates a high-entropy recipient token, stores only the token hash, scopes it to the active version, and records expiry.
- Create/update/finalise/send use team permissions, idempotency, audit, and outbox events; recipient view/decline write audit and outbox events.
- Revision now supersedes the active finalised version, clears recipient access state, reopens the document as a draft, and finalises the next version number on replay-safe commands.
- Added protected API routes for create, update draft, preview PDF, finalise, get PDF, revise, and send.
- Added public recipient API routes for view and decline.
- Account timeline now projects commercial document created/updated/finalised/sent/viewed/declined/revised audit events through metadata-filtered audit queries, while preserving CRM opportunity visibility and redacted opportunity details.
- Finalisation now claims the draft row before inserting an immutable version, so a losing concurrent finalise cannot create an orphan version or consume a duplicate document version number; failed finalise claims are mapped to app-level `CONFLICT` and are not saved as idempotent results.

Verified quote-builder foundation and API lifecycle locally on 2026-06-20:

```text
bun test packages/domain/src/commercial-documents.test.ts packages/app/src/commercial-documents.test.ts packages/api/src/router.test.ts
bun test packages/app/src/crm.test.ts packages/app/src/commercial-documents.test.ts packages/api/src/router.test.ts
bun run check-types
bunx oxfmt --check packages/domain/src/commercial-documents.ts packages/domain/src/commercial-documents.test.ts packages/app/src/commercial-documents.ts packages/app/src/commercial-documents.test.ts packages/db/src/schema/crm.ts packages/db/src/dawn-repository.ts packages/api/src/routers/index.ts packages/api/src/router.test.ts
bunx oxlint packages/domain/src/commercial-documents.ts packages/domain/src/commercial-documents.test.ts packages/app/src/commercial-documents.ts packages/app/src/commercial-documents.test.ts packages/db/src/schema/crm.ts packages/db/src/dawn-repository.ts packages/api/src/routers/index.ts packages/api/src/router.test.ts
```

Result: 80 focused CRM/commercial-document/API tests pass, monorepo typecheck/build is clean, and touched TypeScript files pass format/lint checks.

#### Scope

- Add Dawn-owned `CommercialDocument` for `quote` and `contract`; implement quote first.
- Add draft line model with Fortnox article references and free-form lines.
- Snapshot line display names, descriptions, prices, VAT, discounts, currency, payment terms, and terms version.
- Calculate subtotal, VAT total, discount, and grand total with exact money/decimal rules.
- Generate recipient preview and PDF preview from the same commercial values.
- Finalise immutable document version with exact PDF bytes and SHA-256 hash.
- Add secure recipient link, view event, decline event, expiry, supersede, and revise behaviour.
- Add terms version and template selection; rich template editor stays P1.

#### Areas To Inspect

- `packages/domain/src/invoices.ts`
- `packages/domain/src/money.ts`
- `packages/app/src/billing.ts`
- `packages/app/src/documents-inbox.ts`
- `packages/db/src/schema/core.ts`
- `packages/documents/src/index.ts`
- `packages/app/src/crm.ts`
- Reference mining: `ref/midday/packages/invoice/src/types.ts`, `ref/midday/packages/invoice/src/utils/calculate.ts`, `ref/nextcrm-app/lib/invoices/totals.ts`, `ref/nextcrm-app/lib/invoices/numbering.ts`

#### Acceptance Criteria

- [x] A deal can produce one or more commercial documents.
- [x] Quote lines can reference synced Fortnox articles or free-form content.
- [x] Referenced articles are snapshotted so later Fortnox changes do not mutate a sent quote.
- [x] Totals are deterministic and exact.
- [x] VAT breakdown is stored or reproducible by line tax rate.
- [x] Document finalisation cannot consume duplicate numbers under replay or concurrency.
- [x] Preview and final PDF contain the same commercial values.
- [x] Finalised versions are immutable and hashed.
- [x] Editing after finalisation creates a new version and supersedes the old version.
- [x] Sending requires recipient email and a finalised version.
- [x] Recipient link is scoped to one document/version and expires by policy.
- [x] Recipient can view exact PDF and decline with optional reason.
- [ ] Sending/view/decline writes timeline, audit, outbox, and idempotency state.

#### Verification

- [x] Domain tests for money totals, discounts, VAT, snapshots, status transitions, and canonical hashes.
- [x] App tests for create/update/finalise/send/view/decline foundation.
- [x] App tests for revise/supersede.
- [x] API tests for quote creation, preview, finalise, exact PDF retrieval, send, recipient view, recipient decline, revise, and second finalisation.
- [x] Storage/PDF tests proving final bytes are immutable, SHA-verified, and retrievable from protected and recipient paths.
- [x] App/API tests proving commercial document events appear on account timeline with document, deal, recipient, version, decline, and total context.
- [x] App test proving a lost finalise claim is returned as `CONFLICT`, creates no version, and does not poison idempotency replay.

Remaining work before this slice is complete:

- Decide whether recipient view/decline need idempotency records or whether token+status handling is the intended recipient idempotency boundary.

#### Dependencies

- Slice 2.

### 3.5. Market-Origin And TIC Company Snapshot Bridge

Status: completed

#### Goal

A Swedish company can enter Dawn from registry or provider context, become a prospect/account/deal, and carry market-origin lineage into an existing commercial document before signing starts.

#### Progress Landed

- Added a market-origin domain model for canonical Swedish company identity, provider snapshots, team-scoped prospects, and promotion lineage.
- Added company seed normalization with Swedish organisation-number matching and explicit canonical identity invariants.
- Added market company, market company snapshot, and market prospect persistence with content-hash snapshot reuse and provider lineage stored outside canonical IDs.
- Added app use cases for seeding a market company, creating a team-scoped prospect, and promoting that prospect through the existing CRM organization/account/opportunity use cases.
- Added protected API routes for market company seed, prospect creation, and prospect promotion.
- Commercial document drafts created from promoted deals now snapshot market-origin/prospect lineage into the document/version payload.
- Account timelines now project market company seed, prospect creation, prospect promotion, CRM deal, and commercial document events into one history.
- Market-origin use cases use the existing team permission, idempotency, audit, and outbox contracts.

Verified market-origin bridge locally on 2026-06-20:

```text
bun test packages/domain/src/market.test.ts packages/domain/src/commercial-documents.test.ts
bun test packages/app/src/market.test.ts packages/app/src/commercial-documents.test.ts packages/app/src/crm.test.ts
bun test packages/api/src/router.test.ts
bun run check-types
bun run check:migrations
bunx oxfmt --check packages/domain/src/market.ts packages/domain/src/market.test.ts packages/domain/src/commercial-documents.ts packages/domain/src/commercial-documents.test.ts packages/app/src/market.ts packages/app/src/market.test.ts packages/app/src/crm.ts packages/app/src/crm.test.ts packages/app/src/commercial-documents.ts packages/app/src/commercial-documents.test.ts packages/api/src/routers/index.ts packages/api/src/router.test.ts packages/db/src/schema/crm.ts packages/db/src/dawn-repository.ts
bunx oxlint packages/domain/src/market.ts packages/domain/src/market.test.ts packages/domain/src/commercial-documents.ts packages/domain/src/commercial-documents.test.ts packages/app/src/market.ts packages/app/src/market.test.ts packages/app/src/crm.ts packages/app/src/crm.test.ts packages/app/src/commercial-documents.ts packages/app/src/commercial-documents.test.ts packages/api/src/routers/index.ts packages/api/src/router.test.ts packages/db/src/schema/crm.ts packages/db/src/dawn-repository.ts
```

Result: 91 focused market/commercial-document/CRM/API tests pass, monorepo typecheck/build is clean, the migration journal validates, and touched TypeScript files pass format/lint checks.

#### Scope

- Add the minimum canonical company and company snapshot records needed for a market/registry-originated company.
- Support manual or mock TIC company seed input while live TIC search/profile access is unavailable.
- Normalize Swedish organisation numbers before matching.
- Store a versioned provider snapshot with provider, capability, retrieval time, normalized fields, raw payload reference and content hash.
- Create a prospect with ICP/source lineage, source provider and source decision summary.
- Promote the prospect into an account/deal using existing CRM use cases.
- Preserve lineage into an existing commercial document created from that deal.
- Show market-origin, prospect promotion, deal and document events on the timeline.
- Do not build broad company search, autonomous agents, outreach, watchlists or a company mirror.

#### Areas To Inspect

- `packages/domain/src/identity.ts`
- `packages/domain/src/crm.ts`
- `packages/app/src/crm.ts`
- `packages/app/src/commercial-documents.ts`
- `packages/app/src/integrations.ts`
- `packages/integrations/src/index.ts`
- `packages/db/src/schema/core.ts`
- `packages/db/src/schema/crm.ts`
- `packages/db/src/dawn-repository.ts`
- `packages/api/src/routers/index.ts`
- `docs/adr/0012-auth-and-registry-providers-are-boundary-layers.md`

#### Acceptance Criteria

- [x] A user or test fixture can seed a Swedish company from registry/provider context.
- [x] One Swedish organisation number maps to one active canonical company identity per current legal-continuity rule.
- [x] The seed creates a versioned company snapshot with raw provider lineage and idempotent content hash behavior.
- [x] A prospect can record `sourceGoalId`, `sourceRunId`, `icpId`, `segmentId`, source provider and source decision summary.
- [x] Prospect promotion retains lineage after creating or linking an account and deal.
- [x] A commercial document created from the deal retains market-origin/prospect lineage.
- [x] Timeline shows market origin, prospect creation, promotion, deal and document events in one readable history.
- [x] Team isolation prevents private prospect/account/deal state leaking through the global company identity.
- [x] Provider external IDs are never used as Dawn canonical IDs.

#### Verification

- [x] Domain tests for Swedish organisation-number normalization and canonical company identity invariants.
- [x] App tests for snapshot idempotency, content hash reuse and team isolation.
- [x] App/API tests for prospect creation, promotion, account/deal/document lineage and timeline projection.
- [x] Audit/outbox tests proving market-origin and promotion actions use the existing app workflow contracts.

#### Dependencies

- Slices 2 and 3.

### 4. TIC BankID Signing Evidence Package

Status: completed

#### Goal

A recipient can sign the exact finalised quote/contract version with BankID through TIC, and Dawn stores verifiable evidence.

#### Progress Landed

- Added a signature domain model for TIC-backed signature requests, signer parties, hidden signed data, visible BankID text, and retained evidence.
- Added deterministic canonical JSON for hidden signed data covering document ID, version ID, version number, PDF SHA-256, terms version, deal ID, signer, Fortnox customer mapping, and market/prospect lineage.
- Added a TIC signing provider adapter contract and deterministic mock TIC provider for local/test flows.
- Added app use cases for seller-started TIC signing, raw-body webhook completion, team-protected evidence reads, and recipient signed-receipt access.
- Added signature request, party, and evidence persistence tables with provider session/event indexes for callback dedupe.
- Added HMAC/timestamp verification for TIC webhooks, with raw-body verification available from both the API procedure and `/api/webhooks/tic/signing`.
- Signing completion verifies the provider-reported document hash against immutable final PDF bytes before storing verified evidence.
- Completion stores XML-DSig, OCSP response, evidence object key, masked signer identity, raw provider payload, and verification status.
- Completion marks the commercial document `signed`, moves the deal to `won_pending_invoice`, and writes signature timeline, audit, outbox, and idempotency state.
- Recipient token access can fetch the signed receipt and retained evidence after completion. The polished public signing surface remains Slice 4.5.

Verified TIC signing evidence locally on 2026-06-20:

```text
bun test packages/domain/src/signatures.test.ts packages/domain/src/commercial-documents.test.ts packages/domain/src/market.test.ts
bun test packages/app/src/signatures.test.ts packages/app/src/webhook-signature.test.ts packages/app/src/commercial-documents.test.ts packages/app/src/crm.test.ts packages/app/src/market.test.ts
bun test packages/api/src/router.test.ts
bun run check-types
bun run check:migrations
bunx oxfmt --check apps/server/src/cloudflare.ts apps/server/src/dev.ts apps/server/src/index.ts packages/api/src/router.test.ts packages/api/src/routers/index.ts packages/app/src/commercial-documents.test.ts packages/app/src/commercial-documents.ts packages/app/src/crm.test.ts packages/app/src/crm.ts packages/app/src/index.ts packages/app/src/market.test.ts packages/app/src/market.ts packages/app/src/signatures.test.ts packages/app/src/signatures.ts packages/db/src/dawn-repository.ts packages/db/src/schema/crm.ts packages/domain/src/commercial-documents.test.ts packages/domain/src/commercial-documents.ts packages/domain/src/index.ts packages/domain/src/market.test.ts packages/domain/src/market.ts packages/domain/src/signatures.test.ts packages/domain/src/signatures.ts packages/env/src/server.ts packages/infra/src/cloudflare.ts packages/integrations/src/index.ts
bunx oxlint apps/server/src/cloudflare.ts apps/server/src/dev.ts apps/server/src/index.ts packages/api/src/router.test.ts packages/api/src/routers/index.ts packages/app/src/commercial-documents.test.ts packages/app/src/commercial-documents.ts packages/app/src/crm.test.ts packages/app/src/crm.ts packages/app/src/index.ts packages/app/src/market.test.ts packages/app/src/market.ts packages/app/src/signatures.test.ts packages/app/src/signatures.ts packages/db/src/dawn-repository.ts packages/db/src/schema/crm.ts packages/domain/src/commercial-documents.test.ts packages/domain/src/commercial-documents.ts packages/domain/src/index.ts packages/domain/src/market.test.ts packages/domain/src/market.ts packages/domain/src/signatures.test.ts packages/domain/src/signatures.ts packages/env/src/server.ts packages/infra/src/cloudflare.ts packages/integrations/src/index.ts
```

Result: focused domain/app/API signing and quote-to-cash tests pass, monorepo typecheck/build is clean, the migration journal validates, and touched TypeScript files pass format/lint checks.

#### Scope

- Add TIC provider adapter contract.
- Add signature request and signature party model.
- P0 UI exposes one external signer; storage supports multiple signers.
- Bind document ID, version ID, version number, SHA-256 hash, terms version, deal ID, Fortnox customer mapping, signer context, and available company/prospect lineage into hidden signed data.
- Generate visible BankID signing text from commercial summary.
- Verify webhook HMAC against raw body.
- Deduplicate callbacks/webhooks by provider event/session identity.
- Collect and store signature evidence, XML-DSig, OCSP response, and evidence package artifacts where available.
- Verify signed document hash against immutable finalised bytes.
- Mark document signed and deal `won_pending_invoice`.

#### Areas To Inspect

- `packages/app/src/integrations.ts`
- `packages/integrations/src/index.ts`
- `packages/app/src/documents-inbox.ts`
- `packages/jobs/src/index.ts`
- `apps/server/src/worker-runtime.ts`
- `packages/app/src/webhook-signature.ts`
- `packages/domain/src/events.ts`

#### Acceptance Criteria

- [x] Seller can create a TIC signature request for a finalised quote/contract.
- [x] Request cannot start for draft, expired, declined, voided, or superseded versions.
- [x] Visible signing text names document type/number, seller, customer, total/currency, validity/start date, terms version, and signing intent.
- [x] Hidden signed data uses deterministic canonical JSON and includes document/version/hash context plus available company/prospect lineage.
- [x] TIC webhook with invalid HMAC or timestamp is rejected.
- [x] Duplicate completion webhook produces one business completion.
- [x] Signature evidence and OCSP response are retained and permission-protected.
- [x] Stored hash matches final PDF bytes.
- [x] Signing completion writes timeline, audit, outbox, and idempotency state.
- [x] Recipient can later access the signed document/evidence receipt according to policy.

#### Verification

- [x] Domain/app tests for signing state transitions and invalid states.
- [x] Canonical JSON tests for hidden signed data.
- [x] Adapter contract tests with mock TIC responses/webhooks.
- [x] App/API tests for webhook replay, invalid HMAC, wrong document/session, evidence storage, and permission redaction.

#### Dependencies

- Slices 3 and 3.5.

### 4.5. Recipient Signing Surface

Status: ready alongside slice 4

#### Goal

A recipient can open a clean public signing link, review the exact finalised commercial document, start TIC BankID signing and see completion or failure state without entering the authenticated Dawn CRM app.

#### Scope

- Add `apps/sign` as a separate public recipient web app or equivalent deployable surface.
- Keep `apps/sign` free of CRM shell, sidebar, Dawn app navigation and authenticated workspace UI.
- Use token-based recipient access from the commercial document/signature request flow.
- Show sender, customer, document type/number, total, currency, validity, terms and signing intent.
- Render or embed the exact immutable PDF bytes for the active finalised document version.
- Start TIC BankID signing through existing recipient/signing API routes.
- Show pending, failed, expired, declined and signed states.
- Show a signed receipt and allow signed document/evidence download when policy allows.
- Make the experience mobile-first, fast-loading and high-trust.
- Add hard public-surface constraints: tight CSP, rate limits, no secret leakage, no workspace-auth assumptions.
- Do not add standalone PDF upload, generic signing order, independent document templates, public API, admin console or separate signing backend.

#### Areas To Inspect

- `apps/web/src/routes`
- `apps/web/src/components`
- `packages/api/src/routers/index.ts`
- `packages/app/src/commercial-documents.ts`
- `packages/app/src/integrations.ts`
- `packages/domain/src/commercial-documents.ts`
- `packages/sign` if reusable signing/evidence helpers are introduced
- `packages/ui/src/components`
- `packages/env/src/web.ts`
- `packages/infra/src/cloudflare.ts`

#### Acceptance Criteria

- [ ] Recipient signing link opens outside the authenticated Dawn CRM shell.
- [ ] Recipient can view document overview and exact immutable PDF for the active finalised version.
- [ ] Recipient can start TIC BankID signing from the public surface.
- [ ] Pending, failed, expired, declined and signed states are human-readable.
- [ ] Signed completion shows a receipt and available evidence/download actions according to policy.
- [ ] Public surface uses recipient token access only and never requires Dawn user auth.
- [ ] Public surface does not expose CRM navigation, workspace data or unrelated APIs.
- [ ] Business mutations still go through shared app/domain use cases with audit, outbox and idempotency.
- [ ] Surface is mobile-usable for the external buyer/signer.

#### Verification

- API tests for recipient signing read/start/status flows.
- App tests proving token access is scoped to one document/version/signature request.
- Web route/component tests or browser smoke for view, start, pending, failed and signed states.
- Security tests or checklist for public route auth boundaries, CSP-sensitive asset loading and rate-limit expectations.

#### Dependencies

- Slices 3, 3.5 and 4.

### 5. TIC Company Context And Signer Trust

Status: ready

#### Goal

Company context and signer-role evidence help the team decide whether the signer appears related to the customer before invoice handoff, without pretending Dawn has made an authoritative legal determination.

#### Scope

- Reuse the company snapshot and registry context from slice 3.5 before quote/signing.
- Add trust-check records and evidence storage.
- Add team policy for disabled, advisory, or blocking trust checks.
- Request TIC CompanyRoles enrichment after identity is established.
- Compare signer relationship to account organisation number and stored company context.
- Store original role descriptions, company status, and original `signatureDescription`.
- Return `pass`, `needs_review`, or `unavailable`.
- Label AI-generated signing-authority analysis as advisory only.
- Add manual approval/rejection with reviewer, timestamp, rationale, and audit.
- Block invoice handoff when policy requires approval.
- Show company context, trust status and review on account/deal/document timeline.

#### Areas To Inspect

- `packages/domain/src/crm.ts`
- `packages/app/src/crm.ts`
- `packages/app/src/integrations.ts`
- `packages/domain/src/assistant.ts`
- `packages/app/src/assistant.ts`
- `packages/domain/src/events.ts`
- `docs/adr/0012-auth-and-registry-providers-are-boundary-layers.md`

#### Acceptance Criteria

- [ ] Team can enable, disable, or require review for trust checks.
- [ ] Company context from slice 3.5 is visible before quote/signing where available.
- [ ] CompanyRoles request runs only after permitted identity context exists.
- [ ] Failed/unavailable enrichment does not silently pass.
- [ ] Original source descriptions remain visible to reviewers.
- [ ] AI-generated analysis is labelled as assistance, not authority.
- [ ] `needs_review` blocks invoice creation when policy requires approval.
- [ ] Manual decision records reviewer, timestamp, and rationale.
- [ ] Trust result and review appear on the deal/customer timeline.
- [ ] Sensitive enrichment data is permission-protected and retained according to policy.

#### Verification

- Domain tests for trust status transitions and policy blocking.
- App tests for pass/needs-review/unavailable flows, manual review, audit, and permission redaction.
- Adapter tests for mock TIC CompanyRoles responses.
- API tests for trust result read/review behaviour.

#### Dependencies

- Slices 3.5, 4 and 4.5.

### 6. Fortnox Invoice Handoff

Status: ready

#### Goal

A signed and policy-cleared document creates exactly one linked Fortnox invoice, either automatically or after manual approval depending on team policy.

#### Scope

- Add signed-document-to-Fortnox-invoice command.
- Add team policy for automatic creation versus manual approval.
- Require signer trust approval when workspace policy says trust review is blocking.
- Add external operation ledger/idempotency key for the Fortnox write.
- Resolve Fortnox customer mapping and payment/default fields.
- Map signed document line snapshots to Fortnox invoice lines.
- Reload immutable signed version and confirm validity before provider write.
- Store request/response IDs, external invoice mapping, invoice number, and provider-native status.
- Add invoice/payment projection refresh.
- Add failure states and manual retry without re-signing.
- Keep order creation P1 unless Phase 0 explicitly changes the first write target.

#### Areas To Inspect

- `packages/app/src/billing.ts`
- `packages/app/src/integrations.ts`
- `packages/integrations/src/index.ts`
- `packages/jobs/src/index.ts`
- `apps/server/src/worker-runtime.ts`
- `packages/db/src/schema/core.ts`
- `packages/domain/src/invoices.ts`
- Reference mining: `ref/midday/apps/worker/src/processors/invoices/*`, `ref/midday/packages/jobs/src/tasks/invoice/operations/check-status.ts`, `ref/open-mercato/apps/mercato/src/modules/example_customers_sync/lib/mappings.ts`, `ref/erpjs/apps/api/src/model/lib/sales.invoice*.ts`

#### Acceptance Criteria

- [ ] Signed document can request invoice creation through outbox/job flow.
- [ ] Policy can require manual approval before invoice handoff.
- [ ] One signed document can create at most one active Fortnox invoice.
- [ ] Replaying webhook, command, or job cannot create duplicates.
- [ ] Trust `needs_review` blocks invoice creation when policy requires approval.
- [ ] Fortnox customer mapping, line snapshots, totals, currency, and payment terms reconcile with the signed version.
- [ ] Fortnox invoice number, link, status, and payment projection appear in Dawn.
- [ ] Failure after signing is recoverable without re-signing.
- [ ] Provider validation errors are actionable to Sales/Finance users.
- [ ] Invoice status updates do not regress on older provider events.
- [ ] Accounting invoice projection uses provider/connection/object mappings and does not introduce Fortnox-only canonical CRM fields.

#### Verification

- App tests for automatic/manual handoff, idempotent Fortnox writes, duplicate prevention, trust-policy blocking, and failure recovery.
- Adapter contract tests for mock Fortnox invoice creation and invoice refresh.
- Worker tests for signing-completed-to-invoice job behaviour.
- Replay tests for TIC webhook, Fortnox command, and Fortnox event duplication.
- Reconciliation test proving PDF, signed summary, and Fortnox invoice totals match.

#### Dependencies

- Slices 1, 4, 4.5, and 5.

### 7. Pilot Product Surface And Operations

Status: ready

#### Goal

External teams can use the quote-to-cash flow with supportable reliability.

#### Scope

- Implement focused navigation: Home, Deals, Customers, Documents, Invoices, Settings.
- Hide parked modules from primary navigation and normal users.
- Add Home dashboard with action queues:
  - deals awaiting quote
  - documents awaiting signature
  - trust checks awaiting review
  - signed deals not yet invoiced
  - integration failures
  - overdue/unpaid invoices where Fortnox data is available
- Add product UI for Fortnox connection, account/contact/deal, quote builder, recipient preview, signing status, invoice status, and recovery states.
- Add Dawn transactional emails and signing reminders.
- Add support trace view by correlation ID, team ID, provider connection/entity, job ID, and idempotency key.
- Add pilot analytics for activation, funnel, and quality metrics.
- Complete basic threat model before private beta.

#### Areas To Inspect

- `apps/web/src/routes`
- `apps/web/src/components`
- `packages/ui/src/components`
- `packages/api/src/routers/index.ts`
- `packages/jobs/src/index.ts`
- `packages/app/src/operations.ts`
- `docs/product/FORTNOX-SALES-OS-PRD.md`

#### Acceptance Criteria

- [ ] A pilot user can complete connect Fortnox -> create account/deal -> quote -> sign -> invoice -> payment-status flow from the UI.
- [ ] Parked modules are not first-viewport product promises.
- [ ] Recipient flow works without a Dawn account and is mobile-usable.
- [ ] Sync/signing/Fortnox failures show clear recovery actions.
- [ ] Timeline explains workflow state without support logs.
- [ ] Support can trace a workflow by correlation ID and related provider/job IDs.
- [ ] Activation and quote-to-cash funnel metrics can be measured.
- [ ] Duplicate invoice, hash mismatch, replay, and invalid-webhook scenarios are in the release suite.

#### Verification

- API contract tests for all UI-backed operations.
- Focused web component/route tests where behaviour is non-trivial.
- Manual local smoke for one mocked account/deal/quote/signing/Fortnox path.
- Release scenarios from the PRD's end-to-end test list.
- Threat-model checklist before private beta.

#### Dependencies

- Slices 1 through 6, including slices 3.5 and 4.5.

## Phase 2: AI-Native Market-To-Revenue Expansion

### 8. Workspace Overlay, Prospect And ICP Seed

Status: ready

#### Goal

A workspace can interpret the same global company through its own ICP and commercial relationship state.

#### Scope

- Add `WorkspaceCompany` as a private overlay linked to a global company.
- Add first-class `IcpProfile` seed object with natural-language objective, hard constraints, soft preferences, exemplars and qualification rubric.
- Link prospects to workspace company, ICP version and segment placeholder.
- Support positive and negative exemplar references from existing accounts or imported companies.
- Add basic UI/API read model for a workspace's prospect package.

#### Areas To Inspect

- `packages/domain/src/crm.ts`
- `packages/app/src/crm.ts`
- `packages/db/src/schema/crm.ts`
- `packages/api/src/routers/index.ts`
- `apps/web/src/routes`
- `apps/web/src/components`

#### Acceptance Criteria

- [ ] The same global company can have different workspace intelligence/prospect state in two workspaces.
- [ ] A workspace can create an ICP seed from text and exemplar company references.
- [ ] A prospect package shows company identity, source snapshot, ICP link, fit summary placeholder and next action.
- [ ] Private workspace notes, owner, status and decisions never write back to global company identity.
- [ ] Existing account/deal permissions apply to workspace prospect reads and writes.

#### Verification

- Domain/app tests for global-company and workspace-overlay separation.
- API tests for ICP seed create/read and prospect package read.
- Permission tests proving workspace isolation.

#### Dependencies

- Slice 3.5.

### 9. AI-Authored Company Intelligence Current State

Status: ready

#### Goal

Dawn can store AI-authored company and workspace intelligence as first-class current product state with revision history.

#### Scope

- Add current and revision models for general company intelligence.
- Add current and revision models for workspace-specific company intelligence.
- Store model, prompt/rubric version, context snapshot ID, source observations, previous state and generation time.
- Add app use cases to write intelligence through a typed command, not direct database writes.
- Add read surfaces for summary, business model, likely pains, ICP fit, account strategy, outreach angle and next best move.
- Allow human edit or approval metadata without erasing AI revision provenance.

#### Areas To Inspect

- `packages/domain/src/assistant.ts`
- `packages/domain/src/crm.ts`
- `packages/app/src/assistant.ts`
- `packages/app/src/crm.ts`
- `packages/db/src/schema/core.ts`
- `packages/db/src/schema/crm.ts`
- `packages/api/src/routers/index.ts`

#### Acceptance Criteria

- [ ] Current AI-authored fields are queryable product state, not only notes or artifacts.
- [ ] Every current intelligence record has at least one revision record.
- [ ] Revisions retain generation metadata and source context reference.
- [ ] Workspace-specific intelligence can differ for the same global company.
- [ ] Timeline records intelligence creation and refresh events.
- [ ] Reads clearly distinguish external facts, Dawn-owned state and AI-authored state.

#### Verification

- Domain tests for intelligence state and revision invariants.
- App/API tests for write, refresh, human edit metadata and timeline projection.
- Permission tests for workspace intelligence isolation.

#### Dependencies

- Slices 3.5 and 8.

### 10. Minimal Goal And Agent Run Ledger

Status: ready

#### Goal

A workspace can create an executable commercial goal and see one durable agent run with plan, tasks, actions, policy decisions and checkpoints.

#### Scope

- Add minimal `Goal`, `AgentRun`, `AgentTask`, `AgentAction`, `PolicyDecision`, `ContextSnapshot` and `Artifact` records.
- Use a mock or local runtime path if Flue is not integrated yet.
- Record run objective, plan, status, budget, principal, policy version and correlation ID.
- Ensure agent actions call app use cases or typed tools instead of direct repository writes.
- Show run status and completed actions on a goal or account timeline.

#### Areas To Inspect

- `packages/domain/src/events.ts`
- `packages/app/src/index.ts`
- `packages/app/src/crm.ts`
- `packages/app/src/integrations.ts`
- `packages/jobs/src/index.ts`
- `apps/server/src/worker-runtime.ts`
- `packages/db/src/schema/core.ts`

#### Acceptance Criteria

- [ ] A user can create a goal such as "build pipeline for this ICP".
- [ ] Creating a goal starts or records one agent run.
- [ ] The run has a plan, task, action ledger and status transitions.
- [ ] Every action is attributable to workspace, principal, run, task and policy decision.
- [ ] A failed or blocked run exposes a user-visible reason and recovery path.
- [ ] No agent path mutates business state outside app/domain use cases.

#### Verification

- Domain/app tests for goal and run status transitions.
- App tests for action attribution, policy decision recording and idempotency.
- Worker/job tests for run continuation or mock execution.

#### Dependencies

- Slice 3.5.

### 11. Business Tool Gateway And Autonomy Policy

Status: ready

#### Goal

Agents can invoke typed Dawn business tools inside a workspace policy envelope.

#### Scope

- Define a tool contract for input/output, workspace/principal context, idempotency key, correlation ID and structured errors.
- Expose first tools for `createProspect`, `promoteProspectToAccount`, `writeCompanyIntelligence`, `createDeal`, `setNextBestMove` and `appendTimelineEvent`.
- Add preview and commit modes where mutation risk justifies it.
- Add autonomy policy checks by action type, agent, segment, volume and monetary threshold.
- Record every tool call as an agent action.

#### Areas To Inspect

- `packages/app/src/index.ts`
- `packages/app/src/crm.ts`
- `packages/domain/src/crm-permissions.ts`
- `packages/domain/src/permissions.ts`
- `packages/api/src/routers/index.ts`
- `packages/jobs/src/index.ts`

#### Acceptance Criteria

- [ ] Tools are business capabilities, not raw database access.
- [ ] Tool calls enforce workspace permissions and agent capabilities.
- [ ] Mutating tool calls require idempotency identity.
- [ ] Policy denies are recorded with reason and visible on the run.
- [ ] Tool results include source references or business entity references.
- [ ] Replaying a committed tool action does not duplicate business state.

#### Verification

- Contract tests for tool input/output and structured errors.
- App tests for policy allow/deny, idempotency replay and action-ledger recording.
- Permission tests for agent principal capability boundaries.

#### Dependencies

- Slices 9 and 10.

### 12. Prospecting Run From Market Query To Ranked Prospects

Status: ready

#### Goal

A user can run a narrow market instruction and receive ranked prospects with source snapshots, fit narratives and promotion actions.

#### Scope

- Compile a constrained market query from an ICP, geography, SNI/company-size filters or user text.
- Use TIC search capability or a mocked/search-fixture path while provider access is validated.
- Create candidate company snapshots.
- Run staged candidate triage through AI intelligence writes.
- Rank prospects by fit score, timing and reason.
- Let the user accept, reject or suppress prospects.
- Preserve run, query, model and decision lineage.

#### Areas To Inspect

- `packages/app/src/integrations.ts`
- `packages/integrations/src/index.ts`
- `packages/app/src/assistant.ts`
- `packages/app/src/crm.ts`
- `packages/jobs/src/index.ts`
- `apps/server/src/worker-runtime.ts`
- `apps/web/src/routes`

#### Acceptance Criteria

- [ ] A market query produces a durable prospecting run.
- [ ] Results arrive incrementally enough for a user to inspect early candidates.
- [ ] Each prospect includes company snapshot, ICP fit, reason to pursue or skip and next action.
- [ ] Reject and suppress decisions prevent further outreach for that company/person within policy.
- [ ] The run can resume after partial failure without duplicating prospects.
- [ ] The system records enough context to replay or evaluate the ranking later.

#### Verification

- App/job tests for query compilation, candidate persistence, resume cursors and duplicate prevention.
- Intelligence tests for write/revision behavior during prospecting.
- API/UI smoke for prospect review and promotion.

#### Dependencies

- Slices 3.5, 8, 9, 10 and 11.

### 13. Contact And Buying-Role Package

Status: ready

#### Goal

Dawn can attach likely people, roles and contact routes to a prospect without treating unverified hypotheses as facts.

#### Scope

- Add person/contact identity separation for public roles, workspace contacts and verified signers.
- Retrieve TIC company roles/signatories where licensed.
- Add contact candidate and buying-role hypothesis records.
- Store confidence, source, verification state and suppression/channel status.
- Connect selected contact candidates to account contacts during promotion.
- Present buyer-role recommendations in the prospect package.

#### Areas To Inspect

- `packages/domain/src/crm.ts`
- `packages/app/src/crm.ts`
- `packages/app/src/integrations.ts`
- `packages/db/src/schema/crm.ts`
- `packages/api/src/routers/index.ts`

#### Acceptance Criteria

- [ ] Public role evidence, workspace contact relationship and verified signer evidence are separate states.
- [ ] Contact candidates retain source and confidence.
- [ ] A recommended persona can be stored as AI-authored workspace intelligence.
- [ ] Suppressed or unsubscribed people cannot be enrolled in outreach.
- [ ] Promotion can convert selected candidates into account contacts.

#### Verification

- Domain/app tests for person/contact/source separation.
- Adapter tests for mock TIC role/signatory retrieval.
- Permission and suppression tests for contact candidate use.

#### Dependencies

- Slices 8, 9 and 12.

### 14. Account-Thesis Outreach Drafting And Sender Controls

Status: ready

#### Goal

Dawn can draft and optionally send account-thesis-driven outreach under sender, volume and suppression policy.

#### Scope

- Add message draft records linked to prospect/account, contact candidate, ICP, segment, agent run and strategy.
- Generate outreach from account thesis, pain hypothesis, persona and workspace voice.
- Add sender identity, mailbox/domain budget, suppression and duplicate-contact checks.
- Start with draft/approval mode; allow send mode only when policy gates pass.
- Record sent messages and stop conditions.
- Avoid unsupported factual claims in generated copy.

#### Areas To Inspect

- `packages/domain/src/events.ts`
- `packages/app/src/crm.ts`
- `packages/app/src/assistant.ts`
- `packages/jobs/src/index.ts`
- `apps/server/src/worker-runtime.ts`
- `packages/env/src/index.ts`
- `apps/web/src/routes`

#### Acceptance Criteria

- [ ] A prospect can produce an outreach draft grounded in stored intelligence.
- [ ] Drafts cite the source account thesis and avoid unsupported claims.
- [ ] Sender policy checks run before every send.
- [ ] Suppression, bounce, unsubscribe and duplicate-contact checks block sends.
- [ ] Sent messages are recorded on the account timeline and agent action ledger.
- [ ] Sending can be disabled workspace-wide while drafting remains available.

#### Verification

- Component eval fixtures for message quality and unsupported-claim detection.
- App tests for sender policy, suppression and duplicate prevention.
- API/UI tests for draft, approve and send flows.

#### Dependencies

- Slices 11, 12 and 13.

### 15. Reply And Conversation-To-Deal Updates

Status: ready

#### Goal

Inbound replies and meeting outcomes update CRM state, next actions and deal intelligence without manual upkeep.

#### Scope

- Add conversation thread records for outbound and inbound messages.
- Classify replies into commercial states such as interest, referral, objection, not now, unsubscribe, bounce and out-of-office.
- Extract commitments, questions, objections and next actions.
- Create or update account/deal state through app use cases.
- Pause outreach immediately on reply or suppression signals.
- Add human review queue for ambiguous or high-value replies.

#### Areas To Inspect

- `packages/domain/src/crm.ts`
- `packages/app/src/crm.ts`
- `packages/app/src/assistant.ts`
- `packages/jobs/src/index.ts`
- `packages/api/src/routers/index.ts`
- `apps/web/src/routes`

#### Acceptance Criteria

- [ ] Incoming reply classification writes structured product state.
- [ ] Positive reply can create or advance a deal when policy allows.
- [ ] Objection/question states create next actions or review items.
- [ ] Unsubscribe and negative channel signals suppress further sends.
- [ ] Deal intelligence updates include source conversation references.
- [ ] Ambiguous classifications can be corrected by a human and retained for evaluation.

#### Verification

- Component eval fixtures for reply classification.
- App/API tests for reply state transitions, deal updates, suppression and review queue.
- Timeline tests for conversation and deal-intelligence events.

#### Dependencies

- Slice 14.

### 16. Outcome Attribution And Learning Dataset

Status: ready

#### Goal

Dawn can attribute replies, meetings, deals, signed documents, invoices and payments back to the originating goal, ICP, segment, prospecting run and agent decisions.

#### Scope

- Add `Outcome` records for reply, meeting, qualified opportunity, proposal, signature, invoice, payment, renewal and churn signals.
- Link outcomes to goal, agent run, ICP version, segment, prospect, account, deal, document, signature request and accounting object where applicable.
- Add read model for source-to-revenue funnel.
- Produce evaluation dataset rows from accepted/rejected prospects, messages, replies and paid outcomes.
- Ensure outcome updates are idempotent and do not regress on older provider events.

#### Areas To Inspect

- `packages/domain/src/events.ts`
- `packages/app/src/crm.ts`
- `packages/app/src/commercial-documents.ts`
- `packages/app/src/integrations.ts`
- `packages/db/src/schema/core.ts`
- `packages/db/src/schema/crm.ts`
- `packages/jobs/src/index.ts`

#### Acceptance Criteria

- [ ] A paid invoice can be traced back to the originating prospecting decision after slices 4 and 5 exist.
- [ ] Outcome records are idempotent and source-attributed.
- [ ] Funnel metrics can be read by goal, ICP, segment, run and workspace.
- [ ] Evaluation dataset exports exclude or redact sensitive fields according to policy.
- [ ] Manual corrections preserve original model/action lineage.

#### Verification

- App tests for outcome idempotency and lineage joins.
- Projection tests for goal/ICP/run funnel reads.
- Privacy/redaction tests for evaluation dataset export.

#### Dependencies

- Slices 3.5, 10, 12, 14 and 15.
- Slice 6 for full invoice/payment attribution.

### 17. Continuous Company Monitoring And Watchlist Signals

Status: ready

#### Goal

Dawn can monitor companies or segments and wake the relevant goal/run when market or trust signals change.

#### Scope

- Add watchlist records linked to workspace, goal, ICP, segment or account.
- Use TIC watchlist capabilities where licensed, or an internal scheduled refresh fallback.
- Normalize company events such as role change, status change, financial update, workplace change or credit/trust change.
- Trigger prospect re-evaluation, account reprioritization, trust review or expansion opportunity.
- Add freshness policy and provider licensing metadata.

#### Areas To Inspect

- `packages/app/src/integrations.ts`
- `packages/integrations/src/index.ts`
- `packages/jobs/src/index.ts`
- `apps/server/src/worker-runtime.ts`
- `packages/db/src/schema/core.ts`
- `packages/domain/src/events.ts`

#### Acceptance Criteria

- [ ] A workspace can add companies or a segment to a monitor.
- [ ] Provider events or scheduled refresh create normalized company events.
- [ ] Duplicate or delayed provider events do not create duplicate business actions.
- [ ] A relevant signal can wake an agent run or create a review item.
- [ ] Licensing and retention constraints are visible in provider capability metadata.

#### Verification

- Adapter tests for mock TIC watchlist events.
- Job tests for deduplication, refresh fallback and agent wakeup.
- App tests for review item creation and timeline projection.

#### Dependencies

- Slices 3.5, 10 and 12.

### 18. Agent Evaluation And Release Gates

Status: ready

#### Goal

Model, prompt, rubric and context-policy changes can be evaluated before they affect real prospecting, outreach or deal operation.

#### Scope

- Add evaluation profile and result records for component and trajectory evals.
- Define fixtures for company understanding, ICP fit, account strategy, message quality and reply classification.
- Support historical replay or shadow run mode for one prospecting run.
- Gate default prompt/model changes by evaluation result and policy.
- Surface evaluation result on agent run or prompt version records.

#### Areas To Inspect

- `packages/domain/src/assistant.ts`
- `packages/app/src/assistant.ts`
- `packages/jobs/src/index.ts`
- `packages/db/src/schema/core.ts`
- `docs/product/DAWN-AI-NATIVE-CRM-NORTH-STAR-PRD.md`

#### Acceptance Criteria

- [ ] Each AI-authored output type has at least one evaluation path before production default changes.
- [ ] A prompt/model/rubric change can run against historical or fixture data.
- [ ] Failed eval gates prevent the change from becoming default.
- [ ] Evaluation results link to model, prompt, context policy, task type and run.
- [ ] Cost and quality metrics are both visible, with quality allowed to override cost savings.

#### Verification

- Unit tests for evaluation gate decisions.
- Fixture-based tests for at least company intelligence, ICP fit, outreach draft and reply classification.
- Shadow-run test proving no external actions are executed.

#### Dependencies

- Slices 9, 10, 12, 14 and 15.

### 19. Large Run Scale And Recovery

Status: ready

#### Goal

Large territory runs are durable, incremental, resumable and observable without corrupting commercial state or provider limits.

#### Scope

- Shard runs by candidate, segment or geography.
- Add durable pagination/cursors and fan-out/fan-in checkpoints.
- Add provider rate control, shared context cache and per-run cost accounting.
- Support priority escalation for promising candidates.
- Allow a run to revise its market query mid-run with a recorded plan revision.
- Expose partial results and blocked shards to users.

#### Areas To Inspect

- `packages/jobs/src/index.ts`
- `apps/server/src/worker-runtime.ts`
- `packages/app/src/integrations.ts`
- `packages/app/src/assistant.ts`
- `packages/db/src/dawn-repository.ts`
- `packages/env/src/index.ts`

#### Acceptance Criteria

- [ ] A large run can resume after worker failure without duplicating prospects or sends.
- [ ] Candidate shards persist successful partial results.
- [ ] Provider rate limits and workspace budgets are enforced.
- [ ] Plan revisions record why the search changed.
- [ ] Users can inspect progress, blocked shards, cost and next wake time.
- [ ] Partial results remain usable even if the full run fails.

#### Verification

- Worker tests for shard resume, fan-in, duplicate prevention and cursor persistence.
- Rate-limit tests for provider and sender budgets.
- App/API tests for progress and blocked-state reads.

#### Dependencies

- Slices 10, 11, 12, 16 and 17.

## Phase 3: Provider Expansion Proof

### 20. Spiris/Visma Provider-2 Spike

Status: parked until the Fortnox quote-to-cash path has pilot signal

#### Goal

Prove Dawn can support a second Swedish accounting provider through the existing provider port without changing canonical CRM, document, signing, invoice-handoff, or timeline models.

#### Scope

- Add `spiris` as a provider enum/capability option only inside the accounting integration boundary.
- Implement a sandbox OAuth connection spike for Spiris/eAccounting.
- Read company, customers, and articles through the adapter.
- Create one sandbox invoice from a signed-document-shaped payload.
- Record provider capabilities explicitly instead of assuming Fortnox-equivalent support.
- Document endpoint/scoping/rate-limit differences and any model mismatch.
- Do not build product UI parity, bulk migration, multi-provider dashboards, or a generic integration platform.

#### Acceptance Criteria

- [ ] Spiris OAuth state and token handling use the same security/idempotency shape as Fortnox.
- [ ] Spiris customer/article reads land as provider-qualified objects.
- [ ] One sandbox invoice write proves the invoice handoff boundary can support provider 2.
- [ ] Missing or different capabilities are surfaced through capability metadata, not conditional core workflow forks.
- [ ] No Dawn-owned CRM, commercial document, signing, trust, or timeline schema needs provider-specific branching.

#### Verification

- Adapter contract tests for Spiris OAuth, customer/article read, invoice write, capability mapping, and rate-limit handling.
- App tests proving provider-qualified objects can coexist with Fortnox objects for the same team without ID collisions.
- A short ADR or appendix recording whether provider 2 is viable and what must wait for paid expansion.

#### Dependencies

- Slice 1.
- Slice 6 enough to have a real Fortnox invoice-handoff boundary to compare against.

## Dependency Summary

- Slice 0 keeps scope from drifting.
- Slice 1 proves Fortnox as accounting/economic source.
- Slice 2 provides the minimal CRM surface.
- Slice 3 proves quote/document value before signing.
- Slice 3.5 proves that a Swedish company can enter from market/registry context and carry lineage into account, deal and document state.
- Slice 4 proves TIC signing and evidence.
- Slice 4.5 makes signing feel like a focused public recipient product surface without splitting backend ownership.
- Slice 5 deepens the Swedish trust wedge and gates invoice handoff where policy requires it.
- Slice 6 proves quote-to-cash through Fortnox invoice creation.
- Slice 7 makes the flow pilot-ready and supportable.
- Slice 8 adds the richer workspace overlay, prospect package and ICP seed on top of the bridge.
- Slice 9 makes AI-authored company/workspace intelligence queryable product state.
- Slices 10 and 11 add the governed goal/run/tool surface agents need before autonomous work.
- Slices 12 through 16 add prospecting, people, outreach, reply handling and outcome attribution.
- Slices 17 through 19 add continuous monitoring, eval gates and large-run recovery.
- Slice 20 is parked provider-2 validation after Fortnox invoice handoff has real signal.

## Suggested Next Slice

Build **Slice 3.5: Market-Origin And TIC Company Snapshot Bridge** next. Slices 0 through 3 are the implemented foundation, and slice 3.5 is the narrow product-critical bridge that lets a Swedish company enter from registry/market context, become a prospect/account/deal, and carry lineage into commercial documents before signing.

Then continue with **Slice 4: TIC BankID Signing Evidence Package** and **Slice 4.5: Recipient Signing Surface** together. After the recipient can sign through the focused public surface, continue with **Slice 5: TIC Company Context And Signer Trust** and **Slice 6: Fortnox Invoice Handoff**.

Close the remaining real-provider verification for **Slice 1: Fortnox Foundation** opportunistically when credentials are available, and resolve any final Slice 3 recipient idempotency decision if it is still open. Do not let either become a reason to skip the market-origin bridge or start broad prospecting, agents, outreach, watchlists or a company mirror.

Do not start new generic CRM metadata, banking, project/time, assistant, public API, or automation-builder work until the Fortnox quote-to-cash flow is proven end to end.

## Worker Prompt Template

Use this prompt for a fresh agent:

```text
You are working in /Users/erik/dawn. Read AGENTS.md first.

Active product direction:
- Dawn is a Fortnox-native quote-to-cash CRM first, growing toward an AI-native Swedish CRM and autonomous revenue engine.
- Fortnox is the first go-to-market accounting backend; shared code must stay accounting-provider-native so Spiris/eAccounting can be proven later without rewrites.
- Active beta product source: docs/product/FORTNOX-SALES-OS-PRD.md
- North-star product source: docs/product/DAWN-AI-NATIVE-CRM-NORTH-STAR-PRD.md
- Execution source: docs/work/FORTNOX-SALES-OS-VERTICAL-SLICES.md
- Current implementation checkpoint: slices 0 through 3 are the implemented foundation. Build slice 3.5 next unless the user explicitly asks otherwise.
- Broad CRM/backend docs remain reference material; generic metadata/custom objects are parked for the first pilot.

Take the next ready slice from docs/work/FORTNOX-SALES-OS-VERTICAL-SLICES.md. Keep business rules in packages/app and packages/domain. Provider adapters must stay behind ports. Postgres remains authoritative. Every mutable workflow needs request context, permissions, idempotency, audit, and outbox/job behaviour.

Before editing, inspect the files listed under the slice's Areas To Inspect and check git status. Do not revert unrelated work. Implement the slice end to end with focused tests and report verification commands.
```
