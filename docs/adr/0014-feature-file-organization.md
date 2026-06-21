# 0014: Feature File Organization

Status: Accepted
Date: 2026-06-21

## Context

Dawn has useful package boundaries already: `packages/domain` for pure rules,
`packages/app` for use cases, `packages/api` for routers, `packages/db` for
Drizzle schema and repositories, `packages/integrations` for providers, and
`packages/jobs` for queue contracts.

The next architecture move should not be a big package split or strict import
purity exercise. The real problem is that active quote-to-cash features are
still accumulating inside broad files such as:

- `packages/app/src/index.ts`
- `packages/db/src/dawn-repository.ts`
- `packages/api/src/routers/index.ts`
- `packages/integrations/src/index.ts`
- `packages/jobs/src/index.ts`

That makes the repo harder to navigate and makes old Midday-like code, new CRM
code, Sign, and future Solo feel like they are competing for one mental model.

## Decision

Dawn stays a modular monolith. Keep the current packages and organize new code by
feature-aligned files inside those packages.

Use the same feature names across packages:

```text
crm
commercial-documents
signatures
trust
invoice-handoff
market
fortnox
solo
agents
```

Preferred shape for new or touched features:

```text
packages/domain/src/<feature>.ts
packages/app/src/<feature>.ts
packages/api/src/routers/<feature>.ts
packages/db/src/repositories/<feature>.ts
packages/integrations/src/<provider-or-feature>.ts
packages/jobs/src/<feature>.ts
```

Do not move everything at once. Split files only when the current file is painful
or when new work would otherwise add unrelated behavior to a broad file.

The hard rules are:

1. Business state changes go through `packages/app`.
2. Pure calculations, invariants, and state rules go in `packages/domain`.
3. API routes may import DB schema/types for DTOs, zod helpers, tests, admin
   serialization, or debug routes, but route handlers should not own business
   mutations.
4. DB repositories may import narrow app repository types, but not app use-case
   behavior.
5. Provider adapters stay in `packages/integrations`.
6. Workers call app use cases.
7. New code uses feature-aligned filenames. Avoid big-bang moves.

Product separation belongs mostly in app/UI surfaces:

```text
apps/web/src/products/dawn
apps/web/src/products/solo
apps/sign
```

Backend packages remain capability-oriented so Dawn, Sign, and future Solo can
reuse the same CRM, signing, document, accounting, ledger, inbox, and agent
capabilities.

## Consequences

- Do not introduce a new contracts package unless repeated pain proves it is
  needed.
- Do not make `packages/api` pure by policy. Prevent business mutations in
  routers instead.
- Do not ban `packages/db -> packages/app` type imports. Keep them narrow and
  type-only where possible.
- Do not split old files just to make the tree look clean.
- New active-product work should stop expanding large mixed-purpose files.
- Router groups should move out of `packages/api/src/routers/index.ts` as they
  are touched.
- New DB repository behavior should move into
  `packages/db/src/repositories/<feature>.ts`, with `dawn-repository.ts`
  delegating as needed.

## Alternatives Considered

- Strict clean architecture: clearer on paper, but too much churn and too many
  seams before the product needs them.
- Anything-can-import-anything: faster locally, but lets routes, workers, UI, and
  provider adapters accumulate business mutations.
- New packages per bounded context: neat names, but premature while the useful
  feature seams can be proven inside the existing packages.
