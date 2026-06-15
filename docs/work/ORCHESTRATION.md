# Dawn End-to-End Implementation

Goal source: `goals/dawn-end-to-end-orchestration/goal.md`
Started: 2026-06-14
Baseline: prior startup recorded a clean worktree; the 2026-06-14 continuation
has an in-progress goal-package rename to `goals/dawn-end-to-end-orchestration`
plus this implementation log untracked. Preserve those user-owned changes.

This file is the durable implementation log for the Dawn end-to-end goal. It tracks
slice state, verification, commits or checkpoints, notes, and blockers. A slice is
not complete until its acceptance criteria are implemented, the relevant checks
pass, and the implementing agent has inspected the diff.

## Operating Rules

- Keep `ref/midday` read-only.
- Preserve user changes. Do not revert unrelated edits.
- Keep business rules in `packages/domain` and `packages/app`.
- Keep transports, workers, provider adapters, automations, and AI tools thin.
- Use Postgres as authoritative state; use Durable Objects, TanStack DB, KV,
  cache, search, and vector indexes only as projections or coordination layers.
- Sensitive mutations must enforce tenant isolation, permissions, idempotency,
  audit logging, and outbox persistence before side effects run.
- Authoritative money calculations must use exact representations, not
  JavaScript floating point.
- New product UI and reusable component work should use Coss primitives or
  particles after reading `.agents/skills/coss/SKILL.md`.
- Implement touched areas toward the intended end state. Delete unused
  compatibility paths when caller evidence supports removal.

## Startup Sequence

| Item                            | Status      | Notes                                                                                                                                               |
| ------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline status                 | Done        | Continuation baseline reconciled; goal-package rename is preserved as existing user-owned worktree state.                                           |
| Implementation log              | In progress | Log corrected for lowercase Dawn goal path, continuation baseline, current audits, and latest verification.                                         |
| ADR baseline audit              | Done        | Explorer `019ec812-1575-70d2-a26c-94e060adbca0` (`Euler`) found no blocking ADR gap; proceed under ADRs 0001-0011.                                  |
| Transaction review tracer audit | Done        | Explorer `019ec812-3f90-7091-99cf-48f91a7e54b2` (`Lagrange`) found next hardening; idempotency fingerprints and tenant SQL patch completed locally. |
| Slice inventory audit           | Done        | Prior inventory incorporated into slice status and blockers; previous saved explorer IDs are historical/stale metadata.                             |

## Slice Status

