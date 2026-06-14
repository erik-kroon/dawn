# 0005: Outbox Is The Event Backbone

Status: Accepted
Date: 2026-06-14

## Context

Important state changes should drive sync invalidation, jobs, notifications, analytics, external webhooks, search indexing, and AI context refresh. Direct callbacks from request handlers can fail after the database commits or run before state is durable.

## Decision

Sensitive and workflow-relevant state changes must write outbox events in the same Postgres transaction as the state change. Dispatchers consume the outbox and deliver events to queues, workflows, Durable Objects, analytics, webhooks, search, or AI projections.

Outbox events are durable facts for integration and processing. Audit logs remain human/compliance-oriented records of who did what and why.

## Consequences

- Use cases that mutate important state must include outbox writes.
- Consumers must be idempotent because dispatch can retry.
- Event schemas need stable names, versions, tenant scope, actor/request metadata, and correlation IDs.
- Side effects become observable and retryable instead of hidden inside route handlers.

## Alternatives Considered

- Inline side effects after commit: simple but can lose work on process failure.
- Provider/webhook callbacks as the integration model: insufficient for internal projections and workflow orchestration.
- Database triggers only: durable but opaque to TypeScript contracts and product-level event naming.
