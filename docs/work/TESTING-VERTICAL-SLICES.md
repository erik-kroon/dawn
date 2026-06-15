# Testing Suite Vertical Slices

## Outcome

When all slices are complete, Dawn's test suite should be at least as robust as
Midday's reference suite while staying aligned with Dawn's architecture:

- Fast default `bun test` coverage remains green and deterministic.
- Application use cases remain the primary business-behavior contract.
- Database repositories have fast PGlite coverage and an opt-in real Postgres
  lane.
- API, server, sync, jobs, integrations, AI, and UI each have a clear harness
  that tests their own boundary without duplicating business rules.
- Provider normalization, matching, categorization, extraction, and AI behavior
  have durable fixture or golden-dataset regression coverage.
- Release confidence can be reproduced locally and in CI through named commands.

## Slice Strategy

Avoid horizontal "setup only" work unless it produces an immediately safer
test suite. The tracer slice is a runner taxonomy that preserves the current
green suite while creating safe lanes for PGlite, Vitest, Postgres, and E2E.
Each later slice adds one behavior-bearing lane or converts one risky test area
to a reusable harness.

Horizontal temptations to avoid:

- Do not add PGlite helpers without at least one repository test using them.
- Do not add Vitest config without at least one browser/Vite test using it.
- Do not create a generic testkit package before two packages need the same
  helpers.
- Do not add live E2E scripts that require undocumented credentials or leave
  created records behind.

## Ordered Slices

### 1. Preserve The Fast Suite And Split Test Lanes

#### Goal

Keep the current default suite fast and green while introducing explicit lanes
for unit, PGlite, Postgres, Vitest, E2E, and AI evaluation checks.

#### Scope

- Inspect `scripts/run-tests.ts`, `package.json`, package-level scripts, and
  existing test filenames.
- Update the runner so default `bun run test` includes normal `*.test.ts` files
  but excludes opt-in lane names such as `*.postgres.test.ts`,
  `*.e2e.test.ts`, and `*.vitest.test.tsx`.
- Add root scripts for the target command set in `docs/TESTING.md`.
- Keep the existing skipped DB integration behavior intact until the DB slices
  replace it.

#### Acceptance Criteria

- [x] `bun run test` still runs the current fast suite and does not require a
      database server, browser environment, or external credentials.
- [x] `bun run test:unit` exists and runs the non-DB/non-browser Bun suite.
- [x] `bun run test:pglite`, `bun run test:postgres`, `bun run test:vitest`,
      and `bun run test:e2e` exist, even if empty lanes initially print a clear
      "no tests yet" message.
- [x] Lane naming rules are documented in `docs/TESTING.md`.

#### Verification

```sh
bun run test
bun run test:unit
bun run test:pglite
bun run test:postgres
bun run test:vitest
```

#### Dependencies

None.

### 2. Extract A Reusable App Testkit Through One Use Case

#### Goal

Remove the growing inline in-memory repository burden by creating a reusable
`packages/app` testkit and migrating one representative use-case test to it.

#### Scope

- Inspect `packages/app/src/*.test.ts` and `packages/api/src/router.test.ts`
  for duplicated `Memory...Repository` behavior.
- Add `packages/app/src/testkit/memory-repository.ts` with a canonical app
  in-memory repository, starting with the transaction review and ledger surface
  and designed to grow toward full `DawnRepository` coverage.
- Add `packages/app/src/testkit/fixtures.ts` with builders for actors, teams,
  memberships, ledger accounts, transactions, categories, audit entries, and
  outbox events.
- Migrate one behavior-rich test file, preferably
  `packages/app/src/transaction-review.test.ts` or
  `packages/app/src/ledger.test.ts`, to use the testkit.

#### Acceptance Criteria

- [x] The migrated test file has less local repository scaffolding while
      preserving the same behavior assertions.
- [x] The testkit supports reset or fresh-instance creation per test.
- [x] The testkit exposes audit, outbox, idempotency, and membership state for
      assertions.
- [x] No production code imports from `src/testkit`.

#### Verification

```sh
bun test packages/app/src/transaction-review.test.ts packages/app/src/ledger.test.ts
bun run test:unit
```

#### Dependencies

