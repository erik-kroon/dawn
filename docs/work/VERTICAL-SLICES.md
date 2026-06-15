# Vertical Work Plan: Dawn End-State Architecture

Triage: ready-for-agent
Publication: Local repo artifact. No project issue tracker or remote is configured yet.
Source material: `docs/work/IMPLEMENTATION-PRD.md`, `docs/PRD.md`, `CONTEXT.md`, `CONTEXT-MAP.md`
Date: 2026-06-14

## Outcome

When all slices are done, Dawn has the end-state system shape described in the PRD:

- Team-scoped business data with central permissions.
- A pure domain layer and an application use-case layer.
- Postgres-backed financial and operational records.
- Audit, idempotency, and outbox events on sensitive state changes.
- Cloudflare-first API, coordination, file storage, queues, and workflows.
- TanStack DB sync collections for reactive client data.
- TanStack AI assistant flows with permissioned tools and approval gates.
- Provider adapter boundaries for banking, documents, invoicing, accounting, payments, messaging, and AI.
- Agent-readable ADRs and implementation conventions.

## Slice Strategy

Avoid horizontal slices like "build backend", "build frontend", or "write tests". Each slice should produce a working behavior, a durable boundary, or an independently useful platform capability.

The first slice is an architectural tracer: one small transaction-review workflow that crosses auth context, API, application use case, domain rule, database persistence, audit/outbox event, sync contract, and UI. Later slices deepen the system by adding data domains, integrations, AI, automation, public API, and operational hardening.

## Ordered Slices

### 1. Architecture Decision Baseline

## Goal

Establish the decisions future agents must follow before code spreads across the starter repo.

## Scope

- Write initial ADRs for application-layer ownership, Postgres authority, Cloudflare runtime boundaries, Durable Object role, outbox model, money representation, TanStack DB sync, TanStack AI tools, provider adapters, and Trigger.dev criteria.
- Confirm repo-local docs point to the ADRs as the decision source.
- Keep decisions concise and actionable.

## Areas To Inspect

- `docs/PRD.md`
- `docs/work/IMPLEMENTATION-PRD.md`
- `docs/adr/`
- `AGENTS.md`
- `CONTEXT.md`
- `CONTEXT-MAP.md`

## Acceptance Criteria

- [ ] ADRs exist for the first architecture decisions called out by the PRD.
- [ ] ADR statuses are explicit.
- [ ] ADRs define tradeoffs and consequences, not just conclusions.
- [ ] Agent guidance points future work to ADRs before architecture changes.

## Verification

- Read the ADRs and confirm every major package/runtime decision in the PRD has a decision record.
- Run markdown/link checks if available.

## Dependencies

- None.

### 2. Transaction Review Tracer Slice

## Goal

Prove the target architecture with one thin end-to-end workflow: a team member reviews and categorizes a transaction.

## Scope

- Add the first domain primitives for actor, team, permission, money, transaction, category, audit event, and outbox event.
- Add an application use case for categorizing/reviewing a transaction.
- Add persistence for teams, memberships, transactions, categories, audit log, idempotency keys, and outbox events.
- Expose a typed API mutation and query.
- Add a minimal transaction review UI backed by the current web stack.
- Add a sync collection contract shape even if the first implementation refreshes by query.

## Areas To Inspect

- `packages/db`
- `packages/api`
- `packages/auth`
- `apps/server`
- `apps/web`
- `packages/ui`
- Target packages from `CONTEXT-MAP.md`

## Acceptance Criteria

- [ ] An authenticated user can belong to a team.
- [ ] A team-scoped transaction can be listed.
- [ ] A permitted actor can categorize and mark a transaction reviewed.
- [ ] A forbidden actor cannot mutate another team's transaction.
- [ ] The mutation writes an audit entry and outbox event.
- [ ] Repeating the mutation with the same idempotency key does not duplicate side effects.
- [ ] The UI shows the updated transaction state.

## Verification

- Run typecheck and relevant tests.
- Add behavior tests for the use case and permission failure.
- Manually run web/server and exercise the tracer flow.

## Dependencies

- Slice 1 should be done or accepted enough to guide implementation.

### 3. Team Context And Permission Model

## Goal