| #   | Slice                                                        | Status                                                   | Dependencies             | Verification                                                                                                             |
| --- | ------------------------------------------------------------ | -------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| 1   | Architecture Decision Baseline                               | Accepted for startup                                     | None                     | Manual ADR review complete; markdown/link check if added.                                                                |
| 2   | Transaction Review Tracer Slice                              | Verified foundation, authenticated manual review blocked | Slice 1                  | Focused domain/app tests, `bun run check-types`, `bun run check`, local server/web smoke.                                |
| 3   | Team Context And Permission Model                            | API-verified foundation in progress                      | Slice 2                  | Role matrix, directory, invite, acceptance, role update, and API contract tests; `bun run check-types`; `bun run check`. |
| 4   | Money And Ledger Core                                        | API-verified foundation in progress                      | Slice 3                  | Money/domain tests; duplicate and split tests; report fixture tests; typecheck/check.                                    |
| 5   | CSV Transaction Import                                       | UI/API-verified foundation in progress                   | Slice 4                  | Parser tests; preview/duplicate/commit tests; typecheck/check; web build.                                                |
| 6   | TanStack DB Sync Tracer                                      | UI/API-verified foundation in progress                   | Slices 2, 3              | Sync contract tests; API cursor tests; dashboard collection wiring; typecheck/check.                                     |
| 7   | Cloudflare Infrastructure Baseline                           | Verified foundation, live plan blocked on CF auth        | Slice 1                  | Infra contract test; server bundle; `bun run check-types`; `bun run check`; credentialed Alchemy plan blocked.           |
| 8   | Outbox Dispatcher And Queue Bridge                           | Verified foundation in progress                          | Slices 2, 7              | Job contract tests; dispatcher retry/idempotency tests; typecheck/check.                                                 |
| 9   | Tenant Durable Object Realtime Fanout                        | Verified foundation, live multi-client blocked           | Slices 6, 8              | Subscription routing tests; sync protocol tests; Worker/server build; typecheck/check.                                   |
| 10  | Banking Provider Adapter Interface And Mock Provider         | Verified foundation, live manual sync blocked            | Slices 4, 8              | Adapter/app/API tests; migration; dashboard/server smoke; typecheck/check.                                               |
| 11  | First Real Banking Provider                                  | Blocked on provider choice/credentials                   | Slice 10                 | Sandbox/provider tests; webhook signature tests; manual sandbox connection.                                              |
| 12  | Documents And R2 Storage                                     | Verified foundation, manual upload/download blocked      | Slices 3, 7, 8           | Metadata/permission tests; R2 mock/local test; web/server smoke.                                                         |
| 13  | Inbox And Document Extraction Pipeline                       | Not started                                              | Slice 12                 | Extraction schema tests; worker tests; manual inbox review.                                                              |
| 14  | Inbox-To-Transaction Matching                                | Not started                                              | Slices 4, 13             | Matching domain tests; accept/reject tests; manual samples.                                                              |
| 15  | Customers And Invoice Drafts                                 | Not started                                              | Slices 3, 4              | Invoice totals/state tests; customer/draft tests; manual draft.                                                          |
| 16  | Invoice Delivery, PDF, Payments, And Recurrence              | Not started                                              | Slices 15, 8             | Lifecycle tests; send/payment tests; sandbox/dev email manual flow.                                                      |
| 17  | Projects And Time Tracking                                   | Not started                                              | Slice 15                 | Time totals/conversion tests; manual project/time/invoice flow.                                                          |
| 18  | Reporting And Weekly Insights                                | Not started                                              | Slices 4, 14, 16, 17     | Report fixture tests; mocked insight tests; manual dashboard.                                                            |
| 19  | TanStack AI Assistant Read And Suggest Tools                 | Not started                                              | Slice 18                 | Tool schema tests; permission/refusal tests; manual grounded questions.                                                  |
| 20  | AI Draft, Mutate, And Approval Gates                         | Not started                                              | Slice 19                 | Approval tests; AI actor permission tests; manual approval flow.                                                         |
| 21  | AI Evaluation Harness                                        | Not started                                              | Slices 19, 20            | Eval runner with deterministic fixtures.                                                                                 |
| 22  | Automation Rules                                             | Not started                                              | Slices 8, 20             | Trigger/action tests; manual event-driven automation.                                                                    |
| 23  | Public API, OAuth Apps, API Keys, And Webhooks               | Not started                                              | Slices 3, 8              | API contract tests; scope tests; webhook retry/failure tests.                                                            |
| 24  | Accounting, Payments, Messaging, And Email Provider Adapters | Not started                                              | Slices 16, 23            | Adapter contract tests; sandbox tests where available; manual status review.                                             |
| 25  | Desktop Quick Capture And Native Shell Deepening             | Not started                                              | Slices 12, 13            | Desktop build/smoke; file capture test.                                                                                  |
| 26  | Observability, Admin Tools, And Operations                   | Not started                                              | Slices 8, 11, 16, 20     | Controlled failure; redaction review; data workflow tests.                                                               |
| 27  | Security Hardening And Release Gates                         | Not started                                              | Broad product foundation | Full check suite; integration tests; ignored-error review.                                                               |

## Exploration Log

| Entry                                               | Type       | Assignment                                                  | Status                                             |
| --------------------------------------------------- | ---------- | ----------------------------------------------------------- | -------------------------------------------------- |
| `019ec812-1575-70d2-a26c-94e060adbca0` (`Euler`)    | Historical | Audit ADR baseline against canonical docs.                  | Completed                                          |
| `019ec812-3f90-7091-99cf-48f91a7e54b2` (`Lagrange`) | Historical | Audit current transaction review tracer and hardening gaps. | Completed                                          |
| `019ec802-25a9-75c1-a784-7f146873ad48` (`Cicero`)   | Historical | Build initial vertical-slice inventory.                     | Historical completed entry from prior startup log. |

## Implementation Protocol

- Implement in the active workspace. Do not spawn Codex CLI workers, create worker
  worktrees, or delegate implementation unless the user explicitly asks later.
- Before editing a file with existing changes, inspect it and preserve user or
  prior-agent work.
- Work vertically where possible: domain/app/db/api/UI/test changes should land
  together when the slice requires the full path.
- Before each checkpoint or commit, inspect the diff, verify acceptance criteria,
  run relevant checks, update this log, and stage paths intentionally.

## Verification Log

