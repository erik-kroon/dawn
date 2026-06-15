# Testing Strategy

Dawn should learn from Midday's breadth without copying its exact test shape.
Midday's suite is robust because it tests product behavior at several boundaries:
pure utilities, provider transforms, API/router contracts, database queries, live
API smoke flows, snapshots, golden datasets, and AI/evaluation fixtures. Dawn's
architecture should keep those confidence layers, but route them through the
domain/app/db boundaries defined in `CONTEXT.md` and `docs/adr/`.

## Midday Reference Map

Observed in `ref/midday`:

- Root orchestration: `ref/midday/package.json` runs `turbo test --parallel`.
  The Turbo `test` task disables cache and forwards `TEST_DATABASE_URL`.
- Package unit tests: most packages use `bun test`, usually scoped to `src`.
  Examples include banking provider transforms, import utilities, invoice
  calculations, documents utilities, jobs helpers, encryption, and inbox logic.
- API contract tests: `ref/midday/apps/api` runs `bun test` with a preload file
  at `src/__tests__/setup.ts`. That preload seeds env vars and installs a large
  central `mock.module` surface for database, provider, billing, notification,
  and query helpers. Tests execute real tRPC/REST routers around those mocks.
- API helpers and factories: `apps/api/src/__tests__/helpers` creates test app
  and context objects, while `src/__tests__/factories` builds realistic response
  payloads for router assertions.
- Database tests: `ref/midday/packages/db` has a Docker Postgres test service,
  `drizzle.config.test.ts`, setup SQL for production-like prerequisites, a
  singleton test database helper, explicit cleanup, seeded calculation E2E
  tests, and opt-in scripts for matching, reports, golden datasets, and full DB
  flows.
- Provider contracts: banking/accounting adapters use fixture-heavy tests and
  snapshots for Plaid, Teller, GoCardless, Enable Banking, Xero, Fortnox, and
  QuickBooks transforms.
- Live API E2E: `apps/api/src/__tests__/e2e/rest-api.e2e.test.ts` runs against
  a real API URL and API key, creates records, retries rate limits, and cleans
  up created data.

What to copy:

- Test stable product contracts, not implementation details.
- Keep provider normalization fixtures close to each adapter.
- Use factories for realistic payloads.
- Maintain golden datasets for matching, categorization, extraction, and AI
  behavior.
- Keep real database checks explicit and isolated.
- Make live E2E opt-in, credentialed, and cleanup-aware.

What not to copy:

- Do not put Dawn business assertions in route handlers or provider mocks.
- Do not let one huge API preload mock become the main behavior harness.
- Do not rely only on Docker Postgres for fast repository feedback.
- Do not preserve Midday's inconsistency where a Vitest config exists but the
  API script actually runs Bun tests.

## Dawn Test Layers

Use this runner split:

- `bun test`: default for pure TypeScript and Bun-runtime tests. Keep this for
  `packages/domain`, most `packages/app` use-case tests, provider contract
  tests, job contract tests, sync protocol tests, server helper tests, and AI
  deterministic eval tests.
- `vitest`: use where Vite's module graph, React rendering, browser-like
  environments, component testing, or coverage tooling is the point. This should
  cover `apps/web`, `packages/ui`, and any future test that needs Vite aliases,
  CSS/module transforms, `happy-dom`/`jsdom`, or Vitest project isolation.
- PGlite: default fast database integration harness for Drizzle repositories and
  migrations that need real SQL semantics but not a networked Postgres server.
- Real Postgres: opt-in Docker or hosted test database lane for pg-driver
  behavior, migration parity, extensions, roles/schemas, locks/concurrency,
  Hyperdrive-facing behavior, and release confidence.
- Live E2E: opt-in lane for full HTTP flows against a local or preview app with
  mock/sandbox credentials.

The current `bun run test` path is healthy and fast. Keep it as the default
inner-loop command, then add new lanes instead of replacing it.

## Package Ownership

`packages/domain`

- Use `bun test`.
- Test pure value objects, money, permissions, matching scores, invoice state
  transitions, CSV parsing, ledger duplicate keys, report totals, and state
  machines.
- Add golden datasets for matching and categorization once real feedback data
  exists.
- No network, database, auth provider, Worker, or UI imports.

`packages/app`

- Use `bun test`.
- This is Dawn's main behavior contract. Test use cases with shared in-memory
  repositories and provider fakes.
- Every sensitive use case should assert permissions, tenant isolation,
  idempotency replay/conflict, audit writes, outbox writes, and rollback or
  no-side-effect behavior.
- Consolidate the large inline memory repository fakes into a testkit before
  adding much more surface area.

`packages/db`

- Add PGlite tests for repository behavior, mapping, constraints, migrations,
  transaction behavior that PGlite supports, tenant predicates, and outbox/
  audit/idempotency persistence.
- Keep a separate real Postgres script for pg-driver and migration parity.
- Do not make DB query helpers decide business policy; app tests should remain
  the behavior source of truth.

`packages/api` and `apps/server`

- Use `bun test` for Hono/oRPC/server helpers that run cleanly in Bun.
- Add Vitest only when testing a Vite/browser or Vitest-specific module graph.
- Tests should prove auth/context resolution, typed error mapping, OpenAPI
  contracts, request parsing, idempotency header handling, rate limits, and
  delegation to application use cases.
- Prefer small app-owned fakes over a Midday-style global mock module list.

`apps/web` and `packages/ui`

- Use Vitest for component, route helper, hook, and browser-environment tests.
- Keep business rules out of UI tests. UI tests should assert rendering,
  interactions, optimistic states, accessibility basics, and API client wiring.