Turn authenticated users into team-scoped actors with durable roles and permissions.

## Scope

- Add team, membership, invite, role, and permission concepts.
- Resolve team context for API and application calls.
- Define default roles: owner, admin, member, accountant, viewer.
- Add centralized permission evaluation.
- Add team switching in the web app.

## Areas To Inspect

- `packages/auth`
- `packages/api`
- `packages/db`
- `apps/server`
- `apps/web`
- `packages/domain`
- `packages/app`

## Acceptance Criteria

- [ ] Users can create and select teams.
- [ ] Team memberships define the actor's role.
- [ ] Application use cases receive resolved team and permissions.
- [ ] Permission denials return typed errors.
- [ ] Team-scoped queries cannot leak data across teams.
- [ ] The web app displays current team context.

## Verification

- Use case tests for role permission matrix.
- API tests for forbidden and not-found behavior.
- Manual test with two teams and two users.

## Dependencies

- Slice 2 can create the initial model; this slice deepens it.

### 4. Money And Ledger Core

## Goal

Create a financial core that can safely support transactions, reporting, invoices, and payments.

## Scope

- Implement exact money value object and currency handling.
- Model transaction types, sources, review state, categories, tags, counterparties, splits, and transfers.
- Add indexes and constraints for team, account, date, provider IDs, and duplicate detection.
- Add basic reporting queries for revenue, expenses, profit, balance, and category totals.

## Areas To Inspect

- `packages/domain`
- `packages/db`
- `packages/app`
- `packages/api`
- `apps/web`

## Acceptance Criteria

- [ ] Money operations avoid JavaScript floating point for authoritative calculations.
- [ ] Transactions support income, expense, transfer, fee, refund, and adjustment classification.
- [ ] Split transactions and tags are represented.
- [ ] Duplicate detection has a deterministic key strategy.
- [ ] Basic reports can be produced from ledger records.

## Verification

- Domain tests for money math, currency, rounding, signs, and conversions.
- Use case tests for duplicate transaction creation and split totals.
- Query tests for report totals against known fixtures.

## Dependencies

- Slice 3.

### 5. CSV Transaction Import

## Goal

Allow users to import real transaction data before live banking providers are integrated.

## Scope

- Add upload/import session model.
- Add CSV parsing, column mapping, validation, preview, duplicate detection, and commit.
- Use the same transaction normalization path that providers will use later.
- Show import progress and errors in the UI.

## Areas To Inspect

- `apps/web`
- `apps/server`
- `packages/app`
- `packages/domain`
- `packages/db`
- `packages/integrations`

## Acceptance Criteria

- [ ] User can upload a CSV and map columns.
- [ ] Invalid rows are shown before commit.
- [ ] Duplicate rows are detected before commit.
- [ ] Committed rows become team-scoped transactions.
- [ ] Import commit writes audit and outbox events.

## Verification

- Parser tests with representative CSV formats.
- Use case tests for preview, validation, duplicate detection, and commit.
- Manual import using a sample CSV.

## Dependencies

- Slice 4.

### 6. TanStack DB Sync Tracer

## Goal

Make the transaction review workflow use the intended reactive sync model.

## Scope

- Define the first sync collection for transactions.
- Add cursor-based server read endpoint.
- Add invalidation event shape.
- Connect client collection to list/update transaction state.
- Define optimistic update and server correction behavior for categorization/review.

## Areas To Inspect

- `packages/sync`
- `packages/api`
- `packages/app`
- `apps/web`
- `apps/server`

## Acceptance Criteria

- [ ] Transaction list is backed by a sync collection contract.
- [ ] Collection reads are team- and permission-scoped.
- [ ] Cursor refresh returns only relevant changes.
- [ ] Safe transaction edits update optimistically and reconcile with server state.
- [ ] Permission errors revert client state.

## Verification

- Sync contract tests.
- UI behavior test or manual verification across two browser sessions.
- Typecheck.

## Dependencies

- Slice 2.
- Slice 3.

### 7. Cloudflare Infrastructure Baseline

## Goal

Evolve the existing Cloudflare scaffold into the runtime foundation for the product.

## Scope

