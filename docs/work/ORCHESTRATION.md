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

| #   | Slice                                                        | Status                                                          | Dependencies             | Verification                                                                                                             |
| --- | ------------------------------------------------------------ | --------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| 1   | Architecture Decision Baseline                               | Accepted for startup                                            | None                     | Manual ADR review complete; markdown/link check if added.                                                                |
| 2   | Transaction Review Tracer Slice                              | Verified foundation, authenticated manual review blocked        | Slice 1                  | Focused domain/app tests, `bun run check-types`, `bun run check`, local server/web smoke.                                |
| 3   | Team Context And Permission Model                            | API-verified foundation in progress                             | Slice 2                  | Role matrix, directory, invite, acceptance, role update, and API contract tests; `bun run check-types`; `bun run check`. |
| 4   | Money And Ledger Core                                        | Verified metadata/transfer foundation, DB/manual review blocked | Slice 3                  | Money/domain tests; duplicate/split/metadata/transfer tests; release gate; browser redirect smoke.                       |
| 5   | CSV Transaction Import                                       | UI/API-verified foundation in progress                          | Slice 4                  | Parser tests; preview/duplicate/commit tests; typecheck/check; web build.                                                |
| 6   | TanStack DB Sync Tracer                                      | UI/API-verified foundation in progress                          | Slices 2, 3              | Sync contract tests; API cursor tests; dashboard collection wiring; typecheck/check.                                     |
| 7   | Cloudflare Infrastructure Baseline                           | Verified foundation, live plan blocked on CF auth               | Slice 1                  | Infra contract test; server bundle; `bun run check-types`; `bun run check`; credentialed Alchemy plan blocked.           |
| 8   | Outbox Dispatcher And Queue Bridge                           | Verified foundation in progress                                 | Slices 2, 7              | Job contract tests; dispatcher retry/idempotency tests; typecheck/check.                                                 |
| 9   | Tenant Durable Object Realtime Fanout                        | Verified foundation, live multi-client blocked                  | Slices 6, 8              | Subscription routing tests; sync protocol tests; Worker/server build; typecheck/check.                                   |
| 10  | Banking Provider Adapter Interface And Mock Provider         | Verified foundation, live manual sync blocked                   | Slices 4, 8              | Adapter/app/API tests; migration; dashboard/server smoke; typecheck/check.                                               |
| 11  | First Real Banking Provider                                  | Verified sandbox foundation, live provider credentials blocked  | Slice 10                 | Sandbox provider/app/API/job tests; migration; typecheck; unauthenticated browser smoke.                                 |
| 12  | Documents And R2 Storage                                     | Verified foundation, manual upload/download blocked             | Slices 3, 7, 8           | Metadata/permission tests; R2 mock/local test; web/server smoke.                                                         |
| 13  | Inbox And Document Extraction Pipeline                       | Verified foundation, manual inbox review blocked                | Slice 12                 | Extraction/job/app/API/server tests; migration; web/server smoke.                                                        |
| 14  | Inbox-To-Transaction Matching                                | Verified foundation, manual matching review blocked             | Slices 4, 13             | Matching domain/app/API tests; migration; typecheck/check.                                                               |
| 15  | Customers And Invoice Drafts                                 | Verified foundation, manual draft review blocked                | Slices 3, 4              | Invoice domain/app/API tests; migration; typecheck/check.                                                                |
| 16  | Invoice Delivery, PDF, Payments, And Recurrence              | Verified foundation, manual sandbox send blocked                | Slices 15, 8             | Lifecycle/app/API/job tests; migration; typecheck/check; HTTP web smoke.                                                 |
| 17  | Projects And Time Tracking                                   | Verified foundation, manual time flow blocked                   | Slice 15                 | Time totals/conversion tests; project/time API tests; migration; typecheck/check; HTTP web smoke.                        |
| 18  | Reporting And Weekly Insights                                | Verified foundation, authenticated dashboard review blocked     | Slices 4, 14, 16, 17     | Report fixture tests; mocked insight tests; job/API tests; typecheck/check; HTTP/browser smoke.                          |
| 19  | TanStack AI Assistant Read And Suggest Tools                 | Verified foundation, authenticated assistant review blocked     | Slice 18                 | Tool schema tests; app/API permission tests; migration; typecheck/check; HTTP/browser smoke.                             |
| 20  | AI Draft, Mutate, And Approval Gates                         | Verified foundation, authenticated approval flow blocked        | Slice 19                 | Approval-gated draft/mutate/send tests; API tests; migration; typecheck/check; HTTP/browser smoke.                       |
| 21  | AI Evaluation Harness                                        | Verified deterministic foundation, provider evals blocked       | Slices 19, 20            | Deterministic eval fixtures, runner, release gate, focused tests, typecheck/check.                                       |
| 22  | Automation Rules                                             | Verified foundation, live/manual automation review blocked      | Slices 8, 20             | Rule/action tests; protected API tests; job contract tests; migration; typecheck/check.                                  |
| 23  | Public API, OAuth Apps, API Keys, And Webhooks               | Verified foundation, live integration review blocked            | Slices 3, 8              | API contract tests; scope tests; webhook retry/failure tests; migration; typecheck/check.                                |
| 24  | Accounting, Payments, Messaging, And Email Provider Adapters | Verified foundation, live provider review blocked               | Slices 16, 23            | Adapter contract tests; app/API tests; migration; typecheck/check; manual status review blocked.                         |
| 25  | Desktop Quick Capture And Native Shell Deepening             | Verified foundation, installed desktop review blocked           | Slices 12, 13            | Desktop build/smoke; file capture test.                                                                                  |
| 26  | Observability, Admin Tools, And Operations                   | Verified foundation, live ops review blocked                    | Slices 8, 11, 16, 20     | Controlled failure; redaction review; data workflow tests.                                                               |
| 27  | Security Hardening And Release Gates                         | Verified local release gate, live CI review blocked             | Broad product foundation | Release gate command; tenant isolation tests; rate-limit tests; file URL and webhook signature tests.                    |

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