Slice 1.

### 3. Reuse The App Testkit From API Contract Tests

#### Goal

Make API/oRPC contract tests prove transport delegation without maintaining a
second huge in-memory repository inside `packages/api`.

#### Scope

- Inspect `packages/api/src/router.test.ts` and `packages/api/src/context.test.ts`.
- Add `packages/api/src/testkit/context.ts` with authenticated,
  unauthenticated, selected-team, and scoped-actor contexts backed by the app
  testkit.
- Migrate a representative set of router tests to the shared testkit, including
  one read, one mutation, one permission denial, and one cross-team not-found
  case.
- Keep transport assertions focused on request parsing, typed error mapping,
  context resolution, and use-case delegation.

#### Acceptance Criteria

- [x] API tests no longer need their own full copy of `DawnRepository` for the
      migrated cases.
- [x] Permission denials map to the expected oRPC errors.
- [x] Selected-team misses map to not found without leaking cross-tenant data.
- [x] The router still exercises real oRPC callers, not direct use-case calls.

#### Verification

```sh
bun test packages/api/src/context.test.ts packages/api/src/router.test.ts
bun run test:unit
```

#### Dependencies

Slices 1 and 2.

### 4. Add A PGlite Repository Tracer

#### Goal

Create the first fast database-real repository test using PGlite, Drizzle, and
Dawn's real migrations.

#### Scope

- Add `@electric-sql/pglite` as a dev dependency where appropriate.
- Add `packages/db/src/testkit/pglite.ts` to create a fresh in-memory PGlite
  database, apply Drizzle SQL migrations, return a `drizzle-orm/pglite` client,
  and dispose cleanly.
- Adapt repository construction so `DrizzleDawnRepository` can use
  the PGlite Drizzle client without importing the production singleton.
- Add `packages/db/src/dawn-repository.pglite.test.ts` that creates a team,
  reviews or creates a transaction, and verifies persisted audit/outbox data.

#### Acceptance Criteria

- [x] `bun run test:pglite` runs a real Drizzle repository test without Docker,
      `DAWN_DATABASE_TEST_URL`, or a networked Postgres server.
- [x] The PGlite test applies committed migrations rather than duplicating
      schema setup manually.
- [x] The test proves at least one app use case can run through the DB
      repository boundary.
- [x] The production `createDb()` path remains unchanged for app runtime.

#### Verification

```sh
bun run test:pglite
bun run test:unit
```

#### Dependencies

Slices 1 and 2.

### 5. Deepen PGlite Coverage For Financial State Contracts

#### Goal

Use PGlite to cover the repository behaviors that must be reliable before
business data becomes authoritative.

#### Scope

- Extend PGlite tests around `packages/db/src/dawn-repository.ts`.
- Cover tenant predicates, duplicate keys, idempotency replay/conflict,
  audit writes, outbox writes, import sessions, tag assignments, transfer pairs,
  reporting reads, and transaction rollback behavior that PGlite supports.
- Add seed helpers only when they are used by the new tests.

#### Acceptance Criteria

- [x] PGlite tests fail if repository methods leak records across teams.
- [x] PGlite tests fail if idempotency result persistence or duplicate-key
      behavior regresses.
- [x] PGlite tests fail if audit/outbox records are not committed with state
      changes.
- [x] At least one rollback test proves partial repository writes do not persist
      when a use case fails inside `withTransaction`.

#### Verification

```sh
bun run test:pglite
bun run test
```

#### Dependencies

Slice 4.

### 6. Keep A Real Postgres Parity Lane

#### Goal

Retain production-database confidence for behavior PGlite should not be trusted
to prove alone.

#### Scope

- Rename or split the existing
  `packages/db/src/dawn-repository.integration.test.ts` into an opt-in
  `*.postgres.test.ts` lane.
- Add `packages/db/src/testkit/postgres.ts` with per-test-schema isolation,
  migration application, cleanup, and strict test-database URL guards.
- Add or update a Docker Compose test database file if needed.
- Keep real Postgres tests focused on migration parity, pg-driver behavior,
  indexes/constraints, schemas, extension-dependent behavior, and concurrency
  or locking once such code exists.

#### Acceptance Criteria