- Add environment-specific bindings for API Worker, R2, Queues, Durable Objects, KV where justified, and future Hyperdrive/Postgres connection.
- Document local, preview, staging, and production environment expectations.
- Ensure secrets are environment-specific and not committed.
- Keep server code deployable in the chosen Worker runtime.

## Areas To Inspect

- `packages/infra`
- `apps/server`
- `packages/env`
- Cloudflare deployment scripts/configs

## Acceptance Criteria

- [ ] Infrastructure defines the intended Cloudflare resources for at least preview/staging/prod.
- [ ] Server runtime can read typed Cloudflare bindings.
- [ ] R2 and Queue binding placeholders are usable by application code.
- [ ] Environment documentation exists.

## Verification

- Run typecheck.
- Run deployment dry run or local equivalent if available.
- Confirm no secrets are printed or committed.

## Dependencies

- Slice 1.

### 8. Outbox Dispatcher And Queue Bridge

## Goal

Turn outbox events into reliable async work and realtime invalidation inputs.

## Scope

- Add outbox event states and dispatcher behavior.
- Add job contracts and queue names.
- Add dispatcher path from outbox rows to Cloudflare Queues.
- Add dead-letter and retry metadata.
- Add job run records.

## Areas To Inspect

- `packages/db`
- `packages/app`
- `packages/jobs`
- `apps/server`
- `apps/worker`
- `packages/infra`

## Acceptance Criteria

- [ ] Mutations can write outbox events in the same transaction as state changes.
- [ ] Dispatcher publishes eligible events to queues.
- [ ] Dispatch attempts are idempotent.
- [ ] Job run state is persisted.
- [ ] Failed dispatches are observable and retryable.

## Verification

- Integration tests around transaction plus outbox commit.
- Worker/queue tests for retry and idempotency.
- Manual trigger of a known outbox event.

## Dependencies

- Slice 2.
- Slice 7.

### 9. Tenant Durable Object Realtime Fanout

## Goal

Add tenant-local realtime coordination without making Durable Objects authoritative storage.

## Scope

- Add TenantCoordinator Durable Object.
- Track connected clients and collection subscriptions.
- Receive invalidation events from dispatcher/worker.
- Fan out collection invalidation notices.
- Keep minimal transient state only.

## Areas To Inspect

- `apps/server`
- `packages/infra`
- `packages/sync`
- `apps/web`
- `packages/jobs`

## Acceptance Criteria

- [ ] Clients can subscribe to team-scoped invalidation events.
- [ ] Transaction changes in one session notify another session.
- [ ] Durable Object stores only transient coordination state.
- [ ] Reconnect behavior refreshes by server cursor.

## Verification

- Local multi-client test where one browser changes a transaction and another refreshes collection state.
- Unit tests for subscription routing where practical.
- Typecheck Worker bindings.

## Dependencies

- Slice 6.
- Slice 8.

### 10. Banking Provider Adapter Interface And Mock Provider

## Goal

Prepare the banking integration surface without committing to a real provider first.

## Scope

- Define banking provider port capabilities.
- Add mock provider implementation for local/test.
- Normalize provider accounts, balances, and transactions into canonical records.
- Preserve raw provider payloads.
- Add sync run model and status UI.

## Areas To Inspect

- `packages/integrations`
- `packages/app`
- `packages/domain`
- `packages/db`
- `packages/jobs`
- `apps/web`

## Acceptance Criteria

- [ ] Mock provider can connect a fake bank connection.
- [ ] Mock provider sync creates bank accounts and transactions.
- [ ] Sync is idempotent.
- [ ] Raw provider payloads are retained for debugging.
- [ ] UI shows connection and sync status.

## Verification

- Adapter contract tests.
- Use case tests for sync idempotency and duplicate prevention.
- Manual mock sync.

## Dependencies

- Slice 4.
- Slice 8.

### 11. First Real Banking Provider

## Goal

Connect one real banking provider through the adapter interface.

## Scope

- Implement one provider adapter based on target geography.
- Add connection flow.
- Add webhook verification and handling if provider supports it.
- Add token storage with encryption strategy.
- Add sync scheduling.

## Areas To Inspect

- `packages/integrations`
- `packages/app`
- `packages/db`
- `apps/server`
- `apps/web`
- `packages/jobs`
- `packages/env`

## Acceptance Criteria

