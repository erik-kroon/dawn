# Dawn End-to-End Implementation Plan

## Solution Approach

Run this as an implementation goal in the active workspace. The agent personally carries the work forward slice by slice, keeps architecture coherent, updates docs and ADRs as decisions land, verifies behavior before checkpoints, and does not spawn worker agents unless the user explicitly changes that instruction.

Current baseline is a partially implemented Dawn repo, not a blank starter. Accepted ADRs `0001` through `0011` exist; `packages/domain` and `packages/app` exist; the transaction review tracer has active implementation across domain/app/db/api/web; implementation tracking may already exist under `docs/work`. Start by inventorying the current working tree and validating what is already true before editing further.

## Ordered Steps

### 1. Inventory Current Work And Rebaseline

Touch:

- `docs/work/ORCHESTRATION.md` or a new implementation tracking file under `docs/work`
- `docs/work/VERTICAL-SLICES.md`
- `goals/dawn-end-to-end-orchestration/facts.md`
- `goals/dawn-end-to-end-orchestration/facts.meta.json`

Work:

- Run `git status --short` and inspect existing diffs before editing overlapping files.
- Treat existing changes as user or prior-agent work. Preserve them and build on them.
- Record the implementation baseline, completed slice evidence, active partial work, checks already run, blockers, and next slice in `docs/work`.
- Use `docs/work/VERTICAL-SLICES.md` as the backlog and update progress as implementation lands.

Verification:

- `git status --short`
- Manual check that implementation tracking records the current baseline and does not claim incomplete work is done.

### 2. Verify Or Update ADR Baseline

Touch:

- `docs/adr/`
- `docs/adr/README.md`
- `AGENTS.md`
- `CONTEXT.md`
- `CONTEXT-MAP.md`

Work:

- Review ADRs `0001` through `0011` against the PRD, accepted facts, and current code.
- Update only if decisions are missing, contradicted by implementation, or too vague to guide the next slice.
- Add new ADRs before spreading major new decisions, especially for release gates, worker/job boundaries, data lifecycle, security posture, or provider boundaries if existing ADRs do not cover them.

Verification:

- Manual ADR review against `docs/work/IMPLEMENTATION-PRD.md`.
- Link check if a markdown checker exists or is added.

### 3. Complete And Harden The Transaction Review Tracer

Touch:

- `packages/domain/src/`
- `packages/app/src/`
- `packages/db/src/schema/`
- `packages/db/src/transaction-review.ts`
- `packages/api/src/routers/`
- `apps/server/src/index.ts`
- `apps/web/src/routes/_auth/dashboard.tsx`
- `packages/ui/src/components/`

Work:

- Preserve the intended tracer behavior while moving touched code toward the final architecture.
- Split broad single-file domain/app code into durable modules where it improves locality: actor/team/permission, money, transaction review, audit/outbox, idempotency.
- Confirm transaction review enforces team membership, permissions, idempotency replay, audit, and outbox in one transaction.
- Move UI toward Coss primitives/particles for selects, tables, forms, buttons, and feedback. Read `.agents/skills/coss/SKILL.md` and relevant primitive docs before UI changes.
- Keep the initial sync shape visible, even if the first implementation still refreshes by query.

Verification:

- `bun test packages/app/src/transaction-review.test.ts`
- Relevant domain tests, including money and transaction review tests if present.
- `bun run check-types`
- `bun run dev:server` and `bun run dev:web`, then manually review team selection and transaction review.

### 4. Deepen Team Context And Permissions

Touch:

- `packages/domain/src/actor*`
- `packages/domain/src/team*`
- `packages/app/src/team*`
- `packages/db/src/schema/`
- `packages/api/src/routers/`
- `apps/web/src/routes/`

Work:

- Add durable team, membership, invite, role, and permission concepts.
- Resolve actor, team, request ID, locale/timezone, permissions, and idempotency context before use cases.
- Add team switching and permission-aware navigation in the web app.
- Ensure every team-scoped query and mutation denies cross-team access.

Verification:

- Use-case tests for the role/permission matrix.
- API tests or contract tests for forbidden and not-found behavior.
- Manual test with at least two teams and two users or seeded actors.
- `bun run check-types`

### 5. Build Money And Ledger Core

Touch:

- `packages/domain/src/money*`
- `packages/domain/src/ledger*`
- `packages/app/src/transactions*`
- `packages/db/src/schema/`
- `packages/api/src/routers/`
- `apps/web/src/routes/`

Work:

- Replace narrow tracer money handling with final exact money value objects and rounding rules.
- Add accounts, transactions, categories, tags, counterparties, splits, transfers, duplicate keys, and report-ready ledger records.
- Keep authoritative calculations out of UI and route handlers.
- Add report query foundations for revenue, expenses, profit, balance, and category totals.

Verification:

