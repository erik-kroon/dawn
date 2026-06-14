# 0002: Postgres Is The Authoritative Store

Status: Accepted
Date: 2026-06-14

## Context

Dawn manages financial and operational records that must be durable, auditable, queryable, and recoverable. The architecture also expects Cloudflare primitives, TanStack DB, object storage, vector indexes, search indexes, and caches.

## Decision

Postgres is the system of record for teams, permissions, transactions, ledger state, documents metadata, invoices, jobs state that needs durability, audit logs, idempotency records, outbox events, and provider webhook records.

R2 stores binary artifacts. TanStack DB, KV, Durable Objects, search, vector stores, analytics systems, browser storage, and caches are projections, coordination mechanisms, or derived stores. They must be rebuildable or reconcilable from Postgres and provider source data.

## Consequences

- Sensitive state changes must commit to Postgres before being treated as authoritative.
- Derived stores need explicit invalidation, sync, or rebuild paths.
- Database migrations and constraints are part of the product contract.
- Cloudflare edge state cannot become an alternate financial database.

## Alternatives Considered

- Edge-first state in Durable Objects or KV: low latency but weak fit for authoritative financial records and relational audit queries.
- Local-first authority through TanStack DB/browser storage: good UX but unacceptable for audited financial mutations.
- Provider APIs as authority: useful for reconciliation, but Dawn needs its own canonical business model and history.