| Time                          | Command or check                                                                                                                                                                                                                                                                                                             | Result  | Notes                                                                                                                                                                                                  |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-06-14 startup            | `git status --short`                                                                                                                                                                                                                                                                                                         | Pass    | Clean worktree.                                                                                                                                                                                        |
| 2026-06-14 startup            | `bun test packages/app/src/transaction-review.test.ts`                                                                                                                                                                                                                                                                       | Pass    | 5 tests passed.                                                                                                                                                                                        |
| 2026-06-14 startup            | `bun run check-types`                                                                                                                                                                                                                                                                                                        | Pass    | Typecheck/build passed; Vite reported a large chunk warning.                                                                                                                                           |
| 2026-06-14 continuation       | `git status --short --branch`                                                                                                                                                                                                                                                                                                | Info    | Dirty continuation baseline: old goal package deleted, Dawn goal package and this log untracked.                                                                                                       |
| 2026-06-14 continuation       | `bun test packages/domain/src/money.test.ts packages/app/src/transaction-review.test.ts`                                                                                                                                                                                                                                     | Pass    | 8 tests passed after exact money display hardening.                                                                                                                                                    |
| 2026-06-14 continuation       | `bun run check-types`                                                                                                                                                                                                                                                                                                        | Pass    | Full workspace typecheck/build passed; Vite reported a large chunk warning.                                                                                                                            |
| 2026-06-14 continuation       | `bun run db:generate`                                                                                                                                                                                                                                                                                                        | Pass    | Generated `packages/db/src/migrations/0001_powerful_talos.sql` for idempotency fingerprints.                                                                                                           |
| 2026-06-14 continuation       | `bun test packages/domain/src/money.test.ts packages/domain/src/transaction-review.test.ts packages/app/src/transaction-review.test.ts`                                                                                                                                                                                      | Pass    | 11 tests passed after domain transition, command-aware idempotency, and tenant-scoped repository hardening.                                                                                            |
| 2026-06-14 continuation       | `bun run check-types`                                                                                                                                                                                                                                                                                                        | Pass    | Full workspace typecheck/build passed; Vite reported a large chunk warning.                                                                                                                            |
| 2026-06-14 continuation       | `bun run check`                                                                                                                                                                                                                                                                                                              | Pass    | `oxlint` passed and `oxfmt --write` formatted 182 files.                                                                                                                                               |
| 2026-06-14 continuation       | `bun run dev:server`                                                                                                                                                                                                                                                                                                         | Blocked | Fails with checked-in env because `POLAR_ACCESS_TOKEN` is missing.                                                                                                                                     |
| 2026-06-14 continuation       | `env SKIP_ENV_VALIDATION=true POLAR_ACCESS_TOKEN=dummy bun run dev:server`                                                                                                                                                                                                                                                   | Pass    | Smoke server started on `http://localhost:3000`; health RPC and auth session requests returned 200.                                                                                                    |
| 2026-06-14 continuation       | `bun run dev:web`                                                                                                                                                                                                                                                                                                            | Pass    | Added missing web `dev` script; documented root command starts Vite on `http://localhost:3001`.                                                                                                        |
| 2026-06-14 continuation       | Browser smoke at `http://localhost:3001`                                                                                                                                                                                                                                                                                     | Pass    | Landing page rendered, API status showed connected, `/dashboard` redirected to login when unauthenticated.                                                                                             |
| 2026-06-14 continuation       | `bun test packages/domain/src/money.test.ts packages/domain/src/transaction-review.test.ts packages/app/src/transaction-review.test.ts`                                                                                                                                                                                      | Pass    | Final focused test run: 11 tests passed.                                                                                                                                                               |
| 2026-06-14 continuation       | `bun run check-types`                                                                                                                                                                                                                                                                                                        | Pass    | Final full workspace typecheck/build passed; Vite reported a large chunk warning.                                                                                                                      |
| 2026-06-14 continuation       | `bun run check`                                                                                                                                                                                                                                                                                                              | Pass    | Final `oxlint` and `oxfmt --write` passed on 184 files.                                                                                                                                                |
| 2026-06-15 continuation       | `bun test packages/domain/src/money.test.ts packages/domain/src/transaction-review.test.ts packages/app/src/transaction-review.test.ts`                                                                                                                                                                                      | Pass    | 11 tests passed for money formatting, domain review transition, permissions, tenant scoping, and idempotency.                                                                                          |
| 2026-06-15 continuation       | `bun run check-types`                                                                                                                                                                                                                                                                                                        | Pass    | Full workspace typecheck/build passed; Vite reported the existing large chunk warning.                                                                                                                 |
| 2026-06-15 continuation       | `bun run check`                                                                                                                                                                                                                                                                                                              | Pass    | `oxlint` passed and `oxfmt --write` formatted 183 files.                                                                                                                                               |
| 2026-06-15 continuation       | `env SKIP_ENV_VALIDATION=true POLAR_ACCESS_TOKEN=dummy bun run dev:server`                                                                                                                                                                                                                                                   | Pass    | API server started on `http://localhost:3000`; `GET /`, `POST /rpc/healthCheck`, and auth session returned 200.                                                                                        |
| 2026-06-15 continuation       | `bun run dev:web`                                                                                                                                                                                                                                                                                                            | Pass    | Vite dev server started on `http://localhost:3001`; HTTP shell returned 200.                                                                                                                           |
| 2026-06-15 continuation       | Browser smoke at `http://localhost:3001`                                                                                                                                                                                                                                                                                     | Blocked | Shared in-app browser profile was locked; isolated Playwright was unavailable in the Node REPL. Used HTTP smoke instead.                                                                               |
| 2026-06-15 slice 3            | `bun test packages/domain/src/permissions.test.ts packages/domain/src/money.test.ts packages/domain/src/transaction-review.test.ts packages/app/src/team-permissions.test.ts packages/app/src/transaction-review.test.ts`                                                                                                    | Pass    | 20 tests passed for role permissions, team access resolution, invites, idempotency, transaction review, and money.                                                                                     |
| 2026-06-15 slice 3            | `bun run db:generate`                                                                                                                                                                                                                                                                                                        | Pass    | Generated `packages/db/src/migrations/0002_dazzling_supreme_intelligence.sql` for `team_invite`.                                                                                                       |
| 2026-06-15 slice 3            | `bun run check-types`                                                                                                                                                                                                                                                                                                        | Pass    | Full workspace typecheck/build passed; Vite reported the existing large chunk warning.                                                                                                                 |
| 2026-06-15 slice 3            | `bun run check`                                                                                                                                                                                                                                                                                                              | Pass    | `oxlint` passed and `oxfmt --write` formatted 186 files.                                                                                                                                               |
| 2026-06-15 slice 3            | `bun test packages/domain/src/permissions.test.ts packages/domain/src/money.test.ts packages/domain/src/transaction-review.test.ts packages/app/src/team-permissions.test.ts packages/app/src/transaction-review.test.ts`                                                                                                    | Pass    | 26 tests passed after adding invite acceptance, member role updates, and lifecycle guard rails.                                                                                                        |
| 2026-06-15 slice 3            | `bun run check-types`                                                                                                                                                                                                                                                                                                        | Pass    | Full workspace typecheck/build passed; Vite reported the existing large chunk warning.                                                                                                                 |
| 2026-06-15 slice 3            | `bun run check`                                                                                                                                                                                                                                                                                                              | Pass    | `oxlint` passed and `oxfmt --write` formatted 186 files.                                                                                                                                               |
| 2026-06-15 slice 3            | `bun test packages/domain/src/permissions.test.ts packages/domain/src/money.test.ts packages/domain/src/transaction-review.test.ts packages/app/src/team-permissions.test.ts packages/app/src/transaction-review.test.ts`                                                                                                    | Pass    | 28 tests passed after adding team directory query coverage and manager-only access checks.                                                                                                             |
| 2026-06-15 slice 3            | `bun run check-types`                                                                                                                                                                                                                                                                                                        | Pass    | Full workspace typecheck/build passed; Vite reported the existing large chunk warning.                                                                                                                 |
| 2026-06-15 slice 3            | `bun run check`                                                                                                                                                                                                                                                                                                              | Pass    | `oxlint` passed and `oxfmt --write` formatted 186 files.                                                                                                                                               |
| 2026-06-15 slice 3            | `bun test packages/api/src/router.test.ts packages/domain/src/permissions.test.ts packages/domain/src/money.test.ts packages/domain/src/transaction-review.test.ts packages/app/src/team-permissions.test.ts packages/app/src/transaction-review.test.ts`                                                                    | Pass    | 32 tests passed after adding API router contract coverage for auth, forbidden, directory data, and not-found mapping.                                                                                  |
| 2026-06-15 slice 3            | `bun run check-types`                                                                                                                                                                                                                                                                                                        | Pass    | Full workspace typecheck/build passed; Vite reported the existing large chunk warning.                                                                                                                 |
| 2026-06-15 slice 3            | `bun run check`                                                                                                                                                                                                                                                                                                              | Pass    | `oxlint` passed and `oxfmt --write` formatted 187 files.                                                                                                                                               |
| 2026-06-15 slice 4            | `bun test packages/domain/src/money.test.ts packages/domain/src/ledger.test.ts packages/domain/src/permissions.test.ts packages/domain/src/transaction-review.test.ts packages/app/src/ledger.test.ts packages/app/src/transaction-review.test.ts packages/app/src/team-permissions.test.ts packages/api/src/router.test.ts` | Pass    | 44 tests passed for exact money math, ledger duplicate keys, split validation, reporting totals, app use cases, and API route coverage.                                                                |
| 2026-06-15 slice 4            | `bun run db:generate`                                                                                                                                                                                                                                                                                                        | Pass    | Generated `packages/db/src/migrations/0003_far_boom_boom.sql` for ledger accounts, counterparties, tags, splits, and transaction metadata.                                                             |
| 2026-06-15 slice 4            | `bun run check-types`                                                                                                                                                                                                                                                                                                        | Pass    | Full workspace typecheck/build passed; Vite reported the existing large chunk warning.                                                                                                                 |
| 2026-06-15 slice 4            | `bun run check`                                                                                                                                                                                                                                                                                                              | Pass    | `oxlint` passed and `oxfmt --write` formatted 190 files.                                                                                                                                               |
| 2026-06-15 slice 4            | `bun test packages/domain/src/money.test.ts packages/domain/src/ledger.test.ts packages/domain/src/permissions.test.ts packages/domain/src/transaction-review.test.ts packages/app/src/ledger.test.ts packages/app/src/transaction-review.test.ts packages/app/src/team-permissions.test.ts packages/api/src/router.test.ts` | Pass    | Final focused run after formatting: 44 tests passed.                                                                                                                                                   |
| 2026-06-15 slice 5            | `bun test packages/domain/src/csv-import.test.ts packages/domain/src/money.test.ts packages/domain/src/ledger.test.ts packages/app/src/ledger.test.ts packages/app/src/transaction-review.test.ts packages/app/src/team-permissions.test.ts packages/api/src/router.test.ts`                                                 | Pass    | 46 tests passed for CSV parsing, exact amount conversion, preview/duplicate/invalid rows, commit idempotency, audit/outbox, and API routes.                                                            |
| 2026-06-15 slice 5            | `bun run db:generate`                                                                                                                                                                                                                                                                                                        | Pass    | Generated `packages/db/src/migrations/0004_majestic_amazoness.sql` for `transaction_import_session`.                                                                                                   |
| 2026-06-15 slice 5            | `bun run check-types`                                                                                                                                                                                                                                                                                                        | Pass    | Full workspace typecheck/build passed; Vite reported the existing large chunk warning.                                                                                                                 |
| 2026-06-15 slice 5            | `bun run check`                                                                                                                                                                                                                                                                                                              | Pass    | `oxlint` passed and `oxfmt --write` formatted 192 files.                                                                                                                                               |
| 2026-06-15 slice 5            | `bun test packages/domain/src/csv-import.test.ts packages/domain/src/money.test.ts packages/domain/src/ledger.test.ts packages/app/src/ledger.test.ts packages/app/src/transaction-review.test.ts packages/app/src/team-permissions.test.ts packages/api/src/router.test.ts`                                                 | Pass    | Final focused run after formatting: 46 tests passed.                                                                                                                                                   |
| 2026-06-15 slice 5            | `bun test packages/domain/src/csv-import.test.ts packages/app/src/ledger.test.ts packages/api/src/router.test.ts`                                                                                                                                                                                                            | Pass    | 17 changed-path tests passed after typed CSV file-error mapping.                                                                                                                                       |
| 2026-06-15 slice 6            | `bun test packages/sync/src/transactions.test.ts packages/app/src/transaction-review.test.ts packages/api/src/router.test.ts`                                                                                                                                                                                                | Pass    | 20 tests passed for sync response/invalidation/optimistic-review contracts, app permission/cursor behavior, and oRPC route coverage.                                                                   |
| 2026-06-15 slice 6            | `bun run check-types`                                                                                                                                                                                                                                                                                                        | Pass    | Full workspace typecheck/build passed; Vite reported the existing large chunk warning.                                                                                                                 |
| 2026-06-15 slice 6            | `bun run check`                                                                                                                                                                                                                                                                                                              | Pass    | `oxlint` passed and `oxfmt --write` formatted 197 files.                                                                                                                                               |
| 2026-06-15 slice 6            | `bun test packages/sync/src/transactions.test.ts packages/app/src/transaction-review.test.ts packages/api/src/router.test.ts`                                                                                                                                                                                                | Pass    | Final focused run after formatting: 20 tests passed.                                                                                                                                                   |
| 2026-06-15 slice 6            | `bun run check-types`                                                                                                                                                                                                                                                                                                        | Pass    | Final full workspace typecheck/build after formatting passed; Vite reported the existing large chunk warning.                                                                                          |
| 2026-06-15 slice 7            | `bun run --filter @dawn/infra check-types`                                                                                                                                                                                                                                                                                   | Pass    | Infra package typecheck passed after adding the Cloudflare resource graph and binding contracts.                                                                                                       |
| 2026-06-15 slice 7            | `bun run check-types`                                                                                                                                                                                                                                                                                                        | Pass    | Full workspace typecheck/build passed; Vite reported the existing large chunk warning.                                                                                                                 |
| 2026-06-15 slice 7            | `bun run --filter @dawn/infra plan -- --stage preview`                                                                                                                                                                                                                                                                       | Blocked | Alchemy read-only run requires Cloudflare provider configuration or credentials (`alchemy login` or `CLOUDFLARE_API_TOKEN`).                                                                           |
| 2026-06-15 slice 7            | `bun test packages/infra/src/environments.test.ts`                                                                                                                                                                                                                                                                           | Pass    | 4 offline infra contract tests passed for stages, resource names, protected deletion, and runtime binding names.                                                                                       |
| 2026-06-15 slice 7            | `bun run --filter server build`                                                                                                                                                                                                                                                                                              | Pass    | Server bundle built successfully; output includes `pg-cloudflare` compatibility path alongside current Postgres driver.                                                                                |
| 2026-06-15 slice 7            | `bun run check`                                                                                                                                                                                                                                                                                                              | Pass    | `oxlint` passed and `oxfmt --write` formatted 204 files.                                                                                                                                               |
| 2026-06-15 slice 7            | `bun test packages/infra/src/environments.test.ts`                                                                                                                                                                                                                                                                           | Pass    | Final focused run after formatting: 4 tests passed.                                                                                                                                                    |
| 2026-06-15 slice 8            | `bun run db:generate`                                                                                                                                                                                                                                                                                                        | Pass    | Generated `packages/db/src/migrations/0005_swift_pride.sql` for outbox retry metadata and persisted job runs.                                                                                          |
| 2026-06-15 slice 8            | `bun test packages/jobs/src/index.test.ts packages/app/src/outbox-dispatch.test.ts packages/app/src/transaction-review.test.ts packages/app/src/ledger.test.ts packages/app/src/team-permissions.test.ts`                                                                                                                    | Pass    | 35 tests passed for job contracts, dispatcher retry/idempotency behavior, and existing outbox-writing mutations.                                                                                       |
| 2026-06-15 slice 8            | `bun run check-types`                                                                                                                                                                                                                                                                                                        | Pass    | Full workspace typecheck/build passed; Vite reported the existing large chunk warning.                                                                                                                 |
| 2026-06-15 slice 8            | `bun run check`                                                                                                                                                                                                                                                                                                              | Pass    | `oxlint` passed and `oxfmt --write` formatted 211 files.                                                                                                                                               |
| 2026-06-15 slice 8            | `bun test packages/jobs/src/index.test.ts packages/app/src/outbox-dispatch.test.ts`                                                                                                                                                                                                                                          | Pass    | Final focused rerun after the malformed-message failure path adjustment: 7 tests passed.                                                                                                               |
| 2026-06-15 slice 9            | `bun test packages/sync/src/transactions.test.ts apps/server/src/tenant-coordinator.test.ts packages/jobs/src/index.test.ts packages/app/src/outbox-dispatch.test.ts`                                                                                                                                                        | Pass    | 16 tests passed for realtime protocol messages, transient hub routing, queue-job invalidation normalization, and outbox bridge behavior.                                                               |
| 2026-06-15 slice 9            | `bun run check-types`                                                                                                                                                                                                                                                                                                        | Pass    | Full workspace typecheck/build passed; Vite reported the existing large chunk warning.                                                                                                                 |
| 2026-06-15 slice 9            | `bun run check`                                                                                                                                                                                                                                                                                                              | Pass    | `oxlint` passed and `oxfmt --write` formatted 213 files.                                                                                                                                               |
| 2026-06-15 slice 9            | `bun run --filter server build`                                                                                                                                                                                                                                                                                              | Pass    | Server Worker bundle built successfully after adding the default `fetch` plus `queue` export.                                                                                                          |
| 2026-06-15 slice 10           | `bun run db:generate`                                                                                                                                                                                                                                                                                                        | Pass    | Generated `packages/db/src/migrations/0006_wise_firebrand.sql` for bank connections, bank accounts, provider objects, and sync runs.                                                                   |
| 2026-06-15 slice 10           | `bun test packages/integrations/src/banking.test.ts packages/app/src/banking.test.ts packages/jobs/src/index.test.ts packages/api/src/router.test.ts packages/app/src/ledger.test.ts`                                                                                                                                        | Pass    | 25 tests passed for mock provider contracts, app sync idempotency/duplicates/raw payloads, API routes, queue invalidation, and ledger paths.                                                           |
| 2026-06-15 slice 10           | `bun run check-types`                                                                                                                                                                                                                                                                                                        | Pass    | Full workspace typecheck/build passed; Vite reported the existing large chunk warning.                                                                                                                 |
| 2026-06-15 slice 10           | `bun run check`                                                                                                                                                                                                                                                                                                              | Pass    | `oxlint` passed and `oxfmt --write` formatted 219 files.                                                                                                                                               |
| 2026-06-15 slice 10           | `bun run --filter server build`                                                                                                                                                                                                                                                                                              | Pass    | Server bundle built successfully after adding banking routes and integration package dependency.                                                                                                       |
| 2026-06-15 slice 10           | `bun run dev:web` + `env SKIP_ENV_VALIDATION=true POLAR_ACCESS_TOKEN=dummy bun run dev:server` + browser open `http://localhost:3001/`                                                                                                                                                                                       | Pass    | Web shell loaded against local API; fresh console had only React DevTools info. Authenticated banking-panel interaction remains blocked.                                                               |
| 2026-06-15 slice 12           | `bun run db:generate`                                                                                                                                                                                                                                                                                                        | Pass    | Generated `packages/db/src/migrations/0007_burly_the_call.sql` for document and document version metadata.                                                                                             |
| 2026-06-15 slice 12           | `bun test packages/app/src/documents.test.ts packages/api/src/document-url.test.ts apps/server/src/document-storage.test.ts packages/api/src/router.test.ts`                                                                                                                                                                 | Pass    | 17 tests passed for document metadata, permission denial, signed URLs, R2 memory storage, and API routes.                                                                                              |
| 2026-06-15 slice 12           | `bun run check-types`                                                                                                                                                                                                                                                                                                        | Pass    | Full workspace typecheck/build passed; Vite reported the existing large chunk warning.                                                                                                                 |
| 2026-06-15 slice 12           | `bun run check`                                                                                                                                                                                                                                                                                                              | Pass    | `oxlint` passed and `oxfmt --write` formatted 225 files.                                                                                                                                               |
| 2026-06-15 slice 12           | `bun run --filter server build`                                                                                                                                                                                                                                                                                              | Pass    | Server Worker bundle built successfully after adding document upload/download routes.                                                                                                                  |
| 2026-06-15 slice 12           | `bun run dev:web` + `env SKIP_ENV_VALIDATION=true POLAR_ACCESS_TOKEN=dummy ... bun run dev:server` + browser open `http://localhost:3001/` and `/dashboard`                                                                                                                                                                  | Partial | Web shell and unauthenticated redirect loaded with no console errors; authenticated document-panel upload/download remains blocked.                                                                    |
| 2026-06-15 slice 13           | `bun run db:generate`                                                                                                                                                                                                                                                                                                        | Pass    | Generated `packages/db/src/migrations/0008_blue_misty_knight.sql` for inbox sources, inbox items, and document extraction versions.                                                                    |
| 2026-06-15 slice 13           | `bun test packages/jobs/src/index.test.ts packages/app/src/documents.test.ts packages/app/src/inbox-extraction.test.ts apps/server/src/document-extraction.test.ts packages/api/src/router.test.ts`                                                                                                                          | Pass    | 25 tests passed for extraction job contract, inbox creation, deterministic extraction, corrections, worker success/failure, and API routes.                                                            |
| 2026-06-15 slice 13           | `bun run check`                                                                                                                                                                                                                                                                                                              | Pass    | `oxlint` passed and `oxfmt --write` formatted 229 files.                                                                                                                                               |
| 2026-06-15 slice 13           | `bun run --filter server build`                                                                                                                                                                                                                                                                                              | Pass    | Server Worker bundle built successfully after adding document extraction queue processing.                                                                                                             |
| 2026-06-15 slice 13           | `bun run check-types`                                                                                                                                                                                                                                                                                                        | Pass    | Full workspace typecheck/build passed; Vite reported the existing large chunk warning.                                                                                                                 |
| 2026-06-15 slice 13           | `bun run dev:web` + `env SKIP_ENV_VALIDATION=true POLAR_ACCESS_TOKEN=dummy ... bun run dev:server` + browser open `http://localhost:3001/` and `/dashboard`                                                                                                                                                                  | Partial | Web shell and unauthenticated redirect loaded with no console errors; authenticated inbox review remains blocked.                                                                                      |
| 2026-06-15 slice 14           | `bun run db:generate`                                                                                                                                                                                                                                                                                                        | Pass    | Generated `packages/db/src/migrations/0009_jazzy_paladin.sql` for inbox match suggestions, transaction attachments, aliases, and hard negatives.                                                       |
| 2026-06-15 slice 14           | `bun test packages/domain/src/matching.test.ts packages/app/src/inbox-matching.test.ts packages/api/src/router.test.ts`                                                                                                                                                                                                      | Pass    | 20 tests passed for deterministic scoring, sender support, hard-negative suppression, accept/reject use cases, and protected match routes.                                                             |
| 2026-06-15 slice 14           | `bun run check`                                                                                                                                                                                                                                                                                                              | Pass    | `oxlint` passed and `oxfmt --write` formatted 232 files.                                                                                                                                               |
| 2026-06-15 slice 14           | `bun run check-types`                                                                                                                                                                                                                                                                                                        | Pass    | Full workspace typecheck/build passed; Vite reported the existing large chunk warning.                                                                                                                 |
| 2026-06-15 slice 15           | `bun run db:generate`                                                                                                                                                                                                                                                                                                        | Pass    | Generated `packages/db/src/migrations/0010_odd_pyro.sql` for customers, contacts, products, invoices, and invoice lines.                                                                               |
| 2026-06-15 slice 15           | `bun test packages/domain/src/invoice.test.ts packages/app/src/billing.test.ts packages/api/src/router.test.ts`                                                                                                                                                                                                              | Pass    | 21 tests passed for invoice totals/state rules, customer/product/draft use cases, and protected billing routes.                                                                                        |
| 2026-06-15 slice 15           | `bun run check`                                                                                                                                                                                                                                                                                                              | Pass    | `oxlint` passed and `oxfmt --write` formatted 235 files.                                                                                                                                               |
| 2026-06-15 slice 15           | `bun run check-types`                                                                                                                                                                                                                                                                                                        | Pass    | Full workspace typecheck/build passed; Vite reported the existing large chunk warning.                                                                                                                 |
| 2026-06-15 slice 15           | `bun run dev:web` + `env SKIP_ENV_VALIDATION=true POLAR_ACCESS_TOKEN=dummy bun run dev:server` + browser open `http://localhost:3001/` and `/dashboard`                                                                                                                                                                      | Partial | Web shell and unauthenticated redirect loaded with no console errors; authenticated billing draft workflow remains blocked.                                                                            |
| 2026-06-15 slice 16           | `bun run db:generate`                                                                                                                                                                                                                                                                                                        | Pass    | Generated `packages/db/src/migrations/0011_secret_captain_flint.sql` for invoice lifecycle fields, payments, invoice events, and recurrence.                                                           |
| 2026-06-15 slice 16           | `bun test packages/domain/src/invoice.test.ts packages/integrations/src/invoice-delivery.test.ts packages/jobs/src/index.test.ts packages/app/src/billing.test.ts packages/api/src/router.test.ts`                                                                                                                           | Pass    | 32 tests passed for lifecycle transitions, delivery provider, recurring queue jobs, send/payment/recurrence use cases, and protected routes.                                                           |
| 2026-06-15 slice 16           | `bun run check-types`                                                                                                                                                                                                                                                                                                        | Pass    | Full workspace typecheck/build passed; Vite reported the existing large chunk warning.                                                                                                                 |
| 2026-06-15 slice 16           | `bun run check`                                                                                                                                                                                                                                                                                                              | Pass    | `oxlint` passed and `oxfmt --write` formatted 237 files.                                                                                                                                               |
| 2026-06-15 slice 16           | `bun run dev:web` + `curl -i http://localhost:3001/` and `/dashboard`                                                                                                                                                                                                                                                        | Partial | Vite served both routes with 200 responses; browser console smoke was blocked because Playwright was unavailable and Browser navigation was not exposed.                                               |
| 2026-06-15 slice 17           | `bun run db:generate`                                                                                                                                                                                                                                                                                                        | Pass    | Generated `packages/db/src/migrations/0012_careless_stick.sql` for projects, project members, and time entries.                                                                                        |
| 2026-06-15 slice 17           | `bun test packages/domain/src/project-time.test.ts packages/app/src/projects.test.ts packages/api/src/router.test.ts packages/sync/src/transactions.test.ts`                                                                                                                                                                 | Pass    | 25 tests passed for time totals, billable invoice conversion, project/time use cases, protected routes, and sync invalidation contracts.                                                               |
| 2026-06-15 slice 17           | `bun run check-types`                                                                                                                                                                                                                                                                                                        | Pass    | Full workspace typecheck/build passed; Vite reported the existing large chunk warning.                                                                                                                 |
| 2026-06-15 slice 17           | `bun run check`                                                                                                                                                                                                                                                                                                              | Pass    | `oxlint` passed and `oxfmt --write` formatted 240 files.                                                                                                                                               |
| 2026-06-15 slice 17           | `curl -i http://localhost:3001/` and `/dashboard`                                                                                                                                                                                                                                                                            | Partial | Vite served both routes with 200 responses; authenticated manual project/time/invoice flow remains blocked.                                                                                            |
| 2026-06-15 slice 18           | `bun run db:generate`                                                                                                                                                                                                                                                                                                        | Pass    | Generated `packages/db/src/migrations/0013_far_stick.sql` for persisted business insights.                                                                                                             |
| 2026-06-15 slice 18           | `bun test packages/ai/src/insights.test.ts packages/app/src/reporting.test.ts packages/jobs/src/index.test.ts packages/api/src/router.test.ts`                                                                                                                                                                               | Pass    | 26 tests passed for source-cited reports, mocked insight generation, weekly insight jobs, and protected report routes.                                                                                 |
| 2026-06-15 slice 18           | `bun run check-types`                                                                                                                                                                                                                                                                                                        | Pass    | Full workspace typecheck/build passed; Vite reported the existing large chunk warning.                                                                                                                 |
| 2026-06-15 slice 18           | `bun run check`                                                                                                                                                                                                                                                                                                              | Pass    | `oxlint` passed and `oxfmt --write` formatted 246 files.                                                                                                                                               |
| 2026-06-15 slice 18           | `curl -I http://localhost:3001/` and `/dashboard`; Browser reload with local API server                                                                                                                                                                                                                                      | Partial | Vite served both routes with 200 responses; Browser reached `/login` after auth check, so authenticated dashboard review remains blocked.                                                              |
| 2026-06-15 slice 19           | `bun run db:generate`                                                                                                                                                                                                                                                                                                        | Pass    | Generated `packages/db/src/migrations/0014_damp_clea.sql` for assistant threads, messages, and tool calls.                                                                                             |
| 2026-06-15 slice 19           | `bun test packages/ai/src/insights.test.ts packages/app/src/assistant.test.ts packages/app/src/reporting.test.ts packages/api/src/router.test.ts`                                                                                                                                                                            | Pass    | 27 tests passed for assistant tool schemas, grounded answers, permission denial, non-mutating suggestions, reports, and protected routes.                                                              |
| 2026-06-15 slice 19           | `bun run check && bun run check-types`                                                                                                                                                                                                                                                                                       | Pass    | `oxlint`/`oxfmt` passed on 248 files; full workspace typecheck/build passed with the existing large chunk warning.                                                                                     |
| 2026-06-15 slice 19           | `curl -I http://localhost:3001/` and `/dashboard`; Browser reload with local API server                                                                                                                                                                                                                                      | Partial | Vite served both routes with 200 responses; Browser redirected `/dashboard` to `/login` with no new warnings/errors.                                                                                   |
| 2026-06-15 slice 20           | `bun run db:generate`                                                                                                                                                                                                                                                                                                        | Pass    | Generated `packages/db/src/migrations/0015_dear_tarantula.sql` for assistant action approvals.                                                                                                         |
| 2026-06-15 slice 20           | `bun test packages/ai/src/insights.test.ts packages/app/src/assistant.test.ts packages/api/src/router.test.ts`                                                                                                                                                                                                               | Pass    | 30 tests passed for action tool metadata, approval-gated draft/mutate/send flows, protected approval routes, and rejection behavior.                                                                   |
| 2026-06-15 slice 20           | `bun run check-types`                                                                                                                                                                                                                                                                                                        | Pass    | Full workspace typecheck/build passed with the existing Vite large chunk warning.                                                                                                                      |
| 2026-06-15 slice 20           | `bun run check`                                                                                                                                                                                                                                                                                                              | Pass    | `oxlint` passed and `oxfmt --write` formatted 249 files.                                                                                                                                               |
| 2026-06-15 slice 20           | `curl -I http://localhost:3001/` and `/dashboard`; Browser navigation to `/dashboard` with local API server                                                                                                                                                                                                                  | Partial | Vite served both routes with 200 responses; Browser redirected `/dashboard` to `/login` with no warnings/errors, so authenticated approval flow remains blocked.                                       |
| 2026-06-15 slice 21           | `bun test packages/ai/src/insights.test.ts packages/ai/src/evals.test.ts`                                                                                                                                                                                                                                                    | Pass    | 8 tests passed for deterministic eval fixtures, release-gate metrics, actionable failures, and tool/insight contracts.                                                                                 |
| 2026-06-15 slice 21           | `bun run eval:ai`                                                                                                                                                                                                                                                                                                            | Pass    | Deterministic eval gate passed: 8/8 cases, 100% accuracy, zero false mutations, hallucinated sources, permission failures, and refusal failures.                                                       |
| 2026-06-15 slice 21           | `bun run check-types`                                                                                                                                                                                                                                                                                                        | Pass    | Full workspace typecheck/build passed with the existing Vite large chunk warning.                                                                                                                      |
| 2026-06-15 slice 21           | `bun run check`                                                                                                                                                                                                                                                                                                              | Pass    | `oxlint` passed and `oxfmt --write` formatted 253 files.                                                                                                                                               |
| 2026-06-15 slice 22           | `bun run db:generate`                                                                                                                                                                                                                                                                                                        | Pass    | Generated `packages/db/src/migrations/0016_previous_killmonger.sql` for automation rules and run logs.                                                                                                 |
| 2026-06-15 slice 22           | `bun test packages/jobs/src/index.test.ts packages/app/src/outbox-dispatch.test.ts packages/app/src/automations.test.ts packages/api/src/router.test.ts`                                                                                                                                                                     | Pass    | 33 tests passed for automation job contracts, outbox dispatch queueing, app use cases, protected API routes, approval-required actions, and run logs.                                                  |
| 2026-06-15 slice 22           | `bun run check-types`                                                                                                                                                                                                                                                                                                        | Pass    | Full workspace typecheck/build passed with the existing Vite large chunk warning.                                                                                                                      |
| 2026-06-15 slice 22           | `bun run check`                                                                                                                                                                                                                                                                                                              | Pass    | `oxlint` passed and `oxfmt --write` formatted 255 files.                                                                                                                                               |
| 2026-06-15 slice 23           | `bun run db:generate`                                                                                                                                                                                                                                                                                                        | Pass    | Generated `packages/db/src/migrations/0017_demonic_fenris.sql` for API keys, OAuth apps/grants, webhook subscriptions, and webhook delivery logs.                                                      |
| 2026-06-15 slice 23           | `bun test packages/jobs/src/index.test.ts packages/app/src/outbox-dispatch.test.ts packages/app/src/developers.test.ts packages/api/src/router.test.ts apps/server/src/public-api.test.ts`                                                                                                                                   | Pass    | 35 tests passed for public API job contracts, developer use cases, protected developer routes, OpenAPI paths, one-time secret replay, and webhook failures.                                            |
| 2026-06-15 slice 23           | `bun run check-types`                                                                                                                                                                                                                                                                                                        | Pass    | Full workspace typecheck/build passed with the existing Vite large chunk warning.                                                                                                                      |
| 2026-06-15 slice 23           | `bun run check`                                                                                                                                                                                                                                                                                                              | Pass    | `oxlint` passed and `oxfmt --write` formatted 258 files.                                                                                                                                               |
| 2026-06-15 slice 24           | `bun run db:generate`                                                                                                                                                                                                                                                                                                        | Pass    | Generated `packages/db/src/migrations/0018_worried_ink.sql` for generic integration connections and sync runs.                                                                                         |
| 2026-06-15 slice 24           | `bun test packages/integrations/src/providers.test.ts packages/integrations/src/banking.test.ts packages/integrations/src/invoice-delivery.test.ts packages/app/src/integrations.test.ts packages/api/src/router.test.ts`                                                                                                    | Pass    | 29 tests passed for adapter capabilities, token metadata, integration connect/sync/failure/disable use cases, and protected routes.                                                                    |
| 2026-06-15 slice 24           | `bun run check-types`                                                                                                                                                                                                                                                                                                        | Pass    | Full workspace typecheck/build passed with the existing Vite large chunk warning.                                                                                                                      |
| 2026-06-15 slice 24           | `bun run check`                                                                                                                                                                                                                                                                                                              | Pass    | `oxlint` passed and `oxfmt --write` formatted 261 files.                                                                                                                                               |
| 2026-06-15 slice 24           | `bun test packages/integrations/src/providers.test.ts packages/integrations/src/banking.test.ts packages/integrations/src/invoice-delivery.test.ts packages/app/src/integrations.test.ts packages/api/src/router.test.ts`                                                                                                    | Pass    | Final focused rerun after formatting: 29 tests passed.                                                                                                                                                 |
| 2026-06-15 slice 25           | `bun test apps/desktop/src/bun/shell.test.ts`                                                                                                                                                                                                                                                                                | Pass    | 4 tests passed for deep-link parsing, dashboard URL construction, capture payload encoding, unsupported file rejection, and notification copy.                                                         |
| 2026-06-15 slice 25           | `bun run --filter desktop check-types`                                                                                                                                                                                                                                                                                       | Pass    | Desktop package typecheck passed after matching Electrobun tray menu item types.                                                                                                                       |
| 2026-06-15 slice 25           | `bun run --filter desktop build`                                                                                                                                                                                                                                                                                             | Pass    | Desktop bundle/build passed; Vite reported the existing large chunk warning and Electrobun skipped codesign/notarization.                                                                              |
| 2026-06-15 slice 25           | `bun test packages/app/src/documents.test.ts packages/api/src/router.test.ts apps/desktop/src/bun/shell.test.ts`                                                                                                                                                                                                             | Pass    | 28 tests passed for document upload/download use cases, protected routes, and desktop shell helpers.                                                                                                   |
| 2026-06-15 slice 25           | `bun run check-types`                                                                                                                                                                                                                                                                                                        | Pass    | Full workspace typecheck/build passed with the existing Vite large chunk warning.                                                                                                                      |
| 2026-06-15 slice 25           | `bun run check`                                                                                                                                                                                                                                                                                                              | Pass    | `oxlint` passed and `oxfmt --write` formatted 263 files.                                                                                                                                               |
| 2026-06-15 slice 25           | Browser smoke: local server on `3000`, existing web server on `3001`, open `/dashboard?desktopFocusType=document&desktopFocusId=doc_1#documents`                                                                                                                                                                             | Partial | Protected dashboard deep link redirected to `/login` with auth-session checks returning 200; authenticated desktop upload/manual review remains blocked.                                               |
| 2026-06-15 slice 26           | `bun test packages/domain/src/permissions.test.ts packages/app/src/operations.test.ts apps/server/src/observability.test.ts packages/api/src/router.test.ts`                                                                                                                                                                 | Pass    | 31 tests passed for operations permissioning, controlled failure visibility, dead-letter counts, audit search, redaction, request IDs, and protected routes.                                           |
| 2026-06-15 slice 26           | `bun run check-types`                                                                                                                                                                                                                                                                                                        | Pass    | Full workspace typecheck/build passed with the existing Vite large chunk warning.                                                                                                                      |
| 2026-06-15 slice 26           | `bun run check`                                                                                                                                                                                                                                                                                                              | Pass    | `oxlint` passed and `oxfmt --write` formatted 266 files.                                                                                                                                               |
| 2026-06-15 slice 26           | Browser smoke: local server on `3000`, existing web server on `3001`, open `/dashboard#operations`                                                                                                                                                                                                                           | Partial | Protected dashboard route redirected to `/login`; server auth-session logs returned 200 and included generated request IDs. Authenticated operations UI remains blocked.                               |
| 2026-06-15 slice 27           | `bun test packages/app/src/rate-limit.test.ts packages/app/src/webhook-signature.test.ts packages/api/src/document-url.test.ts packages/api/src/rate-limit.test.ts apps/server/src/rate-limit.test.ts packages/api/src/router.test.ts`                                                                                       | Pass    | 33 tests passed for fixed-window rate limits, webhook HMAC verification, signed document URL policy, assistant/public throttles, and cross-team resource denials.                                      |
| 2026-06-15 slice 27           | `bun run release:gate`                                                                                                                                                                                                                                                                                                       | Pass    | Ignored-TypeScript scan, committed-secret scan, migration journal validation, full workspace typecheck/build, 181 Dawn tests, deterministic AI eval, lint/format, and server worker bundle all passed. |
| 2026-06-15 slice 26 follow-up | `bun run release:gate`                                                                                                                                                                                                                                                                                                       | Pass    | Data export/deletion request workflows, queue contracts, protected routes, dev CORS fallback, and operations UI controls passed the full release gate with 188 tests.                                  |
| 2026-06-15 slice 11           | `bun test packages/integrations/src/banking.test.ts packages/app/src/banking.test.ts packages/jobs/src/index.test.ts packages/api/src/router.test.ts`                                                                                                                                                                        | Pass    | 45 focused tests passed for sandbox bank sessions, encrypted token metadata, webhook-queued sync, provider failure state, disconnect preservation, queue mapping, and protected routes.                |
| 2026-06-15 slice 11           | `bun run check-types`                                                                                                                                                                                                                                                                                                        | Pass    | Full workspace typecheck/build passed with the existing Vite large chunk warning.                                                                                                                      |
| 2026-06-15 slice 11           | Browser smoke: local server on `3000`, local web on `3002`, open `/dashboard#banking`                                                                                                                                                                                                                                        | Partial | Protected dashboard route redirected to `/login`; console showed React DevTools info and the existing login autocomplete warning. Authenticated sandbox flow remains blocked.                          |
| 2026-06-15 slice 11           | `bun run release:gate`                                                                                                                                                                                                                                                                                                       | Pass    | Ignored-TypeScript scan, committed-secret scan, 20-migration journal validation, full workspace typecheck/build, 195 Dawn tests, deterministic AI eval, lint/format, and server worker bundle passed.  |
| 2026-06-15 slice 4 follow-up  | `bun test packages/app/src/ledger.test.ts packages/api/src/router.test.ts packages/jobs/src/index.test.ts`                                                                                                                                                                                                                   | Pass    | 47 focused tests passed for metadata creation, reference validation, transfer pairs, protected routes, and transfer invalidation jobs.                                                                 |
| 2026-06-15 slice 4 follow-up  | `bun run db:generate`                                                                                                                                                                                                                                                                                                        | Pass    | Generated `packages/db/src/migrations/0020_orange_the_fallen.sql` for `transaction.transfer_group_id` and its team index.                                                                              |
| 2026-06-15 slice 4 follow-up  | Browser smoke: local server on `3000`, local web on `3002`, open `/dashboard` at desktop and mobile widths                                                                                                                                                                                                                   | Partial | Protected dashboard route redirected to `/login`; auth-session checks returned 200. Console entries were React DevTools info and the existing login autocomplete warning.                              |
| 2026-06-15 slice 4 follow-up  | `bun run release:gate`                                                                                                                                                                                                                                                                                                       | Pass    | Ignored-TypeScript scan, committed-secret scan, 21-migration journal validation, full workspace typecheck/build, 200 Dawn tests, deterministic AI eval, lint/format, and server worker bundle passed.  |
| 2026-06-15 DB harness         | `bun run test:db`                                                                                                                                                                                                                                                                                                            | Skipped | Added opt-in Postgres integration test harness; current environment has no `DAWN_DATABASE_TEST_URL`, so the migrated Drizzle repository test is skipped by default.                                    |
| 2026-06-15 DB harness         | `bun run release:gate`                                                                                                                                                                                                                                                                                                       | Pass    | Default gate remains deterministic: 200 tests passed, 1 DB integration test skipped, deterministic AI eval passed, lint/format and server bundle passed.                                               |
| 2026-06-15 slice 5 follow-up  | `bun test packages/domain/src/csv-import.test.ts packages/app/src/ledger.test.ts packages/api/src/router.test.ts`                                                                                                                                                                                                            | Pass    | 45 focused tests passed for semicolon CSV parsing, decimal comma money, debit/credit mapping, app import preview/commit, and protected API routes.                                                     |
| 2026-06-15 slice 5 follow-up  | Browser smoke: local server on `3000`, local web on `3002`, open `/dashboard` at desktop and mobile widths                                                                                                                                                                                                                   | Partial | Protected dashboard route redirected to `/login`; auth-session checks returned 200. Console entries were React DevTools info and the existing login autocomplete warning.                              |
| 2026-06-15 slice 5 follow-up  | `bun run release:gate`                                                                                                                                                                                                                                                                                                       | Pass    | Ignored-TypeScript scan, committed-secret scan, 21-migration journal validation, full workspace typecheck/build, 204 tests passed, 1 DB integration test skipped, AI eval and server bundle passed.    |