- Domain tests for money parsing, arithmetic, rounding, signs, currencies, and conversion metadata.
- Use-case tests for duplicate detection and split totals.
- Query tests for known report fixtures.
- `bun run check-types`

### 6. Add CSV Import Before Live Banking

Touch:

- `packages/domain/src/import*`
- `packages/app/src/import*`
- `packages/db/src/schema/`
- `packages/integrations/` if introduced here
- `apps/web/src/routes/`

Work:

- Add import sessions, CSV parsing, column mapping, validation, preview, duplicate detection, and commit.
- Feed committed rows through the same canonical transaction normalization path that provider sync will use.
- Audit and emit outbox events on commit.

Verification:

- Parser tests for representative CSV formats.
- Use-case tests for preview, invalid rows, duplicates, and commit.
- Manual import with a sample CSV.
- `bun run check-types`

### 7. Add TanStack DB Sync Tracer

Touch:

- `packages/sync/`
- `packages/api/src/routers/`
- `packages/app/src/`
- `apps/web/src/`
- `apps/server/src/index.ts`

Work:

- Introduce `packages/sync` with collection contracts, authorization requirements, cursor policy, conflict policy, mutation declarations, and redaction rules.
- Move transaction review list/update to the first sync collection.
- Keep server-owned authorization and correction behavior explicit.

Verification:

- Sync contract tests.
- Manual two-session test or UI behavior test for refresh/reconcile.
- `bun run check-types`

### 8. Establish Cloudflare Infrastructure, Jobs, Outbox Dispatch, And Realtime

Touch:

- `packages/infra/`
- `packages/env/src/`
- `packages/jobs/`
- `apps/worker/`
- `packages/db/src/schema/`
- `packages/app/src/`
- `packages/sync/`

Work:

- Add Cloudflare bindings for API Worker, R2, Queues, Durable Objects, KV where justified, and Hyperdrive/Postgres connection expectations.
- Add job contracts, queue names, payload schemas, retry/idempotency policy, job run records, and dead-letter metadata.
- Add outbox dispatcher behavior that publishes eligible outbox rows to queues idempotently.
- Add `TenantCoordinator` Durable Object for transient tenant-local realtime fanout and collection invalidations.

Verification:

- Typecheck Worker bindings.
- Integration tests for transaction plus outbox commit and dispatcher retry/idempotency.
- Local/manual trigger of a known outbox event.
- Local multi-client invalidation test where practical.
- Confirm no secrets are committed.

### 9. Add Banking Adapter Boundary, Mock Provider, Then One Real Provider

Touch:

- `packages/integrations/`
- `packages/domain/src/banking*`
- `packages/app/src/banking*`
- `packages/db/src/schema/`
- `packages/jobs/`
- `apps/web/src/`
- `packages/env/src/`

Work:

- Define banking provider ports and a mock provider first.
- Normalize accounts, balances, transactions, provider IDs, sync runs, and raw payload retention.
- Add connection and sync status UI.
- Add one real provider only after the mock contract is verified. If live credentials are missing, finish sandbox/test harnesses and mark live wiring blocked.

Verification:

- Adapter contract tests.
- Use-case tests for sync idempotency and duplicate prevention.
- Webhook signature tests if provider webhooks exist.
- Manual mock sync, plus sandbox connection when credentials exist.

### 10. Build Documents, R2 Storage, Inbox, Extraction, And Matching

Touch:

- `packages/domain/src/document*`
- `packages/domain/src/inbox*`
- `packages/domain/src/matching*`
- `packages/app/src/document*`
- `packages/app/src/inbox*`
- `packages/db/src/schema/`
- `packages/jobs/`
- `packages/ai/`
- `packages/sync/`
- `apps/web/src/`
- `packages/infra/`

Work:

- Add document metadata/version model and R2 signed upload/download.
- Add inbox items, sources, extraction job contracts, extraction result versioning, confidence, and correction persistence.
- Add deterministic inbox-to-transaction matching with score, explanation, aliases, hard negatives, accept/reject, and low-confidence review.
- Use local/test extraction adapters before live document AI credentials.

Verification:

- Use-case tests for upload metadata, permissions, extraction results, correction, and matching accept/reject.
- Domain tests for scoring, hard negatives, and no low-confidence auto-apply.
- R2 mock/local integration test.
- Manual upload, extraction review, and match flow.

### 11. Build Sales, Invoicing, Payments, Recurrence, Projects, And Time

Touch:

- `packages/domain/src/customer*`
- `packages/domain/src/invoice*`
- `packages/domain/src/project*`
- `packages/domain/src/time*`
- `packages/app/src/`
- `packages/db/src/schema/`
- `packages/integrations/`
- `packages/jobs/`
- `apps/web/src/`

Work:

- Add customers, contacts, products/services, draft invoices, invoice lines, totals, taxes, discounts, and lifecycle state machine.
- Add PDF preview/rendering, email delivery port, send confirmation, manual payments, payment provider events, recurring schedules, reminders, and audit.
- Add projects, project members, time entries, billable rates/status, utilization, billable value, and conversion into invoice lines.

