# Architecture Vertical Work Plan: Dawn After Midday Review

Triage: ready-for-agent
Publication: Local repo artifact. No project issue tracker or remote is assumed.
Source material: final Dawn architecture review, Dawn/Midday architecture comparison, `docs/work/VERTICAL-SLICES.md`, `docs/work/IMPLEMENTATION-PRD.md`, `docs/PRD.md`, `CONTEXT.md`, `CONTEXT-MAP.md`, and `ref/midday`.
Status: Draft for implementation planning
Date: 2026-06-15

## Outcome

When all slices are done, Dawn keeps the architecture it was designed around while absorbing the useful production lessons from Midday:

- Worker jobs, public API routes, oRPC handlers, sync sockets, automations, AI tools, and UI mutations call application use cases instead of owning business behavior.
- `packages/app` is feature-modular but still exposes a stable `@dawn/app` public interface.
- `packages/domain` contains focused pure domain modules instead of one large mixed index.
- Job dispatch, outbox recovery, retry behavior, and job run records are owned by a deep job runner module.
- Actor and Team request intake is consistent across session users, API keys, OAuth apps, system jobs, assistant tools, provider webhooks, and realtime sync.
- Public API operations are contract-backed: one operation definition drives input parsing, scope requirements, idempotency policy, response mapping, and OpenAPI shape.
- TanStack DB sync collections have one authorization, cursor, invalidation, and realtime fanout contract.
- Drizzle persistence keeps shared implementation hidden while app use cases depend on narrower repository ports.
- Dawn has Midday-level operational visibility, provider package discipline, public API breadth, and dashboard feature decomposition without copying Midday's route-to-query business architecture.
- Previously blocked DB, provider, browser, Cloudflare, desktop, and CI verification gates are explicit and repeatable.

## Slice Strategy

The first seven slices are fixed to the final architecture review spine. The review has six candidates; the first candidate is split into two executable slices because export/deletion workflows and document extraction workflows have different runtime adapters and tests:

1. Move data export completion into app.
2. Finish data workflow mutation locality.
3. Deepen the outbox and job runner.
4. Deepen Actor and Team intake.
5. Narrow the persistence seam.
6. Deepen Public API operation contracts.
7. Make Sync collection authorization one seam.

After the first seven, the plan moves through feature-sized extractions and product/ops maturity work. Avoid horizontal tasks like "split app", "split domain", "build worker", or "cleanup dashboard" unless the slice produces a working boundary or an observable product/runtime behavior.

## Horizontal Temptations To Avoid

- Do not split all of `packages/app/src/index.ts` in one pass. Extract feature modules only after each feature has stable tests and public exports.
- Do not split all Drizzle persistence before narrowing at least one app repository port.
- Do not add a worker app that duplicates server queue handling without first moving mutation behavior behind app use cases.
- Do not expand public API resources by calling DB query modules directly. Every route must remain use-case-backed.
- Do not decompose dashboard UI by moving business rules into React components.
- Do not make verification a paper checklist only. Each gate needs a command, prerequisite, or explicit blocked/manual reason.

## Ordered Slices

### 1. Move Data Export Completion Into App

## Goal

Move team data export completion and audit behavior out of server worker code and into an application use case.

## Scope

- Create or deepen an Operations use case for completing a team data export.
- Pass storage behavior as an adapter so app owns workflow semantics while server owns R2/runtime access.
- Preserve current export snapshot, object key, source outbox event, audit payload, idempotency key, and returned result shape.
- Leave server queue code responsible only for job deserialization, runtime adapter construction, use case call, and retry classification.

## Areas To Inspect

- `apps/server/src/index.ts`
- `apps/server/src/data-export.ts`
- `apps/server/src/data-export.test.ts`
- `packages/app/src/index.ts`
- `packages/app/src/operations.test.ts`
- `packages/db/src/dawn-repository.ts`

## Acceptance Criteria

- [ ] Data export worker code no longer appends audit events directly.
- [ ] Export completion is represented as an app-layer command/use case.
- [ ] Storage writes are injected through a narrow adapter or callback.
- [ ] The use case owns audit event names, idempotency behavior, and operation result shape.
- [ ] Existing data export tests still prove archive content, object key, source outbox event, and audit behavior.
- [ ] No unrelated worker job behavior changes.

## Verification

