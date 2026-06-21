# Dawn

Dawn's active product focus is a Fortnox-native quote-to-cash CRM for Swedish
SMBs: create the account/contact and deal, build a quote or contract, get the
right person to sign with BankID-backed TIC signing, then create the linked
invoice in Fortnox.

The broader business-OS codebase still contains banking, inbox, documents,
invoicing, projects, reporting, automations, public API, and assistant
foundations. Treat those as reusable infrastructure or parked product surfaces
unless the quote-to-cash roadmap pulls them back into the narrow flow.

Dawn is designed around one domain model, one application boundary,
Cloudflare-native operations, server-authorized sync, and auditable AI tools.

## Status

Dawn is in active product and architecture buildout. The current repo is a
TypeScript monorepo foundation with the target package boundaries being filled
in. Some product areas described here are product direction rather than finished
runtime behavior.

Start with:

- [Dawn quote-to-cash PRD](docs/product/FORTNOX-SALES-OS-PRD.md)
- [Dawn quote-to-cash vertical slices](docs/work/FORTNOX-SALES-OS-VERTICAL-SLICES.md)
- [Domain language](CONTEXT.md)
- [Codebase map](CONTEXT-MAP.md)
- [Architecture decisions](docs/adr/README.md)
- [Testing strategy](docs/TESTING.md)
- [Cloudflare deployment](docs/deployment/CLOUDFLARE.md)

## Product Scope

Dawn's first sellable scope is:

- **Fortnox-native CRM**: accounts, contacts, deals, Fortnox customer mappings,
  and a customer/deal timeline.
- **Quote to contract**: quote builder, commercial document versions, PDF
  previews, terms snapshots, and signing packages.
- **TIC trust and signing**: BankID signing, signer/company checks, signing
  evidence, and auditable status changes.
- **Fortnox invoice handoff**: create the invoice after signing, then show
  invoice and payment status from Fortnox. Order creation is parked for P1
  unless Phase 0 validation changes that decision.
- **Operational backbone**: audit, outbox, jobs, idempotency, provider adapters,
  document storage, and sync/recovery state.

Parked product surfaces for the first beta:

- banking ledger dashboard, CSV import, accountant handoff, and close workflows
- projects and time tracking
- public API/developer platform
- AI copilot and approval workflows
- generic automation builder
- generic CRM custom object platform
- email inbox/OCR parity as a primary wedge

## Architecture Principles

Dawn's core rule is simple: every surface calls the application layer, and the
application layer owns business behavior.

- **Feature-aligned modular monolith**: keep the current packages, use consistent
  feature filenames across them, and split broad files only when they become
  painful.
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