## Commit Log

| Commit    | Slice or task                        | Notes                                                                                                                            |
| --------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `89c76a3` | Goal contract and package path       | Switched Dawn goal from orchestration to implementor mode.                                                                       |
| `5f81d86` | Transaction review tracer foundation | Hardened exact money formatting, domain review transition, tenant-scoped repository access, and command-aware idempotency.       |
| `71bee81` | Team permission foundation           | Added PRD-shaped role permissions, team access resolution, persisted invites, invite API/UI, and invite verification.            |
| `152fa2d` | Team membership lifecycle            | Added invite acceptance, membership creation, managed role updates, lifecycle guards, API routes, and persistence methods.       |
| `b89a73f` | Team directory management            | Added team member/pending-invite directory query, manager-only access checks, API route, and dashboard role controls.            |
| `5587580` | Team API contract verification       | Added injectable API router factory and oRPC tests for auth, forbidden, directory data, and not-found error mapping.             |
| `350c577` | Money and ledger core foundation     | Added exact money arithmetic, ledger drafts, duplicate keys, report totals, app/API use cases, DB schema, and migration.         |
| `dc2b2d5` | CSV transaction import foundation    | Added CSV parsing, preview/commit use cases, import sessions, API routes, dashboard upload UI, and verification.                 |
| `6d7d4f3` | Transaction sync collection          | Added the sync package, cursor-scoped transaction endpoint, TanStack DB collection hook, and optimistic dashboard review.        |
| `55adf24` | Cloudflare runtime baseline          | Added stage-aware Alchemy resources, Worker bindings, typed runtime helpers, infra contract tests, and environment docs.         |
| `f926ce5` | Outbox dispatcher queue bridge       | Added job contracts, app dispatcher, outbox retry metadata, persisted job runs, Cloudflare queue publisher, and trigger.         |
| `0a83b5c` | Tenant realtime fanout               | Added transaction realtime protocol, TenantCoordinator fanout, queue invalidation bridge, and web subscription refetch.          |
| `28d9e47` | Mock banking provider sync           | Added provider adapter package, mock bank sync use cases, persistence, API routes, dashboard status, and migration.              |
| `c2ef645` | Documents and R2 storage             | Added document metadata/versioning, signed R2 upload/download flow, protected API routes, dashboard panel, and migration.        |
| `26ea3b7` | Inbox document extraction            | Added inbox sources/items, extraction jobs, deterministic worker processing, correction UI/API, and migration.                   |
| `7171264` | Inbox transaction matching           | Added deterministic match scoring, suggestion persistence, accept/reject flows, hard-negative memory, and dashboard controls.    |
| `abdb187` | Billing draft foundation             | Added customers, contacts, products/services, exact invoice totals, draft invoice API/UI, and migration.                         |
| `8499997` | Invoice delivery foundation          | Added invoice PDF preview, confirmed send, payment recording, recurrence jobs, mock email delivery, and dashboard controls.      |
| `a639988` | Project time foundation              | Added customer-linked projects, time entries, billable reports, invoice conversion, sync contracts, and dashboard controls.      |
| `d9ecab3` | Reporting and insight foundation     | Added source-cited report queries, weekly insight jobs, persisted insights, protected API route, and dashboard overview.         |
| `4a9aaf3` | Assistant read and suggest tools     | Added permissioned assistant tool schemas, persisted conversations/tool calls, protected routes, and dashboard assistant UI.     |
| `1299415` | Assistant approval gates             | Added approval-gated assistant draft, mutation, and invoice-send actions backed by app use cases, API routes, UI, and migration. |
| `2e1e371` | AI evaluation harness                | Added deterministic AI eval fixtures, runner, CLI release gate, tests, and short release-gate guidance.                          |
| `04811d5` | Automation rules foundation          | Added event-triggered automation rules, run logs, queue job contracts, protected routes, dashboard panel, tests, and migration.  |
| `18f24d7` | Public developer platform            | Added scoped API keys, OAuth app/grant records, public REST routes, webhook subscriptions/delivery logs, tests, and migration.   |
| `b08cfdd` | Integration adapter foundation       | Added generic provider contracts, integration connection/sync persistence, protected routes, dashboard status UI, and migration. |
| `c8e1d92` | Desktop quick capture shell          | Added Dawn deep links, tray quick capture, file association metadata, dashboard capture handoff, and shell helper tests.         |
| `3a040c7` | Observability workspace              | Added operations permission, request tracing, redacted logs, operations read model/API/UI, and controlled failure tests.         |
| `9f1f29c` | Security release gates               | Added release gate scripts/CI, rate limits, signed file URL policy, webhook signature verification, and tenant isolation tests.  |
| `b5ab62e` | Data workflow queueing               | Adds audited/idempotent export and deletion requests, queue contracts, protected routes, dashboard controls, and CORS fallback.  |
| `d76a917` | Sandbox banking provider             | Adds sandbox connection sessions, encrypted token metadata, verified webhook sync requests, queued sync, and disconnect.         |
| `597adc8` | Ledger metadata and transfers        | Adds counterparty/tag use cases, transfer-pair semantics, transfer group persistence, API routes, dashboard controls, and tests. |
| `ecde4c9` | DB ledger integration harness        | Adds opt-in migrated Postgres coverage for ledger reports, metadata, transfer groups, tenant predicates, replay, and rollback.   |
| `29e61a5` | CSV bank export mappings             | Adds semicolon/tab parsing, decimal-comma money, debit/credit mappings, API support, dashboard controls, and tests.              |

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