Verification:

- Domain tests for invoice totals, lifecycle transitions, payment state, recurrence rules, and time totals.
- Use-case tests for customer, draft invoice, send, payment, recurring generation, and time-to-invoice conversion.
- Manual draft invoice, PDF preview, send through sandbox/dev email, payment recording, and time conversion.

### 12. Build Reporting, Insights, AI Assistant, Approvals, Evals, And Automations

Touch:

- `packages/app/src/reports*`
- `packages/ai/`
- `packages/jobs/`
- `packages/domain/src/automation*`
- `packages/app/src/automation*`
- `packages/db/src/schema/`
- `apps/web/src/`

Work:

- Add report query services for P&L, cashflow, revenue by customer, expenses by category, unpaid invoices, tax summary, time/utilization, and inbox backlog.
- Add weekly insight generation with source drilldown.
- Add TanStack AI assistant runtime, persisted conversations/tool calls, read/suggest tools, draft tools, mutate tools, approval gates, risk levels, audit, and feedback.
- Add eval datasets/runners for categorization, matching, extraction, invoice drafting, cashflow explanation, tool selection, refusal, and permission enforcement.
- Add event-driven automations with permissioned actions, approval policy, and run logs.

Verification:

- Report query tests against known fixtures.
- Tool schema, permission/refusal, approval, and AI actor tests.
- Eval runner with deterministic fixtures and mocked/configured provider.
- Manual assistant read/suggest/draft/approval flow.
- Manual automation triggered from a domain event.

### 13. Build Public API, Webhooks, And Integration Expansion

Touch:

- `packages/api/`
- `packages/auth/`
- `packages/app/`
- `packages/db/src/schema/`
- `packages/jobs/`
- `apps/server/src/`
- `packages/integrations/`
- `apps/web/src/`

Work:

- Add hashed API keys, OAuth apps/grants, scopes, rate limits, and actor/team resolution for API clients.
- Add public REST resources backed by application use cases.
- Generate OpenAPI from typed contracts.
- Add idempotency for public mutations.
- Add external webhook subscriptions backed by outbox delivery.
- Add accounting, payments, messaging, and email adapter contracts and first useful providers where credentials or sandboxes permit.

Verification:

- API contract tests.
- Scope/permission tests.
- Webhook delivery retry/failure tests.
- Adapter contract tests and sandbox tests where available.
- Manual public API smoke test.

### 14. Deepen Desktop, Observability, Operations, Security, And Release Gates

Touch:

- `apps/desktop/`
- `apps/web/src/`
- `apps/server/src/`
- `apps/worker/`
- `packages/app/`
- `packages/db/`
- `packages/jobs/`
- `packages/infra/`
- root scripts or CI config

Work:

- Add desktop deep links, tray, notifications, file handoff into inbox, and optional quick capture without duplicating business rules.
- Add structured logs, request IDs, actor/team/operation metadata, metrics, job/dead-letter visibility, provider sync visibility, audit search, and data export/deletion workflows.
- Add release gates for typecheck, lint/format, tests, integration tests, migration validation, contract tests, Worker bundle checks, and secret scans.
- Add tenant isolation tests across critical resources, rate limits, secure file URL policy, webhook verification coverage, and a no-ignored-TypeScript-errors policy.

Verification:

- Desktop build and manual desktop smoke test.
- Controlled job failure with observable logs/metrics/dead-letter state.
- PII/secret redaction review.
- Full check suite after release gates exist.
- Tenant isolation, rate limit, file permission, webhook verification, and migration tests.

## Implementation Protocol

- Work in the active workspace and keep changes scoped to the current slice.
- Before editing a file with existing changes, inspect it and preserve user or prior-agent work.
- Prefer vertical implementation: domain/app/db/api/UI/test changes that deliver a coherent behavior.
- Add or update ADRs before major architecture decisions spread into code.
- Use local/test adapters and fixtures for external services until live credentials or deployed infrastructure are available.
- Before every checkpoint or commit, inspect the diff, verify acceptance criteria, run relevant checks, update implementation tracking under `docs/work`, and stage paths intentionally.

## Risks And Open Questions

- Live provider work may need unavailable banking, payment, email, AI, or Cloudflare credentials. Continue with ports, fake adapters, fixtures, and local harnesses; mark only live wiring blocked.
- The current repo has active implementation changes. Rebaseline from the working tree before changing overlapping files.
- The current root `bun run check` runs `oxfmt --write`; treat it as a formatting command that mutates files and inspect formatting diffs before committing.
- The full goal is large. Completion must be tracked in `docs/work`; do not rely on memory or chat summaries.
- `apps/worker`, `packages/jobs`, `packages/integrations`, `packages/sync`, and `packages/ai` should be introduced at the slice where they first own real contracts.