`packages/integrations`

- Use `bun test` for adapter contract tests and normalization fixtures.
- Add snapshots or golden fixtures for provider raw payload to canonical model
  transforms.
- Preserve raw payload expectations where debugging and reconciliation depend on
  them.

`packages/sync`

- Use `bun test` for protocol contracts.
- Add PGlite-backed repository projection tests only when verifying stored
  cursors, conflict records, or sync projection rebuild behavior.

`packages/ai`

- Keep deterministic `bun test` fixtures plus `bun run eval:ai`.
- Add golden eval datasets for tool selection, refusal, extraction, matching,
  categorization, and grounded answers.

## Testkit To Add

Add shared fixtures before the next large testing expansion:

- `packages/app/src/testkit/memory-repository.ts`: one canonical in-memory
  `DawnRepository` implementation with fixture builders and reset helpers.
- `packages/app/src/testkit/fixtures.ts`: actors, teams, ledger accounts,
  transactions, documents, invoices, projects, provider payloads, outbox events,
  and audit entries.
- `packages/db/src/testkit/pglite.ts`: create a fresh in-memory PGlite client,
  run migrations, return a Drizzle client, and dispose cleanly.
- `packages/db/src/testkit/postgres.ts`: real Postgres helper using
  per-test-schema isolation for the opt-in DB lane.
- `packages/api/src/testkit/context.ts`: authenticated/unauthenticated oRPC and
  Hono contexts backed by app testkit repositories.

If more than two packages need the same builders, promote them to a private
workspace package such as `packages/testkit`.

## PGlite Pattern

PGlite is a WASM Postgres library that runs in Node, Bun, Deno, and browsers.
Drizzle supports it through `drizzle-orm/pglite`.

Recommended shape:

```ts
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../schema";

export async function createPgliteTestDatabase() {
  const client = new PGlite();

  for (const statement of await readDrizzleMigrationStatements()) {
    await client.exec(statement);
  }

  return {
    client,
    db: drizzle(client, { schema }),
    async dispose() {
      await client.close();
    },
  };
}
```

Use PGlite for fast local tests where a fresh database per test file is simpler
than schema cleanup. Do not use it as the only database gate for behavior that
depends on the `pg` driver, production extensions, external connection pooling,
Postgres roles/schemas, advisory locks, or high-concurrency semantics.

## Vitest Pattern

Add a root `vitest.config.ts` when the first UI/component lane lands. Use
project isolation rather than mixing all tests into one browser-like process.

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "web",
          environment: "happy-dom",
          include: ["apps/web/src/**/*.vitest.test.{ts,tsx}"],
        },
      },
      {
        test: {
          name: "ui",
          environment: "happy-dom",
          include: ["packages/ui/src/**/*.vitest.test.{ts,tsx}"],
        },
      },
      {
        test: {
          name: "node",
          environment: "node",
          include: ["packages/*/src/**/*.vitest.test.ts"],
        },
      },
    ],
  },
});
```

Keep file naming explicit:

- `*.test.ts`: Bun default lane.
- `*.pglite.test.ts`: Bun plus PGlite DB lane.
- `*.postgres.test.ts`: opt-in real Postgres lane.
- `*.vitest.test.ts` or `*.vitest.test.tsx`: Vitest lane.
- `*.e2e.test.ts`: opt-in live app/API lane.

## Commands

Target command set:

```sh
bun run test              # fast default Bun suite
bun run test:unit         # Bun unit/use-case/contract tests, no real DB
bun run test:vitest       # Vitest browser/Vite/project tests
bun run test:pglite       # PGlite-backed repository tests
bun run test:postgres     # opt-in real Postgres integration tests
bun run test:e2e          # opt-in live API/web flows
bun run eval:ai           # deterministic AI evaluation gate
bun run release:gate      # typecheck, lint/format, tests, evals, worker bundle
```

CI should run `test`, `test:vitest`, `test:pglite`, `eval:ai`, typecheck, lint,
secret checks, migration checks, and worker bundle checks on pull requests.
Run `test:postgres` and `test:e2e` on release branches, scheduled builds, or
explicit labels until they are cheap enough for every PR.

For local real-Postgres parity testing:

```sh
docker compose -f docker-compose.test.yml up -d postgres-test
DAWN_DATABASE_TEST_URL=postgres://dawn:dawn@127.0.0.1:54329/dawn_test bun run test:postgres
docker compose -f docker-compose.test.yml down
```

## Implementation Order

For agent-ready vertical slices, see `docs/work/TESTING-VERTICAL-SLICES.md`.

1. Preserve the current green Bun suite and current `bun run test` behavior.
2. Extract app/API memory repository fixtures into a testkit.
3. Add PGlite dependency and `packages/db/src/testkit/pglite.ts`.
4. Keep the PGlite repository lane fast and the `*.postgres.test.ts` lane
   focused on production Postgres parity.
5. Add root Vitest config and the first UI/component tests only when the web/UI
   surface needs browser-like testing.
6. Add provider normalization snapshots and golden matching/categorization
   datasets as real payloads accumulate.
7. Add live E2E flows for onboarding, mock bank connection, transaction review,
   receipt upload/match, invoice send, and assistant cashflow explanation.

## References

- PGlite docs: https://pglite.dev/docs/
- Drizzle PGlite driver: https://orm.drizzle.team/docs/connect-pglite
- Bun test mocks/preload: https://bun.com/docs/test/mocks
- Bun test runner lifecycle: https://bun.com/docs/test
- Vitest projects: https://vitest.dev/guide/projects