Slice 4 follow-up added app-layer counterparty and transaction-tag management,
reference validation for manually created ledger transactions, and two-leg
transfer pair creation with a durable `transferGroupId`. Transfer pairs write
opposite signed transfer transactions, emit a grouped outbox event that
invalidates both transaction IDs, persist `transaction.transfer_group_id` through
migration `0020_orange_the_fallen`, and are exposed through protected oRPC
routes plus dashboard ledger controls.

Slice 4 DB harness follow-up added `bun run test:db` and
`packages/db/src/transaction-review.integration.test.ts`. When
`DAWN_DATABASE_TEST_URL` is provided, the test creates an isolated temporary
schema, runs all SQL migrations, wires `DrizzleTransactionReviewRepository`
against that schema, and verifies ledger metadata, report totals, tenant
predicates, idempotent replay, transfer-group persistence, and transaction
rollback. The default release gate keeps this test skipped until a test Postgres
URL is available.

Slice 5 foundation added exact CSV parsing and decimal amount conversion in the
domain layer, app-layer import preview/commit use cases, duplicate detection
against existing ledger transactions and within the file, persisted CSV import
sessions, protected oRPC preview/commit routes, route tests, and a dashboard CSV
upload panel with column mapping, row status preview, and commit controls.

Slice 5 follow-up added common bank-export variants to the canonical CSV import
path. The domain parser now detects comma, semicolon, and tab delimiters,
supports decimal-comma and European grouped money formats, and normalizes either
a signed amount column or separate debit/credit columns into exact signed minor
units. The protected API accepts the richer mapping contract and the dashboard
exposes optional debit and credit column controls.

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

