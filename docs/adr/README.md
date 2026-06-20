# Architecture Decision Records

Use ADRs for durable decisions that future agents should not have to rediscover.

## Format

Create files named:

```text
NNNN-short-title.md
```

Use this structure:

```markdown
# NNNN: Short Title

Status: Proposed | Accepted | Superseded
Date: YYYY-MM-DD

## Context

## Decision

## Consequences

## Alternatives Considered
```

## When To Add An ADR

Add or update an ADR when work decides:

- Runtime boundaries: Workers, Durable Objects, Queues, Workflows, Trigger.dev, or regional workers.
- Data authority: Postgres, R2, KV, vector indexes, search, TanStack DB projections.
- Package ownership: domain, app, API, DB, jobs, sync, AI, integrations.
- Financial representation, ledger behavior, invoice state, or reconciliation rules.
- Permission, audit, idempotency, or public API scope models.
- AI tool permissioning, approval policy, retrieval strategy, or evaluation requirements.
- Provider adapter standards.

## Accepted Baseline ADRs

The initial PRD decisions are recorded here:

- [0001: Application Layer Owns Business Mutations](0001-application-layer-owns-business-mutations.md)
- [0002: Postgres Is The Authoritative Store](0002-postgres-is-the-authoritative-store.md)
- [0003: Cloudflare-First Runtime Boundaries](0003-cloudflare-first-runtime-boundaries.md)
- [0004: Durable Objects Coordinate Tenants](0004-durable-objects-coordinate-tenants.md)
- [0005: Outbox Is The Event Backbone](0005-outbox-is-the-event-backbone.md)
- [0006: Money Uses Exact Representations](0006-money-uses-exact-representations.md)
- [0007: TanStack DB Sync Is A Server-Authorized Projection](0007-tanstack-db-sync-is-a-server-authorized-projection.md)
- [0008: TanStack AI Tools Call Application Use Cases](0008-tanstack-ai-tools-call-application-use-cases.md)
- [0009: Provider Adapters Are Isolated Behind Ports](0009-provider-adapters-are-isolated-behind-ports.md)
- [0010: Trigger.dev Is An Exception Behind Job Contracts](0010-trigger-dev-is-an-exception-behind-job-contracts.md)
- [0011: Public API Is Versioned, Scoped, And Use-Case Backed](0011-public-api-is-versioned-scoped-and-use-case-backed.md)
- [0012: Auth And Registry Providers Are Boundary Layers](0012-auth-and-registry-providers-are-boundary-layers.md)
- [0013: Product Scope Is Fortnox-Native Quote-To-Cash](0013-product-scope-is-fortnox-native-quote-to-cash.md)

Do not create ADRs that merely restate code. ADRs should capture decisions, tradeoffs, and consequences.