- `bun test apps/server/src/data-export.test.ts packages/app/src/operations.test.ts`
- `bun run check-types`

## Dependencies

- None. This is the first tracer slice from the final architecture review.

### 2. Finish Data Workflow Mutation Locality

## Goal

Move the remaining sensitive data workflow decisions out of worker helper modules and into app use cases.

## Scope

- Move team data deletion gating and audit behavior behind an Operations app use case.
- Move document extraction pre-checks and mutation sequencing behind a Documents/Inbox app use case.
- Keep OCR/extraction runtime behavior injectable so app does not import provider or Worker runtime dependencies.
- Keep queue handlers thin: parse job, construct runtime adapters, call use case, classify failure.

## Areas To Inspect

- `apps/server/src/index.ts`
- `apps/server/src/data-export.ts`
- `apps/server/src/document-extraction.ts`
- `apps/server/src/document-extraction.test.ts`
- `packages/app/src/index.ts`
- `packages/app/src/operations.test.ts`
- `packages/app/src/inbox-extraction.test.ts`

## Acceptance Criteria

- [ ] Team deletion workflow no longer appends audit events directly from server queue code.
- [ ] Document extraction helper no longer performs repository pre-checks before calling app.
- [ ] App use cases own the workflow state transition, audit, outbox, and idempotency semantics.
- [ ] Runtime adapters for storage and extraction remain outside app/domain packages.
- [ ] Queue branches remain behaviorally stable for retryable and non-retryable failures.

## Verification

- `bun test apps/server/src/data-export.test.ts apps/server/src/document-extraction.test.ts`
- `bun test packages/app/src/operations.test.ts packages/app/src/inbox-extraction.test.ts`
- `bun run check-types`

## Dependencies

- Slice 1.

### 3. Deepen The Outbox And Job Runner

## Goal

Create one deep job runner boundary that owns outbox claim, stale recovery, fanout mapping, job run records, and handler routing.

## Scope

- Introduce a job runner module around current outbox dispatch and queue message mapping.
- Keep job payload schemas and retry policies stable.
- Move execution routing out of long server `if`/switch chains where practical.
- Make Cloudflare Queues a runtime adapter, not the owner of job semantics.
- Make stuck `dispatching` recovery and retry behavior explicit in tests.

## Areas To Inspect

- `packages/app/src/index.ts`
- `packages/app/src/outbox-dispatch.test.ts`
- `packages/jobs/src/index.ts`
- `packages/db/src/dawn-repository.ts`
- `apps/server/src/index.ts`
- `apps/server/src/outbox-queue.ts`

## Acceptance Criteria

- [ ] Outbox dispatch behavior is testable through one job runner interface.
- [ ] Claim, dispatch, mark-success, mark-failure, retry delay, and stale recovery rules are local to the runner/app boundary.
- [ ] Queue fanout still emits the same message schemas and idempotency keys.
- [ ] Server runtime registers handlers instead of owning job semantics inline.
- [ ] Job run records remain connected to source outbox events.

## Verification

- `bun test packages/app/src/outbox-dispatch.test.ts`
- `bun test packages/jobs`
- `bun run check-types`

## Dependencies

- Slices 1 and 2 are recommended first so the runner does not preserve worker-side mutation leaks.

### 4. Deepen Actor And Team Intake

## Goal

Make Actor and Team request intake one consistent boundary across app entrypoints.

## Scope

- Define a shared resolved request shape for application entrypoints.
- Normalize session user, API key, OAuth app, system job, assistant, provider webhook, and websocket actor intake.
- Centralize team precedence, team mismatch behavior, request ID propagation, locale/timezone defaults, and idempotency metadata extraction where appropriate.
- Keep actual permission decisions inside app use cases.

## Areas To Inspect

- `packages/api/src/context.ts`
- `packages/api/src/routers/index.ts`
- `apps/server/src/index.ts`
- `apps/server/src/tenant-sync.ts`
- `packages/app/src/index.ts`
- `packages/domain/src/index.ts`
- `packages/auth`

## Acceptance Criteria

- [ ] oRPC, public API, websocket sync, worker jobs, and system calls use the same resolved request shape or explicit variants of it.
- [ ] Actor identity formatting is not reimplemented in each route adapter.
- [ ] Team mismatch and team selection behavior is centralized and tested.
- [ ] Use cases still enforce permissions based on domain/app rules.
- [ ] Existing API, public API, and sync behavior remains stable.

