# 0004: Durable Objects Coordinate Tenants

Status: Accepted
Date: 2026-06-14

## Context

Durable Objects are attractive for tenant-local coordination, presence, fanout, locks, and session state. They are not a relational database and should not become an untracked financial authority.

## Decision

Use Durable Objects for per-tenant coordination: realtime fanout, presence, sync sessions, operation locks, progress tracking, temporary duplicate suppression, and lightweight orchestration. Do not store authoritative financial, permission, invoice, document, audit, or ledger state in Durable Objects.

Durable Object state must either be ephemeral or recoverable from Postgres, R2, provider data, and durable job/outbox records.

## Consequences

- Durable Object failures or resets must not corrupt business records.
- Realtime and sync flows need server-owned authorization and database-backed cursors where state matters.
- Tenant coordination can stay low-latency without creating a second source of truth.

## Alternatives Considered

- Use Durable Objects as tenant databases: appealing locality, but poor fit for relational financial records, reporting, migrations, and cross-tenant operations.
- Avoid Durable Objects entirely: simpler mental model but loses a strong Cloudflare primitive for coordination and realtime fanout.