- [ ] User can complete provider connection in a non-production environment.
- [ ] Accounts and transactions sync into canonical records.
- [ ] Webhooks are verified before mutable work.
- [ ] Provider errors map to actionable product states.
- [ ] Disconnecting provider does not delete historical records by default.

## Verification

- Provider sandbox tests where available.
- Webhook signature tests.
- Manual sandbox connection.

## Dependencies

- Slice 10.

### 12. Documents And R2 Storage

## Goal

Let users upload and store business documents securely.

## Scope

- Add document metadata and version model.
- Add R2 object storage integration.
- Add signed upload/download flow.
- Add document list/detail UI.
- Emit document uploaded events.

## Areas To Inspect

- `packages/db`
- `packages/app`
- `apps/server`
- `apps/web`
- `packages/infra`
- `packages/sync`

## Acceptance Criteria

- [ ] User can upload a document into a team.
- [ ] File content is stored in R2.
- [ ] Metadata is stored in Postgres.
- [ ] Downloads are permission-scoped.
- [ ] Upload writes audit and outbox events.

## Verification

- Use case tests for upload metadata and permission failures.
- R2 local/mock integration test.
- Manual upload/download.

## Dependencies

- Slice 3.
- Slice 7.
- Slice 8.

### 13. Inbox And Document Extraction Pipeline

## Goal

Turn uploaded or forwarded business artifacts into reviewable inbox items with extracted data.

## Scope

- Add inbox item/source model.
- Add extraction job contract and worker.
- Add extraction result versioning.
- Add review/correction UI.
- Add confidence display and correction persistence.

## Areas To Inspect

- `packages/domain`
- `packages/app`
- `packages/db`
- `packages/jobs`
- `packages/ai`
- `apps/worker`
- `apps/web`

## Acceptance Criteria

- [ ] Uploaded documents can create inbox items.
- [ ] Extraction runs asynchronously.
- [ ] Extracted fields are visible with confidence.
- [ ] User can correct extraction results.
- [ ] Corrections are versioned or traceable.

## Verification

- Extraction schema tests.
- Worker tests for success/failure paths.
- Manual upload through inbox review.

## Dependencies

- Slice 12.

### 14. Inbox-To-Transaction Matching

## Goal

Suggest and apply matches between inbox items/documents and ledger transactions.

## Scope

- Add deterministic matching engine.
- Add team alias and hard-negative memory.
- Add match suggestions with score and explanation.
- Add accept/reject flow.
- Attach accepted documents to transactions.

## Areas To Inspect

- `packages/domain`
- `packages/app`
- `packages/db`
- `apps/web`
- `packages/sync`
- Midday matching docs/code in `ref/midday`

## Acceptance Criteria

- [ ] System suggests matches using amount, currency, date, counterparty, references, sender, text, and feedback.
- [ ] Suggestions include score and explanation.
- [ ] Accepted matches attach document to transaction.
- [ ] Rejected matches are remembered.
- [ ] Low-confidence matches are never auto-applied.

## Verification

- Domain tests for scoring and hard negatives.
- Use case tests for accept/reject behavior.
- Manual review of sample receipts and transactions.

## Dependencies

- Slice 4.
- Slice 13.

### 15. Customers And Invoice Drafts

## Goal

Add the first sales workflow: customers, products/services, and draft invoices.

## Scope

- Add customer, contact, product/service, invoice, and invoice line models.
- Add invoice totals, tax, discount, and state machine rules.
- Add draft invoice editor and preview.
- Keep sending/payment out of this slice.

## Areas To Inspect

- `packages/domain`
- `packages/app`
- `packages/db`
- `packages/api`
- `apps/web`
- `packages/ui`

## Acceptance Criteria

- [ ] User can create customers and contacts.
- [ ] User can create products/services.
- [ ] User can create and edit draft invoices.
- [ ] Invoice totals are calculated by domain logic.
- [ ] Draft invoice changes are auditable where appropriate.

## Verification

- Domain tests for invoice totals and state rules.
- Use case tests for customer and draft invoice creation.
- Manual draft invoice creation.

## Dependencies

- Slice 3.
- Slice 4.

### 16. Invoice Delivery, PDF, Payments, And Recurrence