## Verification

- API router/context tests.
- Public API tests.
- Tenant sync/coordinator tests.
- `bun run check-types`

## Dependencies

- None, but it should complete before broad public API and sync expansion.

### 5. Persistence Seam Tracer

## Goal

Narrow one app repository port and prove that Drizzle persistence can be split safely without weakening the app boundary.

## Scope

- Choose one feature area with strong tests, preferably Operations after Slices 1-3.
- Introduce a smaller repository port for that feature's use cases.
- Keep the Drizzle implementation deep: table joins, row mapping, transactions, storage references, and shared persistence details stay hidden.
- Keep stable public exports from `@dawn/app`.

## Areas To Inspect

- `packages/app/src/index.ts`
- `packages/app/src/operations.test.ts`
- `packages/db/src/dawn-repository.ts`
- `packages/db/src/dawn-repository.integration.test.ts`
- `packages/api/src/router.test.ts`

## Acceptance Criteria

- [ ] One feature no longer needs the full `DawnRepository` surface in its use case signatures or tests.
- [ ] Tests for that feature fake fewer unrelated repository methods.
- [ ] The concrete Drizzle adapter remains compatible with current server/API assembly.
- [ ] Existing transaction behavior and outbox/audit persistence remain stable.
- [ ] The change establishes a repeatable pattern for later repository narrowing.

## Verification

- Focused app tests for the selected feature.
- Focused DB repository tests if the touched methods have integration coverage.
- `bun run check-types`

## Dependencies

- Slices 1-3 are recommended first.

### 6. Public API Operation Contract Tracer

## Goal

Move one public API resource to an operation-contract model that owns route facts, docs, idempotency, scope, and command mapping.

## Scope

- Start with one resource, preferably transactions, because it already exercises listing, mutation, permissions, and idempotency.
- Define operation contracts for method, path, input schema, required scope, idempotency requirement, response schema, error mapping, and OpenAPI metadata.
- Make the Hono route registration consume the operation contract instead of manually repeating route facts.
- Keep concrete repository/provider assembly in server runtime code.

## Areas To Inspect

- `apps/server/src/index.ts`
- `apps/server/src/public-api.test.ts`
- `apps/server/src/rate-limit.ts`
- `packages/api/src/routers/index.ts`
- `packages/api/package.json`
- `apps/web/src/routes/_auth/oauth/-authorize-helpers.ts`

## Acceptance Criteria

- [ ] One public resource is registered from operation contracts.
- [ ] OpenAPI generation and route execution consume the same operation definitions.
- [ ] Scope checks and idempotency extraction are not handwritten separately for each moved operation.
- [ ] Existing public API response status and error behavior is preserved.
- [ ] Server assembly remains the place where concrete runtime adapters are constructed.

## Verification

- `bun test apps/server/src/public-api.test.ts apps/server/src/rate-limit.test.ts`
- `bun run check-types`

## Dependencies

- Slice 4 is recommended first.

### 7. Sync Collection Authorization Contract

## Goal

Make sync collection authorization, cursor policy, invalidation mapping, and Durable Object fanout one tested contract.

## Scope

- Start with the existing transactions sync collection.
- Define the collection contract: collection name, authorized actor/team request, cursor policy, projection query, invalidation event mapping, mutation capability declarations, and redaction rules.
- Make server websocket auth, app query, and Durable Object fanout consume that contract instead of duplicating assumptions.
- Preserve the current web transaction sync behavior.

## Areas To Inspect

- `packages/sync/src/index.ts`
- `packages/app/src/index.ts`
- `apps/server/src/index.ts`
- `apps/server/src/tenant-sync.ts`
- `apps/server/src/tenant-coordinator.ts`
- `apps/web/src/sync/transactions.ts`

## Acceptance Criteria

- [ ] Transactions sync authorization is represented in one collection contract.
- [ ] Cursor policy and invalidation mapping are tested through the same contract.
- [ ] Durable Object fanout remains a projection/coordination mechanism, not the authoritative data store.
- [ ] The web sync client behavior remains stable.
- [ ] Adding another collection later has an obvious contract shape to copy.

## Verification

- Tenant sync/coordinator tests.
- Web sync typecheck.
- `bun run check-types`

## Dependencies