| Time                    | Command or check                                                                                                                                                                                                                                                                                                             | Result  | Notes                                                                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-06-14 startup      | `git status --short`                                                                                                                                                                                                                                                                                                         | Pass    | Clean worktree.                                                                                                                              |
| 2026-06-14 startup      | `bun test packages/app/src/transaction-review.test.ts`                                                                                                                                                                                                                                                                       | Pass    | 5 tests passed.                                                                                                                              |
| 2026-06-14 startup      | `bun run check-types`                                                                                                                                                                                                                                                                                                        | Pass    | Typecheck/build passed; Vite reported a large chunk warning.                                                                                 |
| 2026-06-14 continuation | `git status --short --branch`                                                                                                                                                                                                                                                                                                | Info    | Dirty continuation baseline: old goal package deleted, Dawn goal package and this log untracked.                                             |
| 2026-06-14 continuation | `bun test packages/domain/src/money.test.ts packages/app/src/transaction-review.test.ts`                                                                                                                                                                                                                                     | Pass    | 8 tests passed after exact money display hardening.                                                                                          |
| 2026-06-14 continuation | `bun run check-types`                                                                                                                                                                                                                                                                                                        | Pass    | Full workspace typecheck/build passed; Vite reported a large chunk warning.                                                                  |
| 2026-06-14 continuation | `bun run db:generate`                                                                                                                                                                                                                                                                                                        | Pass    | Generated `packages/db/src/migrations/0001_powerful_talos.sql` for idempotency fingerprints.                                                 |
| 2026-06-14 continuation | `bun test packages/domain/src/money.test.ts packages/domain/src/transaction-review.test.ts packages/app/src/transaction-review.test.ts`                                                                                                                                                                                      | Pass    | 11 tests passed after domain transition, command-aware idempotency, and tenant-scoped repository hardening.                                  |
| 2026-06-14 continuation | `bun run check-types`                                                                                                                                                                                                                                                                                                        | Pass    | Full workspace typecheck/build passed; Vite reported a large chunk warning.                                                                  |
| 2026-06-14 continuation | `bun run check`                                                                                                                                                                                                                                                                                                              | Pass    | `oxlint` passed and `oxfmt --write` formatted 182 files.                                                                                     |
| 2026-06-14 continuation | `bun run dev:server`                                                                                                                                                                                                                                                                                                         | Blocked | Fails with checked-in env because `POLAR_ACCESS_TOKEN` is missing.                                                                           |
| 2026-06-14 continuation | `env SKIP_ENV_VALIDATION=true POLAR_ACCESS_TOKEN=dummy bun run dev:server`                                                                                                                                                                                                                                                   | Pass    | Smoke server started on `http://localhost:3000`; health RPC and auth session requests returned 200.                                          |
| 2026-06-14 continuation | `bun run dev:web`                                                                                                                                                                                                                                                                                                            | Pass    | Added missing web `dev` script; documented root command starts Vite on `http://localhost:3001`.                                              |
| 2026-06-14 continuation | Browser smoke at `http://localhost:3001`                                                                                                                                                                                                                                                                                     | Pass    | Landing page rendered, API status showed connected, `/dashboard` redirected to login when unauthenticated.                                   |
| 2026-06-14 continuation | `bun test packages/domain/src/money.test.ts packages/domain/src/transaction-review.test.ts packages/app/src/transaction-review.test.ts`                                                                                                                                                                                      | Pass    | Final focused test run: 11 tests passed.                                                                                                     |
| 2026-06-14 continuation | `bun run check-types`                                                                                                                                                                                                                                                                                                        | Pass    | Final full workspace typecheck/build passed; Vite reported a large chunk warning.                                                            |
| 2026-06-14 continuation | `bun run check`                                                                                                                                                                                                                                                                                                              | Pass    | Final `oxlint` and `oxfmt --write` passed on 184 files.                                                                                      |
| 2026-06-15 continuation | `bun test packages/domain/src/money.test.ts packages/domain/src/transaction-review.test.ts packages/app/src/transaction-review.test.ts`                                                                                                                                                                                      | Pass    | 11 tests passed for money formatting, domain review transition, permissions, tenant scoping, and idempotency.                                |
| 2026-06-15 continuation | `bun run check-types`                                                                                                                                                                                                                                                                                                        | Pass    | Full workspace typecheck/build passed; Vite reported the existing large chunk warning.                                                       |
| 2026-06-15 continuation | `bun run check`                                                                                                                                                                                                                                                                                                              | Pass    | `oxlint` passed and `oxfmt --write` formatted 183 files.                                                                                     |
| 2026-06-15 continuation | `env SKIP_ENV_VALIDATION=true POLAR_ACCESS_TOKEN=dummy bun run dev:server`                                                                                                                                                                                                                                                   | Pass    | API server started on `http://localhost:3000`; `GET /`, `POST /rpc/healthCheck`, and auth session returned 200.                              |
| 2026-06-15 continuation | `bun run dev:web`                                                                                                                                                                                                                                                                                                            | Pass    | Vite dev server started on `http://localhost:3001`; HTTP shell returned 200.                                                                 |
| 2026-06-15 continuation | Browser smoke at `http://localhost:3001`                                                                                                                                                                                                                                                                                     | Blocked | Shared in-app browser profile was locked; isolated Playwright was unavailable in the Node REPL. Used HTTP smoke instead.                     |
| 2026-06-15 slice 3      | `bun test packages/domain/src/permissions.test.ts packages/domain/src/money.test.ts packages/domain/src/transaction-review.test.ts packages/app/src/team-permissions.test.ts packages/app/src/transaction-review.test.ts`                                                                                                    | Pass    | 20 tests passed for role permissions, team access resolution, invites, idempotency, transaction review, and money.                           |
| 2026-06-15 slice 3      | `bun run db:generate`                                                                                                                                                                                                                                                                                                        | Pass    | Generated `packages/db/src/migrations/0002_dazzling_supreme_intelligence.sql` for `team_invite`.                                             |
| 2026-06-15 slice 3      | `bun run check-types`                                                                                                                                                                                                                                                                                                        | Pass    | Full workspace typecheck/build passed; Vite reported the existing large chunk warning.                                                       |
| 2026-06-15 slice 3      | `bun run check`                                                                                                                                                                                                                                                                                                              | Pass    | `oxlint` passed and `oxfmt --write` formatted 186 files.                                                                                     |
| 2026-06-15 slice 3      | `bun test packages/domain/src/permissions.test.ts packages/domain/src/money.test.ts packages/domain/src/transaction-review.test.ts packages/app/src/team-permissions.test.ts packages/app/src/transaction-review.test.ts`                                                                                                    | Pass    | 26 tests passed after adding invite acceptance, member role updates, and lifecycle guard rails.                                              |
| 2026-06-15 slice 3      | `bun run check-types`                                                                                                                                                                                                                                                                                                        | Pass    | Full workspace typecheck/build passed; Vite reported the existing large chunk warning.                                                       |
| 2026-06-15 slice 3      | `bun run check`                                                                                                                                                                                                                                                                                                              | Pass    | `oxlint` passed and `oxfmt --write` formatted 186 files.                                                                                     |
| 2026-06-15 slice 3      | `bun test packages/domain/src/permissions.test.ts packages/domain/src/money.test.ts packages/domain/src/transaction-review.test.ts packages/app/src/team-permissions.test.ts packages/app/src/transaction-review.test.ts`                                                                                                    | Pass    | 28 tests passed after adding team directory query coverage and manager-only access checks.                                                   |
| 2026-06-15 slice 3      | `bun run check-types`                                                                                                                                                                                                                                                                                                        | Pass    | Full workspace typecheck/build passed; Vite reported the existing large chunk warning.                                                       |
| 2026-06-15 slice 3      | `bun run check`                                                                                                                                                                                                                                                                                                              | Pass    | `oxlint` passed and `oxfmt --write` formatted 186 files.                                                                                     |
| 2026-06-15 slice 3      | `bun test packages/api/src/router.test.ts packages/domain/src/permissions.test.ts packages/domain/src/money.test.ts packages/domain/src/transaction-review.test.ts packages/app/src/team-permissions.test.ts packages/app/src/transaction-review.test.ts`                                                                    | Pass    | 32 tests passed after adding API router contract coverage for auth, forbidden, directory data, and not-found mapping.                        |
| 2026-06-15 slice 3      | `bun run check-types`                                                                                                                                                                                                                                                                                                        | Pass    | Full workspace typecheck/build passed; Vite reported the existing large chunk warning.                                                       |
| 2026-06-15 slice 3      | `bun run check`                                                                                                                                                                                                                                                                                                              | Pass    | `oxlint` passed and `oxfmt --write` formatted 187 files.                                                                                     |
| 2026-06-15 slice 4      | `bun test packages/domain/src/money.test.ts packages/domain/src/ledger.test.ts packages/domain/src/permissions.test.ts packages/domain/src/transaction-review.test.ts packages/app/src/ledger.test.ts packages/app/src/transaction-review.test.ts packages/app/src/team-permissions.test.ts packages/api/src/router.test.ts` | Pass    | 44 tests passed for exact money math, ledger duplicate keys, split validation, reporting totals, app use cases, and API route coverage.      |
| 2026-06-15 slice 4      | `bun run db:generate`                                                                                                                                                                                                                                                                                                        | Pass    | Generated `packages/db/src/migrations/0003_far_boom_boom.sql` for ledger accounts, counterparties, tags, splits, and transaction metadata.   |
| 2026-06-15 slice 4      | `bun run check-types`                                                                                                                                                                                                                                                                                                        | Pass    | Full workspace typecheck/build passed; Vite reported the existing large chunk warning.                                                       |
| 2026-06-15 slice 4      | `bun run check`                                                                                                                                                                                                                                                                                                              | Pass    | `oxlint` passed and `oxfmt --write` formatted 190 files.                                                                                     |
| 2026-06-15 slice 4      | `bun test packages/domain/src/money.test.ts packages/domain/src/ledger.test.ts packages/domain/src/permissions.test.ts packages/domain/src/transaction-review.test.ts packages/app/src/ledger.test.ts packages/app/src/transaction-review.test.ts packages/app/src/team-permissions.test.ts packages/api/src/router.test.ts` | Pass    | Final focused run after formatting: 44 tests passed.                                                                                         |
| 2026-06-15 slice 5      | `bun test packages/domain/src/csv-import.test.ts packages/domain/src/money.test.ts packages/domain/src/ledger.test.ts packages/app/src/ledger.test.ts packages/app/src/transaction-review.test.ts packages/app/src/team-permissions.test.ts packages/api/src/router.test.ts`                                                 | Pass    | 46 tests passed for CSV parsing, exact amount conversion, preview/duplicate/invalid rows, commit idempotency, audit/outbox, and API routes.  |
| 2026-06-15 slice 5      | `bun run db:generate`                                                                                                                                                                                                                                                                                                        | Pass    | Generated `packages/db/src/migrations/0004_majestic_amazoness.sql` for `transaction_import_session`.                                         |
| 2026-06-15 slice 5      | `bun run check-types`                                                                                                                                                                                                                                                                                                        | Pass    | Full workspace typecheck/build passed; Vite reported the existing large chunk warning.                                                       |
| 2026-06-15 slice 5      | `bun run check`                                                                                                                                                                                                                                                                                                              | Pass    | `oxlint` passed and `oxfmt --write` formatted 192 files.                                                                                     |
| 2026-06-15 slice 5      | `bun test packages/domain/src/csv-import.test.ts packages/domain/src/money.test.ts packages/domain/src/ledger.test.ts packages/app/src/ledger.test.ts packages/app/src/transaction-review.test.ts packages/app/src/team-permissions.test.ts packages/api/src/router.test.ts`                                                 | Pass    | Final focused run after formatting: 46 tests passed.                                                                                         |
| 2026-06-15 slice 5      | `bun test packages/domain/src/csv-import.test.ts packages/app/src/ledger.test.ts packages/api/src/router.test.ts`                                                                                                                                                                                                            | Pass    | 17 changed-path tests passed after typed CSV file-error mapping.                                                                             |
| 2026-06-15 slice 6      | `bun test packages/sync/src/transactions.test.ts packages/app/src/transaction-review.test.ts packages/api/src/router.test.ts`                                                                                                                                                                                                | Pass    | 20 tests passed for sync response/invalidation/optimistic-review contracts, app permission/cursor behavior, and oRPC route coverage.         |
| 2026-06-15 slice 6      | `bun run check-types`                                                                                                                                                                                                                                                                                                        | Pass    | Full workspace typecheck/build passed; Vite reported the existing large chunk warning.                                                       |
| 2026-06-15 slice 6      | `bun run check`                                                                                                                                                                                                                                                                                                              | Pass    | `oxlint` passed and `oxfmt --write` formatted 197 files.                                                                                     |
| 2026-06-15 slice 6      | `bun test packages/sync/src/transactions.test.ts packages/app/src/transaction-review.test.ts packages/api/src/router.test.ts`                                                                                                                                                                                                | Pass    | Final focused run after formatting: 20 tests passed.                                                                                         |
| 2026-06-15 slice 6      | `bun run check-types`                                                                                                                                                                                                                                                                                                        | Pass    | Final full workspace typecheck/build after formatting passed; Vite reported the existing large chunk warning.                                |
| 2026-06-15 slice 7      | `bun run --filter @dawn/infra check-types`                                                                                                                                                                                                                                                                                   | Pass    | Infra package typecheck passed after adding the Cloudflare resource graph and binding contracts.                                             |
| 2026-06-15 slice 7      | `bun run check-types`                                                                                                                                                                                                                                                                                                        | Pass    | Full workspace typecheck/build passed; Vite reported the existing large chunk warning.                                                       |
| 2026-06-15 slice 7      | `bun run --filter @dawn/infra plan -- --stage preview`                                                                                                                                                                                                                                                                       | Blocked | Alchemy read-only run requires Cloudflare provider configuration or credentials (`alchemy login` or `CLOUDFLARE_API_TOKEN`).                 |
| 2026-06-15 slice 7      | `bun test packages/infra/src/environments.test.ts`                                                                                                                                                                                                                                                                           | Pass    | 4 offline infra contract tests passed for stages, resource names, protected deletion, and runtime binding names.                             |
| 2026-06-15 slice 7      | `bun run --filter server build`                                                                                                                                                                                                                                                                                              | Pass    | Server bundle built successfully; output includes `pg-cloudflare` compatibility path alongside current Postgres driver.                      |
| 2026-06-15 slice 7      | `bun run check`                                                                                                                                                                                                                                                                                                              | Pass    | `oxlint` passed and `oxfmt --write` formatted 204 files.                                                                                     |
| 2026-06-15 slice 7      | `bun test packages/infra/src/environments.test.ts`                                                                                                                                                                                                                                                                           | Pass    | Final focused run after formatting: 4 tests passed.                                                                                          |
| 2026-06-15 slice 8      | `bun run db:generate`                                                                                                                                                                                                                                                                                                        | Pass    | Generated `packages/db/src/migrations/0005_swift_pride.sql` for outbox retry metadata and persisted job runs.                                |
| 2026-06-15 slice 8      | `bun test packages/jobs/src/index.test.ts packages/app/src/outbox-dispatch.test.ts packages/app/src/transaction-review.test.ts packages/app/src/ledger.test.ts packages/app/src/team-permissions.test.ts`                                                                                                                    | Pass    | 35 tests passed for job contracts, dispatcher retry/idempotency behavior, and existing outbox-writing mutations.                             |
| 2026-06-15 slice 8      | `bun run check-types`                                                                                                                                                                                                                                                                                                        | Pass    | Full workspace typecheck/build passed; Vite reported the existing large chunk warning.                                                       |
| 2026-06-15 slice 8      | `bun run check`                                                                                                                                                                                                                                                                                                              | Pass    | `oxlint` passed and `oxfmt --write` formatted 211 files.                                                                                     |
| 2026-06-15 slice 8      | `bun test packages/jobs/src/index.test.ts packages/app/src/outbox-dispatch.test.ts`                                                                                                                                                                                                                                          | Pass    | Final focused rerun after the malformed-message failure path adjustment: 7 tests passed.                                                     |
| 2026-06-15 slice 9      | `bun test packages/sync/src/transactions.test.ts apps/server/src/tenant-coordinator.test.ts packages/jobs/src/index.test.ts packages/app/src/outbox-dispatch.test.ts`                                                                                                                                                        | Pass    | 16 tests passed for realtime protocol messages, transient hub routing, queue-job invalidation normalization, and outbox bridge behavior.     |
| 2026-06-15 slice 9      | `bun run check-types`                                                                                                                                                                                                                                                                                                        | Pass    | Full workspace typecheck/build passed; Vite reported the existing large chunk warning.                                                       |
| 2026-06-15 slice 9      | `bun run check`                                                                                                                                                                                                                                                                                                              | Pass    | `oxlint` passed and `oxfmt --write` formatted 213 files.                                                                                     |
| 2026-06-15 slice 9      | `bun run --filter server build`                                                                                                                                                                                                                                                                                              | Pass    | Server Worker bundle built successfully after adding the default `fetch` plus `queue` export.                                                |
| 2026-06-15 slice 10     | `bun run db:generate`                                                                                                                                                                                                                                                                                                        | Pass    | Generated `packages/db/src/migrations/0006_wise_firebrand.sql` for bank connections, bank accounts, provider objects, and sync runs.         |
| 2026-06-15 slice 10     | `bun test packages/integrations/src/banking.test.ts packages/app/src/banking.test.ts packages/jobs/src/index.test.ts packages/api/src/router.test.ts packages/app/src/ledger.test.ts`                                                                                                                                        | Pass    | 25 tests passed for mock provider contracts, app sync idempotency/duplicates/raw payloads, API routes, queue invalidation, and ledger paths. |
| 2026-06-15 slice 10     | `bun run check-types`                                                                                                                                                                                                                                                                                                        | Pass    | Full workspace typecheck/build passed; Vite reported the existing large chunk warning.                                                       |
| 2026-06-15 slice 10     | `bun run check`                                                                                                                                                                                                                                                                                                              | Pass    | `oxlint` passed and `oxfmt --write` formatted 219 files.                                                                                     |
| 2026-06-15 slice 10     | `bun run --filter server build`                                                                                                                                                                                                                                                                                              | Pass    | Server bundle built successfully after adding banking routes and integration package dependency.                                             |
| 2026-06-15 slice 10     | `bun run dev:web` + `env SKIP_ENV_VALIDATION=true POLAR_ACCESS_TOKEN=dummy bun run dev:server` + browser open `http://localhost:3001/`                                                                                                                                                                                       | Pass    | Web shell loaded against local API; fresh console had only React DevTools info. Authenticated banking-panel interaction remains blocked.     |
| 2026-06-15 slice 12     | `bun run db:generate`                                                                                                                                                                                                                                                                                                        | Pass    | Generated `packages/db/src/migrations/0007_burly_the_call.sql` for document and document version metadata.                                   |
| 2026-06-15 slice 12     | `bun test packages/app/src/documents.test.ts packages/api/src/document-url.test.ts apps/server/src/document-storage.test.ts packages/api/src/router.test.ts`                                                                                                                                                                 | Pass    | 17 tests passed for document metadata, permission denial, signed URLs, R2 memory storage, and API routes.                                    |
| 2026-06-15 slice 12     | `bun run check-types`                                                                                                                                                                                                                                                                                                        | Pass    | Full workspace typecheck/build passed; Vite reported the existing large chunk warning.                                                       |
| 2026-06-15 slice 12     | `bun run check`                                                                                                                                                                                                                                                                                                              | Pass    | `oxlint` passed and `oxfmt --write` formatted 225 files.                                                                                     |
| 2026-06-15 slice 12     | `bun run --filter server build`                                                                                                                                                                                                                                                                                              | Pass    | Server Worker bundle built successfully after adding document upload/download routes.                                                        |
| 2026-06-15 slice 12     | `bun run dev:web` + `env SKIP_ENV_VALIDATION=true POLAR_ACCESS_TOKEN=dummy ... bun run dev:server` + browser open `http://localhost:3001/` and `/dashboard`                                                                                                                                                                  | Partial | Web shell and unauthenticated redirect loaded with no console errors; authenticated document-panel upload/download remains blocked.          |

