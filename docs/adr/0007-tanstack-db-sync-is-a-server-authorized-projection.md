# 0007: TanStack DB Sync Is A Server-Authorized Projection

Status: Accepted
Date: 2026-06-14

## Context

The web app should feel reactive and collaborative. TanStack DB can provide local collections and optimistic interactions, but Dawn's authoritative financial state must remain server-owned and permissioned.

## Decision

TanStack DB collections are client-side projections backed by server-owned authorization, cursors, redaction, conflict policy, and mutation capability declarations. Collections must map to application/API contracts, not direct database access.

Optimistic updates are allowed for low-risk edits such as draft metadata, tags, categories, review flags, and time entries when the server can correct conflicts. High-risk operations such as sending invoices, recording payments, changing roles, deleting financial records, bank connections, and external provider writes require server confirmation before being presented as durable.

## Consequences

- Sync contracts need explicit team scope and permission requirements.
- Client collections must tolerate server correction and invalidation from outbox events.
- TanStack DB is never the authority for financial or permission state.
- Early slices may refresh through queries while preserving the eventual collection contract shape.

## Alternatives Considered

- Plain TanStack Query only: simpler starter path but does not establish the reactive collection model desired for the product.
- Fully local-first mutations: fast UX but too risky for audited financial state.
- Direct database sync to clients: unacceptable authorization and redaction boundary.