- Slice 4 is recommended first.

### 8. Extract Operations App Module

## Goal

Extract Operations use cases and types from the large app index into a focused app module while preserving `@dawn/app` exports.

## Scope

- Move operations workspace, team data export, team data deletion, audit/outbox-related operations queries, and job-visible operations commands into a feature module.
- Keep public exports stable through `packages/app/src/index.ts` or a barrel.
- Keep app-layer behavior unchanged after extraction.
- Use the module to prove the app extraction pattern before moving larger product areas.

## Areas To Inspect

- `packages/app/src/index.ts`
- `packages/app/src/operations.test.ts`
- `apps/server/src/data-export.ts`
- `apps/server/src/index.ts`
- `packages/db/src/dawn-repository.ts`

## Acceptance Criteria

- [ ] Operations commands, result types, and local helpers live in a feature module.
- [ ] External imports from `@dawn/app` keep working.
- [ ] Operations tests remain focused and pass without broad fixture churn.
- [ ] No DB, HTTP, Worker, provider, or UI runtime dependencies enter the app module.
- [ ] The extraction pattern is documented by code organization, not a new process document.

## Verification

- `bun test packages/app/src/operations.test.ts`
- `bun test apps/server/src/data-export.test.ts`
- `bun run check-types`

## Dependencies

- Slices 1-3.

### 9. Extract Banking/Ledger App Module And Provider Registry

## Goal

Extract Banking and Ledger app behavior and centralize provider adapter selection behind app/integration ports.

## Scope

- Move bank connections, sync, disconnect, imported transactions, transaction review, CSV import, duplicate detection, matching-facing ledger behavior, and report-facing ledger commands into a feature module.
- Introduce or deepen a provider registry so callers pass actor/team/connection intent instead of choosing concrete provider adapters.
- Keep provider normalization and raw payload preservation outside domain and behind app-owned ports.
- Preserve existing transaction review, bank sync, import, audit, and outbox behavior.

## Areas To Inspect

- `packages/app/src/index.ts`
- `packages/app/src/transaction-review.test.ts`
- `packages/app/src/integrations.test.ts`
- `packages/domain/src/index.ts`
- `packages/integrations/src`
- `packages/api/src/routers/index.ts`
- `apps/server/src/index.ts`

## Acceptance Criteria

- [ ] Banking/Ledger use cases live in a focused app module.
- [ ] oRPC and worker callers no longer own provider adapter selection rules.
- [ ] The app/integration boundary owns provider mismatch, connection lookup, audit, idempotency, and outbox behavior.
- [ ] Provider adapters remain replaceable and do not import app internals beyond declared ports/contracts.
- [ ] Existing bank sync and transaction review tests remain behaviorally stable.

## Verification

- Banking, integration, and transaction review app tests.
- API router tests for bank sync entrypoints.
- `bun run check-types`

## Dependencies

- Slice 4 is recommended.
- Slice 8 is recommended to establish app module extraction style.

### 10. Extract Billing App Module

## Goal

Extract customers, products, invoices, payments, recurring invoices, invoice sending, and reminders into a Billing app module.

## Scope

- Move Billing commands, results, repository ports, local helpers, and provider ports into a feature module.
- Preserve exact money behavior, invoice lifecycle rules, audit, outbox, idempotency, PDF/render/email adapter boundaries, and public API behavior.
- Keep the domain invoice state machine pure and app orchestration in app.

## Areas To Inspect

- `packages/app/src/index.ts`
- `packages/app/src/billing.test.ts`
- `packages/domain/src/index.ts`
- `packages/db/src/dawn-repository.ts`
- `packages/api/src/routers/index.ts`
- `apps/server/src/index.ts`

## Acceptance Criteria

- [ ] Billing use cases live in a focused app module.
- [ ] Invoice rendering/email/payment provider dependencies remain ports/adapters.
- [ ] Invoice totals and lifecycle behavior stay covered by existing tests.
- [ ] Public API and oRPC billing calls keep stable behavior.
- [ ] No UI or transport concerns enter Billing app code.

## Verification

- `bun test packages/app/src/billing.test.ts`
- Public API and API router tests for billing resources.
- `bun run check-types`

## Dependencies

- Slice 8 recommended.

### 11. Extract Documents And Inbox App Module

## Goal

Extract document, inbox, extraction, and matching workflows into a Documents/Inbox app module.