- [x] `bun run test:postgres` skips or exits clearly when no test database URL
      is configured.
- [x] When configured, real Postgres tests create isolated schemas and clean
      them up.
- [x] The lane runs the existing repository integration behavior without being
      included in the default `bun run test`.
- [x] Unsafe database URLs are rejected before destructive cleanup.

#### Verification

```sh
bun run test:postgres
DAWN_DATABASE_TEST_URL=postgres://... bun run test:postgres
```

#### Dependencies

Slices 1 and 4.

### 7. Add Vitest For Web And UI Behavior

#### Goal

Add Vitest only where Dawn needs Vite/browser-like test semantics, with a
working tracer test in both app UI and shared UI areas.

#### Scope

- Add `vitest.config.ts` with project isolation for `apps/web`,
  `packages/ui`, and optional Node Vitest tests.
- Add browser test environment dependency, such as `happy-dom`, if required.
- Add one `apps/web` test for a route helper, hook, or client interaction that
  benefits from Vite/browser semantics.
- Add one `packages/ui` test for a shared primitive or component behavior.
- Keep business logic assertions in `packages/domain` or `packages/app`, not
  UI tests.

#### Acceptance Criteria

- [x] `bun run test:vitest` runs Vitest projects and does not pick up normal
      Bun tests.
- [x] Vitest tests use explicit `*.vitest.test.ts` or
      `*.vitest.test.tsx` naming.
- [x] UI tests assert rendering, interaction, accessibility basics, or client
      wiring rather than duplicating business invariants.
- [x] `bun run test` remains independent of Vitest/browser dependencies.

#### Verification

```sh
bun run test:vitest
bun run test
```

#### Dependencies

Slice 1.

### 8. Add Provider Normalization Golden Fixtures

#### Goal

Match Midday's provider-transform confidence by locking Dawn provider adapters
to canonical fixture outputs.

#### Scope

- Inspect `packages/integrations/src` and current provider tests.
- Add fixture files for mock/sandbox banking payloads and any accounting,
  payment, messaging, or email adapters that already have canonical transforms.
- Add snapshot or explicit golden-output tests for raw provider payload to Dawn
  canonical command/event models.
- Assert raw payload preservation where reconciliation or debugging depends on
  it.

#### Acceptance Criteria

- [x] Provider tests fail when canonical IDs, money, dates, currencies,
      provider references, raw payload storage, or token metadata regress.
- [x] Fixture data is stored near the relevant adapter tests.
- [x] Secrets and real customer/provider data are not committed.
- [x] The tests remain deterministic without network calls.

#### Verification

```sh
bun test packages/integrations/src
bun run test:unit
```

#### Dependencies

Slice 1.

### 9. Add Domain Golden Datasets For Matching And Categorization

#### Goal

Turn matching and categorization behavior into durable regression datasets
instead of relying only on hand-written examples.

#### Scope

- Inspect `packages/domain/src/matching.test.ts`, transaction/category helpers,
  and `packages/ai/src/evals.ts`.
- Add golden dataset modules for transaction-to-inbox matching and transaction
  categorization cases.
- Cover confirmed matches, suggested matches, false positives, hard negatives,
  cross-currency/fee/tolerance cases, provider-reference matches, date windows,
  and ambiguous merchant names.
- Add threshold and performance assertions that are stable enough for CI.

#### Acceptance Criteria

- [x] Golden dataset validation fails on malformed cases.
- [x] Matching tests prove high-confidence true positives and suppressed false
      positives.
- [x] Categorization tests prove stable outputs for representative business
      expenses and income.
- [x] The dataset is small enough for fast CI but structured so real feedback
      cases can be added later.

#### Verification

```sh
bun test packages/domain/src/matching.test.ts packages/domain/src/*categor*.test.ts
bun run test:unit
```

#### Dependencies

Slice 1.

### 10. Add AI Eval Dataset Expansion For Tool Safety

#### Goal

Bring AI release confidence up to the same level as the deterministic product
test suite.

#### Scope

- Inspect `docs/ai/EVALUATIONS.md`, `packages/ai/src/evals.ts`, and app
  assistant tests.