Slice 11 foundation adds a non-production sandbox banking provider path behind
the existing adapter boundary. The provider catalog now exposes mock and sandbox
banking providers; sandbox connection sessions complete through a callback-style
exchange that persists encrypted token metadata separately from raw payloads.
Verified sandbox webhooks enqueue `bank_connection.sync_requested` outbox events
instead of mutating financial state directly, and the jobs package maps those
events to `bank.sync` queue messages handled by the server through
`syncBankConnection` with a system actor. Banking sync failures now persist
failed provider sync runs and mark the connection `error`, while disconnecting a
connection leaves historical accounts and transactions intact. Migration
`0019_yielding_talon` adds nullable bank token metadata columns.

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

Slice 13 foundation added `inbox_source`, `inbox_item`, and
`document_extraction` tables with versioned extraction results. Completing a
document upload now creates a document-upload inbox item and emits a
`document.uploaded` payload that the jobs package maps to a `document.extract`
queue message. The server queue handler reads the R2 object, runs a deterministic
local extractor through the app use case, and persists extraction fields plus
confidence. The API exposes inbox list and extraction correction routes, and the
dashboard has an inbox review panel that displays extracted fields, confidence,
and saves user corrections as new extraction versions with audit/outbox events.

Slice 14 foundation added deterministic inbox-to-transaction matching in the
domain layer plus app use cases for suggestion generation, acceptance, and
rejection. Postgres now stores `inbox_match_suggestion`,
`transaction_attachment`, `team_alias`, and `hard_negative_match` records.
Accepted matches attach documents to transactions, resolve the inbox item, learn
team aliases, and emit audit/outbox events; rejected matches persist hard
negatives so they are not suggested again. The dashboard inbox panel can find,
accept, and reject matches, but low-confidence suggestions are never
auto-applied.