## Goal

Make invoices operational: send them, render PDFs, record payments, and generate recurring invoices.

## Scope

- Add PDF rendering path.
- Add email delivery provider port.
- Add send flow with confirmation.
- Add payment recording.
- Add recurring invoice schedule and workflow.
- Add invoice reminders.

## Areas To Inspect

- `packages/domain`
- `packages/app`
- `packages/integrations`
- `packages/jobs`
- `apps/worker`
- `apps/web`
- `packages/infra`

## Acceptance Criteria

- [ ] User can preview invoice PDF.
- [ ] User can send invoice after explicit confirmation.
- [ ] Invoice lifecycle records sent, viewed if available, paid, overdue, and void states.
- [ ] Manual payment recording updates invoice state.
- [ ] Recurring invoices generate through jobs/workflows.
- [ ] Send and payment events are audited.

## Verification

- Domain tests for lifecycle transitions.
- Integration tests for send/payment use cases.
- Manual invoice send using sandbox/dev email.

## Dependencies

- Slice 15.
- Slice 8.

### 17. Projects And Time Tracking

## Goal

Connect work tracking to customers and invoicing.

## Scope

- Add project, project member, time entry, billable rate, and billable status concepts.
- Add time entry UI.
- Add report basics for utilization and billable value.
- Add flow to convert billable time into invoice lines.

## Areas To Inspect

- `packages/domain`
- `packages/app`
- `packages/db`
- `apps/web`
- `packages/sync`

## Acceptance Criteria

- [ ] User can create projects linked to customers.
- [ ] Team members can track time.
- [ ] Time entries can be billable or non-billable.
- [ ] Billable entries can become invoice lines.
- [ ] Basic utilization and billable value reports exist.

## Verification

- Domain/use case tests for time totals and invoice conversion.
- Manual project/time/invoice flow.

## Dependencies

- Slice 15.

### 18. Reporting And Weekly Insights

## Goal

Provide trustworthy business summaries and scheduled insight generation.

## Scope

- Add report query services for profit/loss, cashflow, revenue by customer, expenses by category, unpaid invoices, tax summary, time/utilization, and inbox backlog.
- Add insight generation job.
- Add source drilldown from insights.
- Add overview dashboard widgets.

## Areas To Inspect

- `packages/app`
- `packages/db`
- `packages/ai`
- `packages/jobs`
- `apps/web`
- `packages/sync`

## Acceptance Criteria

- [ ] Overview shows key business metrics.
- [ ] Reports can filter by date range and team-owned dimensions.
- [ ] Insights cite source records.
- [ ] Weekly insight generation runs through the job system.
- [ ] Users can drill from insight to underlying records.

## Verification

- Report query tests against known fixtures.
- Insight generation tests with mocked AI provider.
- Manual dashboard review.

## Dependencies

- Slice 4.
- Slice 14.
- Slice 16.
- Slice 17.

### 19. TanStack AI Assistant Read And Suggest Tools

## Goal

Add a grounded assistant that can answer questions and make low-risk suggestions.

## Scope

- Add assistant runtime and conversation persistence.
- Add TanStack AI client interaction pattern.
- Add read tools for transactions, invoices, documents, customers, projects, and reports.
- Add suggest tools for categorization, matching, and invoice email copy.
- Enforce permission-scoped retrieval.

## Areas To Inspect

- `packages/ai`
- `packages/app`
- `packages/api`
- `apps/web`
- `packages/db`
- `packages/sync`

## Acceptance Criteria

- [ ] User can ask grounded business questions.
- [ ] Assistant responses cite or link to source records.
- [ ] Read tools respect team permissions.
- [ ] Suggest tools do not mutate authoritative state.
- [ ] Assistant messages and tool calls are persisted.

## Verification

- Tool schema tests.
- Permission/refusal tests.
- Manual assistant questions against known data.

## Dependencies

- Slice 18.

### 20. AI Draft, Mutate, And Approval Gates

## Goal

Let the assistant propose and execute approved business actions safely.

## Scope

- Add AI risk levels and approval model.
- Add draft tools for invoices, categories, and automations.
- Add mutate tools for approved safe edits.
- Add external-side-effect tools that always require explicit confirmation unless automation policy permits them.
- Add AI audit records and feedback.

