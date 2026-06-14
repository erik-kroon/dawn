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

| #   | Slice                                                        | Status                                                   | Dependencies             | Verification                                                                                |
| --- | ------------------------------------------------------------ | -------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------- |
| 1   | Architecture Decision Baseline                               | Accepted for startup                                     | None                     | Manual ADR review complete; markdown/link check if added.                                   |
| 2   | Transaction Review Tracer Slice                              | Verified foundation, authenticated manual review blocked | Slice 1                  | Focused domain/app tests, `bun run check-types`, `bun run check`, local server/web smoke.   |
| 3   | Team Context And Permission Model                            | Lifecycle foundation in progress                         | Slice 2                  | Role matrix, invite, acceptance, role update tests; `bun run check-types`; `bun run check`. |
| 4   | Money And Ledger Core                                        | Not started                                              | Slice 3                  | Money/domain tests; duplicate and split tests; report fixture tests.                        |
| 5   | CSV Transaction Import                                       | Not started                                              | Slice 4                  | Parser tests; preview/duplicate/commit tests; manual CSV import.                            |
| 6   | TanStack DB Sync Tracer                                      | Not started                                              | Slices 2, 3              | Sync contract tests; two-session UI/manual test; typecheck.                                 |
| 7   | Cloudflare Infrastructure Baseline                           | Not started                                              | Slice 1                  | Typecheck; deployment dry run/local equivalent; secret review.                              |
| 8   | Outbox Dispatcher And Queue Bridge                           | Not started                                              | Slices 2, 7              | Outbox transaction tests; worker/queue retry tests; manual dispatch.                        |
| 9   | Tenant Durable Object Realtime Fanout                        | Not started                                              | Slices 6, 8              | Multi-client invalidation test; Worker binding typecheck.                                   |
| 10  | Banking Provider Adapter Interface And Mock Provider         | Not started                                              | Slices 4, 8              | Adapter contract tests; sync idempotency tests; manual mock sync.                           |
| 11  | First Real Banking Provider                                  | Blocked on provider choice/credentials                   | Slice 10                 | Sandbox/provider tests; webhook signature tests; manual sandbox connection.                 |
| 12  | Documents And R2 Storage                                     | Not started                                              | Slices 3, 7, 8           | Metadata/permission tests; R2 mock/local test; manual upload/download.                      |
| 13  | Inbox And Document Extraction Pipeline                       | Not started                                              | Slice 12                 | Extraction schema tests; worker tests; manual inbox review.                                 |
| 14  | Inbox-To-Transaction Matching                                | Not started                                              | Slices 4, 13             | Matching domain tests; accept/reject tests; manual samples.                                 |
| 15  | Customers And Invoice Drafts                                 | Not started                                              | Slices 3, 4              | Invoice totals/state tests; customer/draft tests; manual draft.                             |
| 16  | Invoice Delivery, PDF, Payments, And Recurrence              | Not started                                              | Slices 15, 8             | Lifecycle tests; send/payment tests; sandbox/dev email manual flow.                         |
| 17  | Projects And Time Tracking                                   | Not started                                              | Slice 15                 | Time totals/conversion tests; manual project/time/invoice flow.                             |
| 18  | Reporting And Weekly Insights                                | Not started                                              | Slices 4, 14, 16, 17     | Report fixture tests; mocked insight tests; manual dashboard.                               |
| 19  | TanStack AI Assistant Read And Suggest Tools                 | Not started                                              | Slice 18                 | Tool schema tests; permission/refusal tests; manual grounded questions.                     |
| 20  | AI Draft, Mutate, And Approval Gates                         | Not started                                              | Slice 19                 | Approval tests; AI actor permission tests; manual approval flow.                            |
| 21  | AI Evaluation Harness                                        | Not started                                              | Slices 19, 20            | Eval runner with deterministic fixtures.                                                    |
| 22  | Automation Rules                                             | Not started                                              | Slices 8, 20             | Trigger/action tests; manual event-driven automation.                                       |
| 23  | Public API, OAuth Apps, API Keys, And Webhooks               | Not started                                              | Slices 3, 8              | API contract tests; scope tests; webhook retry/failure tests.                               |
| 24  | Accounting, Payments, Messaging, And Email Provider Adapters | Not started                                              | Slices 16, 23            | Adapter contract tests; sandbox tests where available; manual status review.                |
| 25  | Desktop Quick Capture And Native Shell Deepening             | Not started                                              | Slices 12, 13            | Desktop build/smoke; file capture test.                                                     |
| 26  | Observability, Admin Tools, And Operations                   | Not started                                              | Slices 8, 11, 16, 20     | Controlled failure; redaction review; data workflow tests.                                  |
| 27  | Security Hardening And Release Gates                         | Not started                                              | Broad product foundation | Full check suite; integration tests; ignored-error review.                                  |

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