## Scope

- Move document upload/download commands, inbox item commands, extraction workflows, document matching, accepted/rejected match behavior, and archive flows.
- Keep storage, OCR/extraction, and email/message providers as adapters.
- Preserve raw document metadata, extraction versioning behavior, confidence/matching semantics, audit, outbox, and idempotency.

## Areas To Inspect

- `packages/app/src/index.ts`
- `packages/app/src/inbox-extraction.test.ts`
- `packages/app/src/inbox-matching.test.ts`
- `apps/server/src/document-extraction.ts`
- `apps/server/src/index.ts`
- `packages/db/src/dawn-repository.ts`

## Acceptance Criteria

- [ ] Documents/Inbox use cases live in a focused app module.
- [ ] Storage and extractor runtimes remain outside app/domain.
- [ ] Document extraction and inbox matching tests remain behaviorally stable.
- [ ] The module exposes a clear boundary for future provider and assistant tool integrations.
- [ ] No matching or extraction decisions remain hidden in route/worker helpers.

## Verification

- `bun test packages/app/src/inbox-extraction.test.ts packages/app/src/inbox-matching.test.ts`
- `bun test apps/server/src/document-extraction.test.ts`
- `bun run check-types`

## Dependencies

- Slices 1-2.
- Slice 8 recommended.

### 12. Extract Projects And Reporting App Module

## Goal

Extract projects, time entries, report overview, and weekly insights into feature app modules or one coherent Projects/Reporting module.

## Scope

- Move project and time-entry use cases into a project module.
- Move reporting queries and weekly insight generation into a reporting module or a paired module if their repository/data needs are still tightly coupled.
- Preserve report source explainability, team scoping, audit/outbox behavior for mutations, and AI insight provider port usage.

## Areas To Inspect

- `packages/app/src/index.ts`
- `packages/app/src/reporting.test.ts`
- `packages/domain/src/index.ts`
- `packages/db/src/dawn-repository.ts`
- `packages/api/src/routers/index.ts`
- `apps/web/src/routes/_auth/dashboard.tsx`

## Acceptance Criteria

- [ ] Project and time-entry commands live outside the app index.
- [ ] Reporting queries and insight generation live outside the app index.
- [ ] Report totals remain source-backed and permissioned.
- [ ] AI insight generation remains an adapter/port, not a domain dependency.
- [ ] Public exports remain stable.

## Verification

- `bun test packages/app/src/reporting.test.ts`
- Focused API/router tests for projects and reports.
- `bun run check-types`

## Dependencies

- Slice 8 recommended.

### 13. Extract Assistant, Automation, Developer, And Integration App Modules

## Goal

Extract the cross-cutting app capabilities that are most likely to be called from multiple entrypoints.

## Scope

- Move assistant threads, assistant tool execution, approval gates, automation rules/runs, API keys, OAuth apps, webhook subscriptions, webhook delivery, and integration connection commands into focused modules.
- Keep assistant tools as wrappers around app use cases.
- Keep webhooks and OAuth scoped, auditable, idempotent, and use-case-backed.
- Keep provider-specific integration behavior behind ports.

## Areas To Inspect

- `packages/app/src/index.ts`
- `packages/app/src/assistant.test.ts`
- `packages/app/src/integrations.test.ts`
- `packages/app/src/operations.test.ts`
- `packages/ai/src/index.ts`
- `packages/api/src/routers/index.ts`
- `apps/server/src/index.ts`

## Acceptance Criteria

- [ ] Assistant, automation, developer, webhook, and integration use cases are no longer buried in the app index.
- [ ] Assistant tool calls still enforce permissions and approval gates through app use cases.
- [ ] API key, OAuth app, and webhook behavior remains scoped, auditable, and idempotent.
- [ ] Integration modules do not leak concrete provider choices into transports.
- [ ] Public exports remain stable.

## Verification

- Assistant, integrations, operations, and public API focused tests.
- `bun run check-types`

## Dependencies

- Slices 4, 8, and 9 recommended.

### 14. Split Domain Foundation Modules

## Goal

Split foundational pure domain concepts out of `packages/domain/src/index.ts`.

## Scope

- Extract exact money, currency, Actor, Team, permissions, public API scopes, identifiers, typed errors, audit/outbox domain shapes, and common state transition helpers.
- Preserve the stable public `@dawn/domain` export surface.
- Keep domain pure: no DB, HTTP, auth runtime, provider, queue, AI runtime, or UI dependencies.