## Areas To Inspect

- `packages/ai`
- `packages/app`
- `packages/domain`
- `packages/db`
- `apps/web`

## Acceptance Criteria

- [ ] AI tools declare required permission, risk, approval, audit, and rate-limit behavior.
- [ ] Draft tools create editable drafts.
- [ ] Mutating tools use application use cases.
- [ ] External side-effect tools require confirmation.
- [ ] AI-originated actions are auditable.

## Verification

- Tool approval tests.
- Use case tests proving AI actor permissions match user permissions.
- Manual assistant draft/approval flow.

## Dependencies

- Slice 19.

### 21. AI Evaluation Harness

## Goal

Make AI quality measurable before it becomes product-critical.

## Scope

- Add eval datasets and runners for categorization, matching, extraction, invoice drafting, cashflow explanation, tool selection, refusal behavior, and permission enforcement.
- Track cost, latency, accuracy, false positives, false mutations, hallucinated sources, and user corrections.
- Add release-gate guidance for AI changes.

## Areas To Inspect

- `packages/ai`
- `packages/domain`
- `packages/app`
- test tooling

## Acceptance Criteria

- [ ] Eval runner can execute deterministic fixtures.
- [ ] Eval results record key metrics.
- [ ] Permission and refusal scenarios are included.
- [ ] AI tool changes have a clear verification path.

## Verification

- Run eval suite with mocked or configured provider.
- Confirm failures are actionable.

## Dependencies

- Slice 19.
- Slice 20.

### 22. Automation Rules

## Goal

Allow users to configure event-driven automations without bypassing permissions or audit.

## Scope

- Add automation trigger/action model.
- Support domain-event triggers.
- Add action approval policy.
- Add automation run logs.
- Add initial actions for categorization, notification, draft invoice creation, and accounting export request.

## Areas To Inspect

- `packages/domain`
- `packages/app`
- `packages/jobs`
- `packages/db`
- `apps/web`

## Acceptance Criteria

- [ ] User can create a rule from supported triggers and actions.
- [ ] Automation runs are team-scoped and permissioned.
- [ ] Risky actions require approval unless explicitly configured.
- [ ] Runs are logged with inputs, outputs, and errors.

## Verification

- Use case tests for trigger/action execution.
- Manual automation triggered by a domain event.

## Dependencies

- Slice 8.
- Slice 20.

### 23. Public API, OAuth Apps, API Keys, And Webhooks

## Goal

Expose the platform safely to external developers and integrations.

## Scope

- Add API key model with hashing and scopes.
- Add OAuth app/grant model.
- Add public REST resources for core domains.
- Generate OpenAPI.
- Add idempotency for public mutations.
- Add external webhook subscriptions for outbox-backed events.

## Areas To Inspect

- `packages/api`
- `packages/auth`
- `packages/app`
- `packages/db`
- `apps/server`
- `packages/jobs`

## Acceptance Criteria

- [ ] API keys are hashed and scoped.
- [ ] Public API scopes map to product permissions.
- [ ] OpenAPI reflects public resources.
- [ ] Public mutations support idempotency keys.
- [ ] External webhook delivery is retryable and auditable.

## Verification

- API contract tests.
- Scope/permission tests.
- Webhook delivery tests with retry/failure cases.

## Dependencies

- Slice 3.
- Slice 8.

### 24. Accounting, Payments, Messaging, And Email Provider Adapters

## Goal

Expand integrations through stable provider boundaries.

## Scope

- Add adapter contracts for accounting, payments, messaging, and email.
- Implement first useful provider in each chosen category where product priorities require it.
- Add integration connection status UI.
- Add provider error mapping and sync runs.

## Areas To Inspect

- `packages/integrations`
- `packages/app`
- `packages/jobs`
- `packages/db`
- `apps/web`

## Acceptance Criteria

- [ ] Each adapter declares capabilities.
- [ ] Tokens/secrets are stored securely.
- [ ] Provider failures are visible and actionable.
- [ ] Syncs are idempotent and logged.
- [ ] Disabling an integration does not delete historical product data by default.

## Verification

- Adapter contract tests.
- Provider sandbox tests where available.
- Manual integration status review.

