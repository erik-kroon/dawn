# 0011: Public API Is Versioned, Scoped, And Use-Case Backed

Status: Accepted
Date: 2026-06-14

## Context

Dawn will expose public APIs for external developers and integrations. Public API behavior must not drift from internal product permissions, audit, idempotency, and business rules.

## Decision

Public APIs are versioned, scoped, rate-limited, and generated from typed contracts where practical. API keys and OAuth clients resolve to actors, teams, and scopes that map to product permissions. Public mutations call the same application use cases as internal surfaces and require idempotency keys where retries could duplicate sensitive work.

OpenAPI is generated from contracts and published for supported versions.

## Consequences

- Public API routes stay thin transport adapters.
- Scope design must align with team permissions and audit needs.
- Breaking changes require versioning rather than silent contract drift.
- API clients receive stable typed errors for authorization, validation, idempotency replay, and rate limits.

## Alternatives Considered

- Public API directly over database resources: easy to scaffold but unsafe for business rules and future schema changes.
- Single unversioned API: faster initially but hard to evolve safely.
- Separate public API implementation: increases drift from the app and assistant surfaces.