## Commit Log

| Commit    | Slice or task                        | Notes                                                                                                                      |
| --------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `89c76a3` | Goal contract and package path       | Switched Dawn goal from orchestration to implementor mode.                                                                 |
| `5f81d86` | Transaction review tracer foundation | Hardened exact money formatting, domain review transition, tenant-scoped repository access, and command-aware idempotency. |
| `71bee81` | Team permission foundation           | Added PRD-shaped role permissions, team access resolution, persisted invites, invite API/UI, and invite verification.      |
| `152fa2d` | Team membership lifecycle            | Added invite acceptance, membership creation, managed role updates, lifecycle guards, API routes, and persistence methods. |
| `b89a73f` | Team directory management            | Added team member/pending-invite directory query, manager-only access checks, API route, and dashboard role controls.      |
| `5587580` | Team API contract verification       | Added injectable API router factory and oRPC tests for auth, forbidden, directory data, and not-found error mapping.       |
| `350c577` | Money and ledger core foundation     | Added exact money arithmetic, ledger drafts, duplicate keys, report totals, app/API use cases, DB schema, and migration.   |
| `dc2b2d5` | CSV transaction import foundation    | Added CSV parsing, preview/commit use cases, import sessions, API routes, dashboard upload UI, and verification.           |
| `6d7d4f3` | Transaction sync collection          | Added the sync package, cursor-scoped transaction endpoint, TanStack DB collection hook, and optimistic dashboard review.  |
| `55adf24` | Cloudflare runtime baseline          | Added stage-aware Alchemy resources, Worker bindings, typed runtime helpers, infra contract tests, and environment docs.   |
| `f926ce5` | Outbox dispatcher queue bridge       | Added job contracts, app dispatcher, outbox retry metadata, persisted job runs, Cloudflare queue publisher, and trigger.   |
| `0a83b5c` | Tenant realtime fanout               | Added transaction realtime protocol, TenantCoordinator fanout, queue invalidation bridge, and web subscription refetch.    |
| `28d9e47` | Mock banking provider sync           | Added provider adapter package, mock bank sync use cases, persistence, API routes, dashboard status, and migration.        |

