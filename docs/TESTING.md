# Testing Strategy

Dawn tests should prove product contracts at the layer that owns the behavior.
Business behavior belongs in `packages/domain` and `packages/app`; routes,
workers, provider adapters, sync, UI, and AI tools should mostly verify
delegation, translation, and integration boundaries.

## Default Commands

```bash
bun run test
bun run check-types
bun run check
```

Use narrower commands while developing:

```bash
bun run test:unit
bun run test:pglite
bun run test:postgres
bun run test:vitest
bun run test:e2e
bun run eval:ai
```

`test:postgres`, `test:e2e`, and live provider checks are opt-in unless CI or a
release gate explicitly configures the required services and credentials.

## Layer Ownership

- `packages/domain`: pure value objects, money, permissions, scoring, state
  machines, and invariant tests. No database, network, auth provider, Worker, or
  UI imports.
- `packages/app`: primary use-case behavior contract. Sensitive use cases should
  test tenant isolation, permissions, idempotency, audit, outbox, rollback, and
  provider-port behavior with fakes.
- `packages/db`: repository mapping, constraints, migrations, transaction
  helpers, audit/outbox/idempotency persistence, and tenant predicates. Prefer
  PGlite for fast SQL feedback and real Postgres for pg-driver/migration parity.
- `packages/api` and `apps/server`: auth/context resolution, typed errors,
  request parsing, OpenAPI/oRPC contract shape, idempotency headers, rate limits,
  and delegation to app use cases.
- `apps/web` and `packages/ui`: rendering, interaction states, accessibility
  basics, API client wiring, and optimistic UI behavior. Keep business rules out
  of UI tests.
- `packages/integrations`: provider adapter contract tests, fixture
  normalization, raw-payload preservation, webhook verification, and retry/error
  classification.
- `packages/jobs`: job payload schemas, retry policy, handler routing,
  idempotency, stale recovery, and outbox dispatch behavior.
- `packages/sync`: server-authorized collection contracts, cursors, redaction,
  conflict policy, reconnect behavior, and realtime invalidation.
- `packages/ai`: deterministic evals, tool schemas, permission/refusal behavior,
  grounded responses, and approval-gated mutations.

## AI Evaluation Gate

AI tool, prompt, provider, retrieval, or approval-policy changes should run:

```bash
bun run eval:ai
bun test packages/ai/src/evals.test.ts packages/ai/src/insights.test.ts
```

The local deterministic gate should require fixture accuracy, zero false
mutations, zero hallucinated sources, zero permission failures, and zero refusal
failures. Do not lower thresholds to land a regression; update fixtures only
when the product contract changes.

## Test Data

Keep fixtures small, source-cited, and close to the package that owns the
contract. Use provider raw payload fixtures for adapter normalization, golden
datasets for matching/categorization/extraction as real examples accumulate,
and app-owned fakes instead of broad global mocks.

## Release Gate

Before production-facing changes, run the relevant focused tests plus:

```bash
bun run check-types
bun run check
bun run check:secrets
bun run check:migrations
bun run check:worker
```

Use live E2E only against documented local, staging, or sandbox environments and
clean up created data.
