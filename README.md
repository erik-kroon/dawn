# Dawn (Pivoted)

Financial workspace prototype. Development stopped after I moved on to other projects.

Dawn is a business operating system for owner-operators, freelancers, agencies,
consultants, and small teams.

It brings the work that usually lives across banking tools, inboxes, file
drives, spreadsheets, invoice apps, and AI chats into one trustworthy workspace:
transactions, receipts, invoices, customers, projects, time, documents,
reporting, automations, and an assistant that can explain and act on business
data.

Dawn is designed around one domain model, one application boundary,
Cloudflare-native operations, server-authorized sync, and auditable AI tools.

## Status

This repository retains the implementation and design direction from the prototype.
It is no longer under active development. Some product areas described below are
unfinished plans rather than implemented runtime behavior.

Start with:

- [Product requirements](docs/PRD.md)
- [Domain language](CONTEXT.md)
- [Codebase map](CONTEXT-MAP.md)
- [Architecture decisions](docs/adr/README.md)
- [Agent workflow notes](docs/agents/README.md)

## Product Scope

Dawn is built around the daily operating loop of a small business:

- **Transactions and banking**: sync accounts, import transactions, categorize
  money movement, review exceptions, and keep financial records clean.
- **Inbox and documents**: collect receipts, invoices, statements, contracts,
  and forwarded emails, then extract metadata and connect them to the right
  business records.
- **Matching and reconciliation**: automatically match obvious receipts,
  invoices, payments, and transactions while surfacing low-confidence cases for
  human review.
- **Invoicing and billing**: create invoices, send them to customers, track
  payment status, handle recurring billing, and connect billing activity back to
  revenue.
- **Customers, projects, and time**: understand customer performance, track
  billable work, and turn project hours into invoice lines without re-entering
  data.
- **Files and search**: keep business documents in object storage with searchable
  metadata, extraction results, and links to transactions, invoices, customers,
  and projects.
- **Reporting and insights**: explain revenue, cash, spending, runway,
  profitability, and weekly/monthly changes from the same underlying records.
- **Automations and AI**: let assistants draft, search, classify, match, explain,
  and propose actions through the same permissioned use cases as the app.

## Architecture Principles

Dawn's core rule is simple: every surface calls the application layer, and the
application layer owns business behavior.

- **One domain, many surfaces**: web, desktop, public API, internal oRPC,
  webhooks, workers, automations, and AI tools should all share the same use
  cases.
- **Postgres is authoritative**: financial state, invoices, documents,
  permissions, audit logs, idempotency state, and outbox events belong in
  Postgres.
- **Cloudflare-first where it fits**: Workers, Durable Objects, Queues,
  Workflows, R2, KV, Hyperdrive, and Cron Triggers are preferred for edge,
  coordination, storage, and orchestration needs.
- **Durable Objects coordinate, not store truth**: tenant-local realtime,
  presence, locks, progress, and fanout can use Durable Objects; authoritative
  business records stay in Postgres.
- **Outbox-driven side effects**: business mutations emit durable events that
  drive jobs, sync invalidation, notifications, indexing, analytics, and audit.
- **Provider adapters stay isolated**: banking, accounting, payments, email,
  storage, messaging, and AI providers sit behind ports instead of leaking into
  route handlers or domain code.
- **AI is permissioned and traceable**: assistant tools must resolve actor and
  team, call use cases, respect approval policy, and leave an audit trail.
- **Money uses exact representations**: authoritative financial calculations
  must not use JavaScript floating point.

## Repo Map

| Path                    | Purpose                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| `apps/web`              | React, Vite, TanStack Router, TanStack Query, and shared UI.                                   |
| `apps/server`           | Hono server with Better Auth routes, oRPC, and OpenAPI support.                                |
| `apps/desktop`          | Electrobun desktop shell around Dawn surfaces.                                                 |
| `packages/domain`       | Pure domain rules, value objects, events, invariants, and state machines.                      |
| `packages/app`          | Use cases, authorization, transactions, idempotency, audit, outbox writes, and provider ports. |
| `packages/api`          | Transport contracts, procedure setup, and router composition.                                  |
| `packages/db`           | Drizzle/Postgres schema, repositories, migrations, and database access.                        |
| `packages/auth`         | Better Auth configuration and payment integration.                                             |
| `packages/jobs`         | Job names, queue payloads, retry policy, and worker-facing contracts.                          |
| `packages/integrations` | Provider adapter contracts and integration implementations.                                    |
| `packages/sync`         | TanStack DB collection definitions and server-authorized sync contracts.                       |
| `packages/ai`           | AI tools, prompts, evals, and assistant runtime contracts.                                     |
| `packages/infra`        | Cloudflare and Alchemy infrastructure definitions.                                             |
| `packages/ui`           | Shared coss-first UI primitives, components, and global styles.                                |
| `packages/env`          | Typed server and web environment parsing.                                                      |
| `packages/config`       | Shared workspace configuration.                                                                |

## Local Development

Install dependencies:

```bash
bun install
```

Run all development tasks:

```bash
bun run dev
```

Run individual surfaces:

```bash
bun run dev:web
bun run dev:server
bun run dev:desktop
```

Default local URLs:

- Web: [http://localhost:5173](http://localhost:5173)
- API: [http://localhost:3000](http://localhost:3000)

## Database

Configure the server database environment before running schema commands.

```bash
bun run db:push
```

Other database commands:

```bash
bun run db:generate
bun run db:migrate
bun run db:studio
bun run db:introspect
```

## Quality Gates

Use the focused checks while developing:

```bash
bun run check-types
bun run test
bun run check
```

Useful test lanes:

```bash
bun run test:unit
bun run test:pglite
bun run test:postgres
bun run test:vitest
bun run test:e2e
```

Release-oriented checks:

```bash
bun run check:ignored-ts
bun run check:secrets
bun run check:migrations
bun run check:worker
bun run release:gate
```

`bun run check` runs oxlint and formats through oxfmt.

## UI Direction

New product UI should prefer coss primitives and particles. Read
[.agents/skills/coss/SKILL.md](.agents/skills/coss/SKILL.md) before adding or
migrating shared UI components.

Shared reusable components belong in `packages/ui`. App-specific composition can
live under `apps/web/src/components`.

## Deployment

Cloudflare resources are defined in `packages/infra`.

```bash
bun run deploy
```

Infrastructure teardown, when intentionally needed:

```bash
bun run destroy
```