## Implementation Notes

No worker branches are part of implementor mode. Local implementation work added
exact money display formatting in `packages/domain`, moved the dashboard off
local minor-unit division, moved transaction-review state transition metadata
into the domain, required `teamId` on review commands, made idempotency
command-aware, scoped transaction/category repository SQL by team ID, and
generated an idempotency fingerprint migration.

Slice 3 foundation added PRD-shaped permission names, a centralized app-layer
team access resolver, operation-aware idempotency for multiple mutations,
generic audit/outbox repository methods, persisted team invites, a typed invite
API route, and a dashboard invite control gated by returned `team.manage`
permission.

Slice 3 lifecycle follow-up added invite acceptance by matching actor email,
membership creation from accepted invites, typed role update use cases for
managed non-owner roles, generic API routes for accepting invites and role
updates, and repository methods for invite/member lifecycle persistence. Owner
assignment and ownership transfer remain deliberately separate sensitive flows.

Slice 3 directory follow-up added a permission-gated team directory query,
repository reads for team members and pending invites, a typed API route, and
dashboard member-role controls that call the role-update use case.

Slice 3 API verification follow-up made the API router dependency-injectable and
added oRPC-level tests for protected-procedure auth, typed forbidden errors,
team directory payloads, and not-found mapping for selected-team transaction
misses.