Slice 15 foundation added the first billing records and draft workflow. The
domain layer owns exact invoice totals with milli-quantities, basis-point
discounts, tax calculation, and draft-only edit rules. Postgres now stores
`customer`, `customer_contact`, `product`, `invoice`, and `invoice_line`
records. The app exposes idempotent customer, product/service, draft invoice
create, and draft invoice update use cases behind invoice permissions with
audit/outbox events. The API exposes a protected billing router, and the
dashboard has a compact billing panel for creating customers, products/services,
and creating or updating one-line draft invoices.

Slice 16 foundation added invoice preview and delivery lifecycle behavior. The
domain layer owns send, payment, and recurrence state transitions; the app layer
adds confirmed email delivery, payment recording, and recurring invoice
generation behind idempotency, audit, and outbox writes. Postgres stores invoice
events, payments, recurring schedules, and lifecycle fields, while the jobs
package maps recurring due events into generation jobs. The dashboard can
preview PDFs, send invoices through the mock provider, record payments, and set
up recurring schedules.

Slice 17 foundation added customer-linked projects, project members, and time
entries. The domain layer totals billable and non-billable time with exact money
values; the app layer creates projects, records time, reports utilization, and
converts billable entries into invoice lines with audit/outbox writes. Postgres
stores `project`, `project_member`, and `time_entry`, and the dashboard includes
a projects/time panel for creating projects, tracking time, and invoicing
selected billable entries.