| Time                    | Command or check                                                                                                                                                                                                          | Result  | Notes                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------ |
| 2026-06-14 startup      | `git status --short`                                                                                                                                                                                                      | Pass    | Clean worktree.                                                                                                          |
| 2026-06-14 startup      | `bun test packages/app/src/transaction-review.test.ts`                                                                                                                                                                    | Pass    | 5 tests passed.                                                                                                          |
| 2026-06-14 startup      | `bun run check-types`                                                                                                                                                                                                     | Pass    | Typecheck/build passed; Vite reported a large chunk warning.                                                             |
| 2026-06-14 continuation | `git status --short --branch`                                                                                                                                                                                             | Info    | Dirty continuation baseline: old goal package deleted, Dawn goal package and this log untracked.                         |
| 2026-06-14 continuation | `bun test packages/domain/src/money.test.ts packages/app/src/transaction-review.test.ts`                                                                                                                                  | Pass    | 8 tests passed after exact money display hardening.                                                                      |
| 2026-06-14 continuation | `bun run check-types`                                                                                                                                                                                                     | Pass    | Full workspace typecheck/build passed; Vite reported a large chunk warning.                                              |
| 2026-06-14 continuation | `bun run db:generate`                                                                                                                                                                                                     | Pass    | Generated `packages/db/src/migrations/0001_powerful_talos.sql` for idempotency fingerprints.                             |
| 2026-06-14 continuation | `bun test packages/domain/src/money.test.ts packages/domain/src/transaction-review.test.ts packages/app/src/transaction-review.test.ts`                                                                                   | Pass    | 11 tests passed after domain transition, command-aware idempotency, and tenant-scoped repository hardening.              |
| 2026-06-14 continuation | `bun run check-types`                                                                                                                                                                                                     | Pass    | Full workspace typecheck/build passed; Vite reported a large chunk warning.                                              |
| 2026-06-14 continuation | `bun run check`                                                                                                                                                                                                           | Pass    | `oxlint` passed and `oxfmt --write` formatted 182 files.                                                                 |
| 2026-06-14 continuation | `bun run dev:server`                                                                                                                                                                                                      | Blocked | Fails with checked-in env because `POLAR_ACCESS_TOKEN` is missing.                                                       |
| 2026-06-14 continuation | `env SKIP_ENV_VALIDATION=true POLAR_ACCESS_TOKEN=dummy bun run dev:server`                                                                                                                                                | Pass    | Smoke server started on `http://localhost:3000`; health RPC and auth session requests returned 200.                      |
| 2026-06-14 continuation | `bun run dev:web`                                                                                                                                                                                                         | Pass    | Added missing web `dev` script; documented root command starts Vite on `http://localhost:3001`.                          |
| 2026-06-14 continuation | Browser smoke at `http://localhost:3001`                                                                                                                                                                                  | Pass    | Landing page rendered, API status showed connected, `/dashboard` redirected to login when unauthenticated.               |
| 2026-06-14 continuation | `bun test packages/domain/src/money.test.ts packages/domain/src/transaction-review.test.ts packages/app/src/transaction-review.test.ts`                                                                                   | Pass    | Final focused test run: 11 tests passed.                                                                                 |
| 2026-06-14 continuation | `bun run check-types`                                                                                                                                                                                                     | Pass    | Final full workspace typecheck/build passed; Vite reported a large chunk warning.                                        |
| 2026-06-14 continuation | `bun run check`                                                                                                                                                                                                           | Pass    | Final `oxlint` and `oxfmt --write` passed on 184 files.                                                                  |
| 2026-06-15 continuation | `bun test packages/domain/src/money.test.ts packages/domain/src/transaction-review.test.ts packages/app/src/transaction-review.test.ts`                                                                                   | Pass    | 11 tests passed for money formatting, domain review transition, permissions, tenant scoping, and idempotency.            |
| 2026-06-15 continuation | `bun run check-types`                                                                                                                                                                                                     | Pass    | Full workspace typecheck/build passed; Vite reported the existing large chunk warning.                                   |
| 2026-06-15 continuation | `bun run check`                                                                                                                                                                                                           | Pass    | `oxlint` passed and `oxfmt --write` formatted 183 files.                                                                 |
| 2026-06-15 continuation | `env SKIP_ENV_VALIDATION=true POLAR_ACCESS_TOKEN=dummy bun run dev:server`                                                                                                                                                | Pass    | API server started on `http://localhost:3000`; `GET /`, `POST /rpc/healthCheck`, and auth session returned 200.          |
| 2026-06-15 continuation | `bun run dev:web`                                                                                                                                                                                                         | Pass    | Vite dev server started on `http://localhost:3001`; HTTP shell returned 200.                                             |
| 2026-06-15 continuation | Browser smoke at `http://localhost:3001`                                                                                                                                                                                  | Blocked | Shared in-app browser profile was locked; isolated Playwright was unavailable in the Node REPL. Used HTTP smoke instead. |
| 2026-06-15 slice 3      | `bun test packages/domain/src/permissions.test.ts packages/domain/src/money.test.ts packages/domain/src/transaction-review.test.ts packages/app/src/team-permissions.test.ts packages/app/src/transaction-review.test.ts` | Pass    | 20 tests passed for role permissions, team access resolution, invites, idempotency, transaction review, and money.       |
| 2026-06-15 slice 3      | `bun run db:generate`                                                                                                                                                                                                     | Pass    | Generated `packages/db/src/migrations/0002_dazzling_supreme_intelligence.sql` for `team_invite`.                         |
| 2026-06-15 slice 3      | `bun run check-types`                                                                                                                                                                                                     | Pass    | Full workspace typecheck/build passed; Vite reported the existing large chunk warning.                                   |
| 2026-06-15 slice 3      | `bun run check`                                                                                                                                                                                                           | Pass    | `oxlint` passed and `oxfmt --write` formatted 186 files.                                                                 |
| 2026-06-15 slice 3      | `bun test packages/domain/src/permissions.test.ts packages/domain/src/money.test.ts packages/domain/src/transaction-review.test.ts packages/app/src/team-permissions.test.ts packages/app/src/transaction-review.test.ts` | Pass    | 26 tests passed after adding invite acceptance, member role updates, and lifecycle guard rails.                          |
| 2026-06-15 slice 3      | `bun run check-types`                                                                                                                                                                                                     | Pass    | Full workspace typecheck/build passed; Vite reported the existing large chunk warning.                                   |
| 2026-06-15 slice 3      | `bun run check`                                                                                                                                                                                                           | Pass    | `oxlint` passed and `oxfmt --write` formatted 186 files.                                                                 |