Slice 4 foundation added exact minor-unit money arithmetic helpers, ledger
transaction drafts with split validation and deterministic duplicate keys, report
totals for revenue, expenses, profit, balance, and category totals, app-layer
ledger create and summary use cases, protected oRPC ledger routes, Drizzle schema
for ledger accounts/counterparties/tags/splits, transaction metadata indexes, and
the `0003_far_boom_boom` migration. Existing transactions remain compatible via
nullable account/duplicate metadata and default type/source columns.

Slice 5 foundation added exact CSV parsing and decimal amount conversion in the
domain layer, app-layer import preview/commit use cases, duplicate detection
against existing ledger transactions and within the file, persisted CSV import
sessions, protected oRPC preview/commit routes, route tests, and a dashboard CSV
upload panel with column mapping, row status preview, and commit controls.

Slice 6 foundation introduced `packages/sync` for the first transaction
collection contract, including cursor response shape, invalidation event shape,
and optimistic review state modeling. The app layer now exposes a
permission-gated sync use case, the API exposes `sync.transactions`, the Drizzle
repository reads team-scoped changes after `updatedAt` cursors, and the
dashboard review list is backed by a TanStack DB query collection with optimistic
review updates and server-refetch reconciliation.

Slice 7 foundation replaced the web-only Alchemy scaffold with a stage-aware
Cloudflare resource graph for preview, staging, and production. It defines the
API Worker, R2 document bucket, jobs queue and dead-letter queue, KV cache,
TenantCoordinator Durable Object placeholder, and optional Hyperdrive binding.
Shared binding types now make R2, Queue, KV, Durable Object, and Hyperdrive
bindings available to server/runtime code, and the server exports a minimal
TenantCoordinator class for Worker migration compatibility. Environment and
secret expectations are documented in `docs/deployment/CLOUDFLARE.md`.