Slice 18 foundation added source-cited business reporting and weekly insight
generation. The app layer now builds team-scoped overview reports for
profit/loss, cashflow, revenue by customer, expenses by category, unpaid
invoices, tax summary, time utilization, and inbox backlog. `packages/ai`
defines the insight provider port with a deterministic mock provider, Postgres
stores generated `business_insight` records with source refs, the jobs package
maps weekly insight due events into generation jobs, and the API exposes a
protected `reports.overview` route. The dashboard Overview card reads the route
and links insight sources back to the relevant workflow sections.

Slice 19 foundation added a permissioned assistant read/suggest runtime.
`packages/ai` now defines tool metadata, zod input schemas, risk levels,
permission requirements, and deterministic planning/response providers for read
and suggest tools. The app layer creates or loads assistant threads, persists
user and assistant messages, executes only permission-allowed read/suggest tools,
records refused tool calls when required permissions are missing, audits
assistant messages, and never mutates authoritative business state from suggest
tools. Postgres stores `assistant_thread`, `assistant_message`, and
`assistant_tool_call`, the API exposes protected assistant list/thread/ask
routes, and the dashboard includes a compact assistant panel with cited sources
and tool-call visibility.

Slice 20 foundation added approval-gated assistant actions for invoice draft
creation, transaction categorization, and invoice sending. Action tools now
carry output schema, audit event, rate-limit policy, mutation risk, and required
permission metadata. The app layer turns proposed actions into persisted pending
approvals, executes approved actions through the existing invoice and
transaction-review use cases with idempotency, records rejection/execution audit
events, and keeps external side effects behind explicit approval. Postgres now
stores `assistant_action_approval`, the API exposes approve/reject routes, and
the dashboard shows pending action previews with approve/reject controls.

Slice 21 foundation added `packages/ai/src/evals.ts` with deterministic fixtures
and a runner for transaction categorization, inbox matching, receipt extraction,
invoice drafting, cashflow explanation, tool selection, refusal behavior, and
permission enforcement. The runner records per-category accuracy, cost, latency,
false positives, false mutations, hallucinated sources, permission/refusal
failures, and correction acceptance, then applies a strict release gate through
`bun run eval:ai`. `docs/ai/EVALUATIONS.md` documents the verification path for
AI tool, prompt, provider, retrieval, and approval-policy changes.

Slice 22 foundation added team-scoped automation permissions, rule contracts,
and run logs. Automations are triggered from outbox events through a new
`automation.run` queue job and execute through application use cases as the rule
creator, checking `automations.run` plus the target action permission. Supported
actions cover transaction categorization, notification requests, draft invoice
creation, and accounting export requests; external-side-effect export actions
log `approval_required` unless the rule explicitly uses `auto_approve`.
Postgres stores `automation_rule` and `automation_run`, the API exposes
protected list/create/run routes, and the dashboard has a compact rule/run panel.

Slice 23 foundation added scoped public API actors, hashed API keys with
one-time returned tokens, OAuth app/grant records, webhook subscriptions, and
auditable webhook delivery attempts. The app layer resolves API keys into
team-scoped actors with permissions derived from public scopes, developer
settings are managed through protected API routes, and public REST endpoints now
cover transactions, invoices, webhook subscription creation, and OpenAPI
discovery. Outbox dispatch now emits `webhook.deliver` jobs, the server queue
handler records delivery success/failure and retries failed webhook jobs through
the queue, and Postgres stores API key/OAuth/webhook state via migration
`0017_demonic_fenris`.