## Dependencies

- Slice 16.
- Slice 23.

### 25. Desktop Quick Capture And Native Shell Deepening

## Goal

Make the desktop app useful beyond simply opening the web app.

## Scope

- Add deep links.
- Add tray and native notifications.
- Add file drop/share capture into inbox.
- Add optional quick capture or command palette window.
- Keep business behavior in the web/API/application layers.

## Areas To Inspect

- `apps/desktop`
- `apps/web`
- `packages/app`
- `packages/api`
- `packages/ui`

## Acceptance Criteria

- [ ] Desktop app can deep link into product records.
- [ ] User can send a local file into the inbox.
- [ ] Native notifications open relevant app context.
- [ ] Desktop-specific code does not duplicate business rules.

## Verification

- Manual desktop smoke test.
- File capture test with a sample document.
- Typecheck/build desktop app.

## Dependencies

- Slice 12.
- Slice 13.

### 26. Observability, Admin Tools, And Operations

## Goal

Make production behavior visible and recoverable.

## Scope

- Add structured logs, request IDs, actor/team/operation metadata, and error reporting.
- Add metrics for API latency, queue depth, job failures, provider failures, sync lag, AI cost, and dead letters.
- Add admin views or scripts for job runs, outbox events, provider syncs, audit logs, and dead letters.
- Add data export/deletion workflows.

## Areas To Inspect

- `apps/server`
- `apps/worker`
- `packages/app`
- `packages/db`
- `packages/jobs`
- `packages/infra`

## Acceptance Criteria

- [ ] Requests and jobs can be traced by request ID.
- [ ] Job failures and dead letters are visible.
- [ ] Audit logs can be searched by team/resource/action.
- [ ] Provider sync failures are actionable.
- [ ] Data export/deletion workflows exist or are explicitly staged.

## Verification

- Force a controlled job failure and confirm observability.
- Review logs for PII/secret redaction.
- Run data export/deletion tests if implemented in this slice.

## Dependencies

- Slice 8.
- Slice 11.
- Slice 16.
- Slice 20.

### 27. Security Hardening And Release Gates

## Goal

Raise confidence before production use of sensitive business data.

## Scope

- Enforce CI checks: typecheck, lint/format, unit tests, integration tests, migration validation, contract tests, Worker bundle checks, and secret scans.
- Add tenant isolation tests across major resources.
- Add rate limits to public and assistant endpoints.
- Add secure file URL policies.
- Add webhook verification coverage.
- Add no-ignored-TypeScript-errors policy.

## Areas To Inspect

- Root package scripts
- `apps/server`
- `apps/web`
- `packages/api`
- `packages/app`
- `packages/db`
- `packages/infra`
- CI configuration if added

## Acceptance Criteria

- [x] CI or local verification command gates type, lint, format, and tests.
- [x] Tenant isolation tests exist for critical resources.
- [x] Public and assistant endpoints are rate-limited.
- [x] File access is permission-scoped.
- [x] Webhook verification is tested.

## Verification

- Run full check suite.
- Run integration tests.
- Manually review configuration for ignored build/type errors.

## Dependencies

- Most product slices benefit from this, but it should be completed before production launch.

## Dependencies

- Slice 1 should happen first.
- Slice 2 is the tracer and should happen before building broad domain surface.
- Slices 3 through 9 build the platform foundation.
- Slices 10 and 11 depend on ledger and job foundations.
- Slices 12 through 14 build documents, inbox, and matching on top of ledger/storage/jobs.
- Slices 15 and 16 build invoicing after identity, money, and audit are stable.
- Slices 17 and 18 add work management and reporting once ledger/invoicing exist.
- Slices 19 through 22 add AI and automations after enough product data exists to ground them.
- Slices 23 and 24 expose and expand integrations after permissions and application boundaries are stable.
- Slices 25 through 27 harden desktop, operations, and release confidence.

## Suggested First Slice

Start with Slice 1, then immediately do Slice 2.

Slice 1 prevents architectural drift. Slice 2 proves the architecture through an observable workflow without requiring real banking providers, document AI, payments, or public API complexity. If Slice 2 feels too large during execution, keep the same end-to-end shape but reduce the UI to a single transaction row and one category action.