## Areas To Inspect

- `packages/domain/src/index.ts`
- `packages/domain/src/transaction-review.test.ts`
- `packages/app/src/index.ts`
- `packages/api/src/routers/index.ts`
- `apps/web/src/routes/_auth/oauth/-authorize-helpers.ts`

## Acceptance Criteria

- [ ] Money and permission logic live in focused pure modules.
- [ ] Actor/Team/scope concepts are available from clear domain modules.
- [ ] Existing imports from `@dawn/domain` keep working.
- [ ] Domain tests remain behavior-focused and do not depend on app/DB concerns.
- [ ] No application orchestration moves into domain modules.

## Verification

- `bun test packages/domain`
- `bun run check-types`

## Dependencies

- None, but easier after Slice 4 clarifies intake shapes.

### 15. Split Domain Product Modules

## Goal

Split product-specific domain rules into focused modules while keeping the domain package pure.

## Scope

- Extract transactions, invoices, documents, inbox matching, projects/time entries, automations, assistant tool risk, integrations, and public API domain rules as needed.
- Keep deterministic rules, value objects, state machines, and validation close to their product concepts.
- Preserve public exports and app use case behavior.

## Areas To Inspect

- `packages/domain/src/index.ts`
- `packages/domain/src/*.test.ts`
- `packages/app/src/*`
- `packages/api/src/routers/index.ts`

## Acceptance Criteria

- [ ] Product domain rules live in product-sized modules.
- [ ] Domain modules remain free of persistence, transport, runtime, and UI dependencies.
- [ ] State machines and deterministic rules are easier to test in isolation.
- [ ] Public `@dawn/domain` imports remain stable.
- [ ] No behavior changes are introduced by extraction.

## Verification

- `bun test packages/domain`
- Focused app tests for moved domain behavior.
- `bun run check-types`

## Dependencies

- Slice 14 recommended.
- App extraction slices are recommended so imports are easier to reason about.

### 16. Rename And Split Drizzle Repository Implementation

## Goal

Rename and split the all-purpose Drizzle repository implementation into clearer persistence modules without exposing database details to app callers.

## Scope

- Rename the broad Drizzle repository implementation so its name reflects Dawn persistence ownership.
- Split implementation locality by feature area where repository ports have been narrowed.
- Keep shared transaction handling, row mapping helpers, outbox persistence, idempotency keys, audit persistence, and team scoping consistent.
- Avoid changing schema or migrations unless required by the split.

## Areas To Inspect

- `packages/db/src/dawn-repository.ts`
- `packages/db/src/dawn-repository.integration.test.ts`
- `packages/db/src/schema/core.ts`
- `packages/app/src/*`
- `apps/server/src/index.ts`
- `packages/api/src/routers/index.ts`

## Acceptance Criteria

- [ ] Repository naming accurately reflects the implementation responsibility.
- [ ] At least two feature areas have localized Drizzle implementation files or clear submodules.
- [ ] Shared persistence helpers remain internal to `packages/db`.
- [ ] App callers depend on ports, not Drizzle implementation details.
- [ ] Existing server/API assembly can still construct the repository adapter cleanly.

## Verification

- `bun test packages/db`
- Focused app tests for the split feature areas.
- `bun run check-types`

## Dependencies

- Slice 5.
- App extraction slices for the selected feature areas.

### 17. Migrate Current Public API To Operation Contracts

## Goal

Move all existing public API resources from manual route definitions to operation contracts.

## Scope

- Apply the tracer pattern from Slice 6 to documents, invoices, projects, reports, webhooks, API keys/OAuth-facing developer resources, and any current public resources.
- Keep OpenAPI generation contract-backed.
- Keep concrete repository/provider assembly in server runtime.
- Preserve rate limiting, idempotency, scopes, typed errors, and response status behavior.

## Areas To Inspect

- `apps/server/src/index.ts`
- `apps/server/src/public-api.test.ts`
- `apps/server/src/rate-limit.ts`
- `packages/api/src/routers/index.ts`
- `apps/web/src/routes/_auth/oauth/-authorize-helpers.ts`

## Acceptance Criteria