Slice 23 follow-up added protected OAuth app creation and consent grant
contracts. The app layer validates registered HTTPS redirect URIs, enforces
requested scopes as a subset of the app registration, persists grants
idempotently, and audits/emits `oauth_consent.granted`; the protected router
exposes create, preview, and grant procedures for a future browser authorization
screen.

Slice 23 browser follow-up added a protected `/oauth/authorize` route. The page
parses OAuth app, redirect URI, scope, team, and state parameters, previews the
registered consent request through the protected developer API, grants consent
with a stable idempotency key, and redirects only to the validated registered
redirect URI with grant metadata or `access_denied`.

Slice 24 foundation added a generic integration provider boundary for
accounting, payments, messaging, and email. `packages/integrations` now exposes
mock adapters with declared capabilities, encrypted-token metadata, deterministic
connection IDs, and sync payloads. The app layer lists provider catalogs,
connects integrations idempotently, logs sync runs with raw provider payloads,
surfaces provider failures on the connection, and disables integrations without
deleting historical records. Postgres stores `integration_connection` and
`integration_sync_run` via migration `0018_worried_ink`, the protected API
exposes list/connect/sync/disable routes, and the dashboard shows provider
capabilities, token metadata, latest sync status, failure messages, and disable
controls.

Slice 25 foundation deepened the existing Electrobun shell without adding
desktop-only business rules. The desktop app now registers the `dawn` URL scheme
and capture-friendly file associations, parses `dawn://open/...`,
`dawn://capture?...`, dashboard, and `file://` entry points through tested helper
functions, exposes tray actions for opening Dawn and quick file capture, and
turns supported local files into base64 payloads for the web dashboard. The
dashboard reuses the existing document upload mutation to receive
`dawn:desktop-capture` events, applies `teamId` from desktop deep links when
present, and scrolls to addressable transaction, invoice, document, and inbox
records by desktop focus parameters.

Slice 26 foundation added an owner/admin `operations.read` permission plus a
team-scoped operations workspace in the app layer. The repository now exposes
read-only audit, outbox, job run, provider sync, integration sync, automation
run, and webhook delivery queries; the app layer redacts secret/PII-shaped
fields before returning operational records and computes queue depth, failed
job, dead-letter, provider failure, integration failure, webhook failure,
automation failure, and sync-lag metrics. The protected API exposes
`operations.list`, and the dashboard shows a compact operations panel for
metrics, outbox/job failures, provider/webhook activity, audit records, and
explicitly staged team export/deletion workflows. The server now returns
`x-request-id`, reuses generated request IDs in API context, allows the header
through CORS, and logs oRPC/OpenAPI/queue errors through structured redacted
server logging.

Slice 26 follow-up closed the static data-workflow gap by adding audited and
idempotent export/deletion request commands, outbox events, queue job contracts,
protected operations routes, dashboard queue controls, and a localhost CORS
fallback for Vite alternate ports.

Slice 26 export delivery now writes an audited JSON archive artifact through the
Worker queue path. The app layer builds a redacted team export snapshot with
ledger, banking, documents, inbox, billing, projects, reporting, assistant,
automation, integration, developer, and operational evidence, and the server
persists it to the R2-compatible `DAWN_DOCUMENTS` binding with artifact
metadata in audit logs. Tenant deletion execution remains gated by retention,
provider cleanup, and compliance rules.

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
- Slice 4 still needs authenticated manual ledger review against a migrated
  local or preview database, plus an executed DB-backed report integration test
  run with `DAWN_DATABASE_TEST_URL`. Current verification covers metadata use
  cases, transfer-pair semantics, dashboard controls, route contracts, migration
  generation, release gate, an opt-in Drizzle/Postgres integration harness, and
  unauthenticated browser redirect smoke.
- Slice 5 still needs authenticated browser/manual import verification against a
  migrated local database before it should be marked complete. Current
  verification covers parser variants, signed amount and debit/credit mapping,
  preview/commit use cases, protected routes, dashboard build, release gate, and
  unauthenticated browser redirect smoke.
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
- Slice 11 still needs real provider selection and credentials for a live
  sandbox such as Plaid/Teller/GoCardless/EnableBanking. Current verification
  covers a production-shaped local sandbox provider, encrypted token metadata,
  callback completion, verified webhook-to-queue handling, queued sync,
  actionable provider failure state, migration generation, typecheck, and
  unauthenticated browser redirect.
- Slice 12 still needs authenticated manual upload/download against a migrated
  local or preview database with an R2-compatible `DAWN_DOCUMENTS` binding.
  Current verification covers app/API/server contracts, signer behavior, memory
  object storage, server bundle, and unauthenticated web-shell smoke.
- Slice 13 still needs authenticated manual review against a migrated local or
  preview runtime with Queue and R2 bindings. Current verification covers
  deterministic extraction contracts, worker success/failure paths, correction
  persistence, API routes, server bundle, and unauthenticated web-shell smoke.
- Slice 14 still needs authenticated manual matching review against a migrated
  local or preview database with sample receipts and transactions. Current
  verification covers deterministic scoring, app use cases, API routes,
  migration generation, and dashboard build/type contracts.
- Slice 15 still needs authenticated manual draft-invoice review against a
  migrated local or preview database. Current verification covers invoice domain
  math/state rules, app use cases, API routes, migration generation, and
  dashboard build/type contracts plus unauthenticated web-shell smoke.
- Slice 18 still needs authenticated dashboard review with seeded source records
  and generated insight rows against a migrated local or preview database.
  Current verification covers report/insight/app/API/job contracts, migration
  generation, typecheck/check, HTTP smoke, and Browser unauthenticated redirect.
- Slice 19 still needs authenticated assistant questions against known seeded
  data in a migrated local or preview database. Current verification covers tool
  schemas, permission denial, grounded citations, persistence, non-mutating
  suggestions, protected routes, migration generation, typecheck/check, HTTP
  smoke, and Browser unauthenticated redirect.
- Slice 20 still needs authenticated assistant approval review against seeded
  customers, products, transactions, categories, and draft invoices in a
  migrated local or preview database. Current verification covers approval
  persistence, permission-gated execution, app/API contracts, migration
  generation, typecheck/check, HTTP smoke, and Browser unauthenticated redirect.
- Slice 21 still needs eval runs against a configured AI provider and a larger
  production-like fixture corpus before it should be treated as product-quality
  AI confidence. Current verification covers deterministic fixtures, mocked
  provider metrics, release-gate behavior, typecheck/check, and failure
  actionability.
- Slice 22 still needs authenticated browser review against a migrated local or
  preview database and a live queue/worker automation run from an actual outbox
  event. Current verification covers rule creation, permissioned app execution,
  approval-required risky actions, run logging, queue job mapping, protected API
  routes, migration generation, typecheck/check, and dashboard build.
- Slice 23 still needs live public API requests against a migrated local or
  preview database, authenticated OAuth authorization browser exercise, and
  webhook delivery review against a reachable endpoint. Current verification
  covers hashed scoped API keys, one-time credential replay behavior, OAuth
  app/consent grant route contracts, protected developer routes, browser consent
  route build/helper tests, public OpenAPI shape, queue retry signaling,
  delivery audit records, migration generation, typecheck/check, and focused
  tests.
- Slice 24 still needs real provider selection/credentials, sandbox contract
  runs where provider SDKs are chosen, and authenticated dashboard review against
  a migrated local or preview database. Current verification covers adapter
  capability declarations, encrypted-token metadata shape, raw payload
  preservation, idempotent sync logging, provider failure surfacing,
  non-destructive disable behavior, protected API routes, migration generation,
  typecheck/check, and focused tests.
- Slice 25 still needs installed-app/manual review of OS file association,
  custom URL scheme launch behavior, tray capture, native notifications, and an
  authenticated desktop upload against a migrated local or preview database.
  Current verification covers shell helper behavior, desktop package typecheck,
  desktop build, protected document/API contracts, workspace checks, and
  unauthenticated browser redirect through the deep-link dashboard URL.
- Slice 26 still needs authenticated operations dashboard review against a
  migrated local or preview database, Cloudflare Analytics/DLQ inspection in a
  deployed Worker environment, and a confirmed tenant deletion workflow once
  retention/compliance rules are finalized. Current verification covers
  controlled in-memory failure visibility, redaction, request ID propagation,
  protected API output, durable R2-compatible export archive writing, dashboard
  build, workspace checks, and unauthenticated browser redirect.
- Slice 27 adds a local and CI `release:gate` that runs ignored-TypeScript
  checks, committed-secret scanning, migration journal validation, workspace
  typecheck/build, Dawn-owned tests, deterministic AI evals, lint/format, and
  the server Worker bundle build. It also adds app-layer fixed-window rate
  limit primitives, public API and assistant route throttles, scoped document
  URL TTL/object-key policy, HMAC webhook signature verification tests, and
  router tenant isolation tests for documents, billing, developer settings,
  and operations. Live CI execution remains blocked until the branch is pushed
  and GitHub Actions runs the new workflow.