- Add fixtures for tool selection, permission refusal, approval-gated mutation,
  extraction correction, inbox matching, invoice drafting, and grounded cashflow
  answers.
- Ensure every AI tool fixture includes expected sources, mutation allowance,
  approval policy, and permission outcome.
- Keep local provider output deterministic.

#### Acceptance Criteria

- [x] `bun run eval:ai` fails on unsafe mutation, hallucinated source, missing
      permission refusal, or wrong tool selection.
- [x] Eval failure output identifies fixture, category, metric, expected value,
      and actual value.
- [x] Assistant app tests and AI evals cover the same approval boundaries from
      different levels.
- [x] No external model key is required for release-gate evals.

#### Verification

```sh
bun run eval:ai
bun test packages/ai/src/evals.test.ts packages/ai/src/insights.test.ts packages/app/src/assistant.test.ts
```

#### Dependencies

Slices 1 and 2.

### 11. Add Local Live E2E Smoke Flows

#### Goal

Create opt-in end-to-end smoke coverage for the workflows users and operators
care about most.

#### Scope

- Add E2E tests under an explicit lane such as `apps/server/src/e2e` or
  `apps/web/src/e2e`.
- Use a local or preview base URL and documented mock/sandbox credentials.
- Cover onboarding/default workspace, mock bank connection, transaction review,
  receipt upload, receipt-to-transaction match, draft invoice send through a
  mock delivery provider, and assistant cashflow explanation.
- Ensure created records are cleaned up or isolated by test tenant.

#### Acceptance Criteria

- [ ] `bun run test:e2e` clearly reports missing base URL or credentials rather
      than silently passing.
- [ ] E2E tests exercise real HTTP boundaries, not direct function calls.
- [ ] Tests retry expected rate limits but fail on unexpected 4xx/5xx responses.
- [ ] Test-created records are cleaned up or created inside a disposable tenant.

#### Verification

```sh
bun run dev:server
DAWN_E2E_BASE_URL=http://localhost:3000 DAWN_E2E_API_KEY=... bun run test:e2e
```

#### Dependencies

Slices 1, 4, 6, 8, and 10.

### 12. Wire The Release Gate And CI Matrix

#### Goal

Make the robust suite enforceable through local release commands and CI without
making every expensive lane block every small inner-loop change.

#### Scope

- Inspect existing package scripts, `release:gate`, and any CI workflow files.
- Update `release:gate` to run the completed fast, PGlite, Vitest, AI eval,
  migration, secret, typecheck, lint, and worker bundle checks.
- Add CI jobs or documented local gates for PR, scheduled, and release lanes.
- Keep real Postgres and live E2E gated by explicit environment availability.

#### Acceptance Criteria

- [ ] Pull-request gate runs deterministic fast lanes.
- [ ] Release or scheduled gate runs real Postgres and live E2E when secrets are
      available.
- [ ] CI output names the failing lane clearly.
- [ ] `docs/TESTING.md` reflects the final command behavior and CI policy.

#### Verification

```sh
bun run release:gate
bun run test:postgres
bun run test:e2e
```

#### Dependencies

All prior slices.

## Dependencies

Primary chain:

1. Slice 1 creates safe lane separation.
2. Slice 2 creates the app behavior testkit.
3. Slice 3 reuses the app testkit at the API boundary.
4. Slice 4 creates the PGlite DB tracer.
5. Slice 5 deepens PGlite confidence.
6. Slice 6 keeps production Postgres parity.
7. Slice 7 adds browser/Vite test coverage.
8. Slices 8, 9, and 10 add regression datasets.
9. Slice 11 adds live E2E smoke confidence.
10. Slice 12 makes the complete suite enforceable.

Parallelizable after Slice 1:

- Slice 7 can proceed independently.
- Slice 8 can proceed independently.
- Slice 9 can proceed independently.

Parallelizable after Slice 2:

- Slice 3 can proceed independently of DB work.
- Slice 10 can proceed independently of DB work.

## Suggested First Slice

Start with Slice 1. It is the smallest tracer that makes every later slice safe:
the current suite stays fast and green, new opt-in lanes have names, and agents
can add PGlite, Vitest, Postgres, or E2E tests without accidentally changing the
default developer loop.