- [ ] Existing public API route facts are defined in operation contracts.
- [ ] OpenAPI output stays stable unless intentionally improved.
- [ ] Route handlers consistently apply scope, idempotency, validation, and error mapping.
- [ ] Server index loses public route bulk and becomes route assembly.
- [ ] Public API tests cover at least one read and one mutation per migrated resource class.

## Verification

- `bun test apps/server/src/public-api.test.ts apps/server/src/rate-limit.test.ts`
- `bun run check-types`

## Dependencies

- Slice 6.
- Slice 4 recommended.

### 18. Expand Public API Resource Breadth And Scope Catalogue

## Goal

Use Midday's API breadth as a reference to expand Dawn's public API resources and scopes while keeping every endpoint use-case-backed.

## Scope

- Compare Dawn public resources against Midday areas: bank accounts, transactions, customers, documents, inbox, invoices, reports, search, tags/categories, teams/users, tracker/time, notifications, OAuth/apps, and webhooks.
- Add missing scopes deliberately, allowing read-only first where mutation semantics are not ready.
- Update OAuth consent display and scope validation.
- Add API routes only when the app use case and permission model are ready.

## Areas To Inspect

- `ref/midday/apps/api/src/rest/routers`
- `ref/midday/apps/api/src/trpc/routers/_app.ts`
- `apps/server/src/index.ts`
- `packages/api/src/routers/index.ts`
- `apps/web/src/routes/_auth/oauth/-authorize-helpers.ts`
- `packages/domain/src/index.ts`

## Acceptance Criteria

- [ ] Public API scope catalogue is explicit and grouped by product resource.
- [ ] OAuth consent labels and validation cover the expanded scopes.
- [ ] New endpoints call app use cases, not DB modules directly.
- [ ] Read/write scopes are separated where mutation risk requires it.
- [ ] OpenAPI output documents the expanded resource set.

## Verification

- Public API tests.
- OAuth helper tests.
- `bun run check-types`

## Dependencies

- Slice 17.
- Relevant app use case modules must exist for any newly exposed resource.

### 19. Add Dedicated Worker Runtime And Registry

## Goal

Introduce a dedicated worker runtime boundary with a job registry before queue handling grows further inside server composition.

## Scope

- Add a worker entrypoint or worker module that can run existing queue jobs through the job runner.
- Register handlers by job type instead of using a long server-local branch.
- Keep job contracts in `packages/jobs`.
- Expose a basic health/dependency surface for the worker.
- Keep server runtime able to dispatch jobs during transitional deployment if needed.

## Areas To Inspect

- `apps/server/src/index.ts`
- `packages/jobs/src/index.ts`
- `packages/app/src/index.ts`
- `packages/infra`
- `ref/midday/apps/worker/src/index.ts`
- `ref/midday/packages/jobs`

## Acceptance Criteria

- [ ] At least one real job type runs through the dedicated worker runtime/registry.
- [ ] Job handler registration is declarative enough to add new jobs without editing a large route switch.
- [ ] Worker health can report basic runtime/dependency status.
- [ ] Cloudflare deployment shape remains compatible with current infra package.
- [ ] Server queue handling is reduced or clearly transitional.

## Verification

- Worker/job runner tests.
- Typecheck for server, jobs, app, and infra packages.
- Local smoke command if a worker dev command exists or is added.

## Dependencies

- Slices 1-3.

### 20. Expand Sync Collections Beyond Transactions

## Goal

Use the sync collection contract to add the next collection without duplicating authorization or fanout logic.

## Scope

- Choose one high-value collection, preferably projects/time entries or invoice drafts.
- Define server authorization, cursor policy, projection query, mutation capability, invalidation mapping, and web client integration through the contract from Slice 7.
- Keep Postgres authoritative and Durable Objects limited to coordination/fanout.

## Areas To Inspect

- `packages/sync/src/index.ts`
- `apps/server/src/tenant-sync.ts`
- `apps/server/src/tenant-coordinator.ts`
- `apps/web/src/sync/transactions.ts`
- `apps/web/src/routes/_auth/dashboard.tsx`
- Relevant app use case module for the chosen collection.

## Acceptance Criteria

- [ ] One non-transaction collection uses the sync collection contract.
- [ ] Authorization, cursor, invalidation, and fanout policy are not duplicated across unrelated modules.
- [ ] The web client consumes the collection through a clear sync module.
- [ ] Unsafe mutations still wait for server confirmation.
- [ ] Existing transaction sync behavior remains stable.