Slice 8 foundation added `packages/jobs` for queue names, retry policy, outbox
dispatch job messages, and transaction sync invalidation messages. The app layer
now has a repository-backed dispatcher that claims due outbox events, publishes
Cloudflare Queue messages, persists queued or failed job runs, and records retry
metadata. Drizzle persists dispatch attempts, last error, next attempt time, and
`job_run` rows via migration `0005_swift_pride`. The server exposes a narrow
`POST /internal/outbox/dispatch` trigger guarded by `BETTER_AUTH_SECRET` bearer
auth and backed by the `DAWN_JOBS` queue binding.

Slice 9 foundation replaced the placeholder TenantCoordinator with transient
WebSocket subscription routing for transaction sync invalidations. The server
authorizes `/sync/transactions/subscribe` through the app-layer
`transactions.read` access check before handing the socket to the team-named
Durable Object. Queue `sync.invalidate` jobs now publish transaction invalidation
events to the TenantCoordinator, and the dashboard transaction sync hook
subscribes, refetches on connect/reconnect, and refetches when matching
team-scoped invalidations arrive. The Durable Object stores only in-memory
socket subscriptions and does not use Durable Object storage for domain state.

Slice 10 foundation introduced `packages/integrations` with a stable banking
provider port and deterministic mock bank adapter. The app layer can connect the
mock provider, sync provider accounts into canonical ledger accounts, normalize
provider transactions into ledger transactions with `source: "bank_sync"`,
deduplicate by provider transaction ID and Dawn duplicate key, preserve raw
provider connection/account/transaction payloads, persist provider sync runs, and
emit audit/outbox events. The API exposes protected banking list/connect/sync
routes, the dashboard shows mock connection/account/latest-sync status, and
migration `0006_wise_firebrand` adds `bank_connection`, `bank_account`,
`provider_object`, and `provider_sync_run`.