## Commit Log

| Commit    | Slice or task                        | Notes                                                                                                                      |
| --------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `89c76a3` | Goal contract and package path       | Switched Dawn goal from orchestration to implementor mode.                                                                 |
| `5f81d86` | Transaction review tracer foundation | Hardened exact money formatting, domain review transition, tenant-scoped repository access, and command-aware idempotency. |
| `71bee81` | Team permission foundation           | Added PRD-shaped role permissions, team access resolution, persisted invites, invite API/UI, and invite verification.      |
| `152fa2d` | Team membership lifecycle            | Added invite acceptance, membership creation, managed role updates, lifecycle guards, API routes, and persistence methods. |

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

## Blockers And Watch Items

- Live banking, payment, email, AI, and Cloudflare provider work may require
  unavailable credentials. Continue with ports, fake adapters, fixtures, and
  local harnesses; mark only live wiring blocked.
- `bun run check` currently runs `oxfmt --write`; inspect formatting diffs after
  using it.
- `apps/worker`, `packages/jobs`, `packages/integrations`, `packages/sync`, and
  `packages/ai` should be introduced only when their slice owns real contracts.
- Checked-in server env lacks `POLAR_ACCESS_TOKEN`; full authenticated dashboard
  smoke needs valid local auth/payment env or a test-mode auth bypass.
- Authenticated transaction-review UI exercise remains blocked until a local
  session/test auth path is available. Current local smoke verifies server,
  RPC health, auth-session null response, and the web shell only.
- Slice 3 still needs live authenticated manual verification with at least two
  users or seeded actors before it can be marked complete. Membership accepting,
  role changes, recent-auth/MFA gates, permission overrides, API keys, and OAuth
  actors remain future work under later identity/public API slices.
- When a development database is available, apply migrations and add a
  repository-level database test for transaction rollback and tenant predicates.
