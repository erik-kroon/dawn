# 0001: Application Layer Owns Business Mutations

Status: Accepted
Date: 2026-06-14

## Context

Dawn will expose the same business capabilities through web, desktop, internal oRPC, public API, workers, webhooks, automations, and AI tools. If each surface performs its own database writes and authorization checks, rules will drift and sensitive financial changes will become hard to audit.

## Decision

Business mutations must be implemented as application-layer use cases in `packages/app`. Transports, workers, assistant tools, and provider handlers validate transport-specific input, resolve request context, call use cases, and map typed results or errors.

Use cases own authorization, transaction boundaries, idempotency, audit writes, outbox writes, and calls to domain rules or provider ports. Domain code stays pure. Database code provides persistence primitives but does not decide business policy.

## Consequences

- New product behavior should start with a use case rather than a route handler.
- UI components and API routers must not encode financial or permission rules.
- Tests can target stable behavior at the application boundary.
- Simple starter flows may require a little more structure up front, but future surfaces can reuse the same capability safely.

## Alternatives Considered

- Put logic in API routers: faster initially, but public API, workers, webhooks, and AI tools would duplicate rules.
- Put logic in database query helpers: centralizes persistence but hides business policy in data access code and makes non-database domain tests harder.
- Put logic in domain entities only: keeps purity, but cannot own transactions, permissions, audit, idempotency, or side effects.