Slice 12 foundation added app-layer document upload, completion, list, and
download use cases behind `documents.read`/`documents.write` team permissions.
Upload preparation is idempotent and stores metadata in Postgres; upload
completion updates the current document version and writes audit plus
`document.uploaded` outbox events. The API now exposes document list, upload
preparation, and download signing routes; the server exposes signed
`PUT /documents/upload/:token` and `GET /documents/download/:token` routes
backed by the `DAWN_DOCUMENTS` R2 binding. Migration `0007_burly_the_call`
adds `document` and `document_version`, and the dashboard includes a compact
documents panel that uploads file bytes to the signed URL and requests signed
downloads through the protected API.

## Blockers And Watch Items

- Live banking, payment, email, AI, and Cloudflare provider work may require
  unavailable credentials. Continue with ports, fake adapters, fixtures, and
  local harnesses; mark only live wiring blocked.
- `bun run check` currently runs `oxfmt --write`; inspect formatting diffs after
  using it.
- `apps/worker`, `packages/integrations`, and
  `packages/ai` should be introduced only when their slice owns real contracts.
- Checked-in server env lacks `POLAR_ACCESS_TOKEN`; full authenticated dashboard
  smoke needs valid local auth/payment env or a test-mode auth bypass.
- Cloudflare live planning/deploy remains blocked until `alchemy login` is run or
  `CLOUDFLARE_API_TOKEN` is set for the target account. Offline infra contract
  tests and typechecks cover the baseline in the meantime.
- Authenticated transaction-review UI exercise remains blocked until a local
  session/test auth path is available. Current local smoke verifies server,
  RPC health, auth-session null response, and the web shell only.
- Slice 3 still needs live authenticated manual verification with at least two
  users or seeded actors before it can be marked complete. Membership accepting,
  role changes, recent-auth/MFA gates, permission overrides, API keys, and OAuth
  actors remain future work under later identity/public API slices.
- When a development database is available, apply migrations and add a
  repository-level database test for transaction rollback and tenant predicates.
- Slice 4 still needs UI affordances, transfer-pair semantics, tag/counterparty
  management use cases, and database-backed report integration tests before it
  should be marked complete.
- Slice 5 still needs authenticated browser/manual import verification against a
  migrated local database and richer CSV mapping variants before it should be
  marked complete.
- Slice 6 still needs authenticated two-session browser verification and a
  deployed/local Worker-bound realtime invalidation exercise before it should be
  marked complete.
- Slice 8 still needs a migrated local or preview database plus a Worker-bound
  queue to manually trigger a real persisted outbox event end to end.
- Slice 9 still needs live two-session browser verification against a Worker
  runtime with Durable Object and Queue bindings; local unit/build checks cover
  routing, protocol, and type contracts only.
- Slice 10 still needs authenticated manual interaction against a migrated local
  or preview database. Current verification covers adapter/app/API contracts and
  web shell smoke, but not clicking the banking panel through a live session.
- Slice 12 still needs authenticated manual upload/download against a migrated
  local or preview database with an R2-compatible `DAWN_DOCUMENTS` binding.
  Current verification covers app/API/server contracts, signer behavior, memory
  object storage, server bundle, and unauthenticated web-shell smoke.