## Verification

- Tenant sync/coordinator tests.
- Web typecheck.
- Focused browser/manual smoke if the collection affects visible UI.

## Dependencies

- Slice 7.
- Relevant app module extraction for the chosen collection is recommended.

### 21. Decompose Dashboard By Feature Area

## Goal

Split the broad authenticated dashboard route into feature modules while keeping business behavior in app/API layers.

## Scope

- Extract one feature area at a time from `apps/web/src/routes/_auth/dashboard.tsx`.
- Start with Operations, Banking, or Sync status depending on which backend slices have landed.
- Keep oRPC/TanStack Query/TanStack DB calls in typed web modules.
- Move reusable UI into `apps/web/src/components` or `packages/ui` only when it is actually shared.
- Use coss UI primitives for new product UI components unless explicitly directed otherwise.

## Areas To Inspect

- `apps/web/src/routes/_auth/dashboard.tsx`
- `apps/web/src/components`
- `apps/web/src/sync/transactions.ts`
- `packages/ui`
- `packages/api/src/routers/index.ts`

## Acceptance Criteria

- [ ] At least three dashboard feature areas are extracted into focused modules/components.
- [ ] The dashboard route becomes composition and routing glue, not the owner of every workflow UI.
- [ ] Business rules are not duplicated in React components.
- [ ] Data fetching and mutations remain typed through existing API/sync boundaries.
- [ ] UX remains functionally equivalent unless a small polish improvement is intentionally included.

## Verification

- `bun run check-types`
- `bun run check`
- Local web smoke check for extracted sections.

## Dependencies

- Slice 9 recommended for Banking.
- Slices 1-3 and 8 recommended for Operations.
- Slice 20 recommended for sync-heavy sections.

### 22. Verification Closure And Release Gates

## Goal

Convert the remaining blocked or manual architecture proof points into explicit verification gates.

## Scope

- Review current orchestration status and update the implementation checklist outside this slice's code changes only when that work is intentionally started.
- Add or identify commands for local proof: app/domain tests, API/public API tests, DB integration tests, job tests, sync tests, worker tests, web typecheck/check, and focused browser smoke tests.
- Document prerequisites for live proof: provider credentials, Cloudflare auth, desktop installation, CI access, OAuth app setup, webhook endpoint exposure, and multi-client sync.
- Distinguish local proof from live/manual proof.

## Areas To Inspect

- `docs/work/ORCHESTRATION.md`
- `docs/work/VERTICAL-SLICES.md`
- `packages/*/*.test.ts`
- `apps/server/src/*.test.ts`
- `apps/web`
- `packages/db/src/dawn-repository.integration.test.ts`
- GitHub Actions or local CI configuration if present.

## Acceptance Criteria

- [ ] Every architecture area changed by these slices has at least one local verification command.
- [ ] Blocked live/manual checks list concrete prerequisites instead of vague "blocked" notes.
- [ ] DB/integration verification is stronger for app, worker, public API, and sync paths.
- [ ] Release gate separates local, CI, provider-live, Cloudflare-live, desktop-live, and browser-manual proof.
- [ ] The final verification plan is agent-readable and does not require rediscovering hidden state.

## Verification

- Run the local gate that is practical in the current environment:
  - `bun run check-types`
  - `bun run check`
  - focused app/domain/API/job/sync tests touched by prior slices
- Record any live/manual checks that cannot be run with exact prerequisites.

## Dependencies

- This should be last. It closes the work after the changed architecture surfaces exist.

## Dependency Summary

- Slices 1-7 are the architecture review spine and should be completed before broad follow-on work.
- Slices 8-13 depend on the app boundary and repository lessons from Slices 1-7.
- Slices 14-16 are safer after feature app modules clarify import direction.
- Slices 17-18 depend on the public API tracer from Slice 6.
- Slice 19 depends on Slices 1-3.
- Slice 20 depends on Slice 7.
- Slice 21 depends on whichever backend feature area it extracts first.
- Slice 22 depends on all preceding work.

## Suggested First Slice

Start with Slice 1, "Move Data Export Completion Into App". It is the smallest direct architecture breach from the final review, has focused tests, and proves the intended worker-to-app shape before changing job runner, worker runtime, or repository boundaries.
