# Context Map

Use this file to route quickly through the repo. The active product direction is Dawn quote-to-cash: a Fortnox-native Swedish B2B flow from account/contact and deal to quote or contract, TIC BankID signing, Fortnox invoice, and timeline follow-up.

For the focused product PRD, use `docs/product/FORTNOX-SALES-OS-PRD.md`.

For executable Fortnox/TIC sales-flow work, use `docs/work/FORTNOX-SALES-OS-VERTICAL-SLICES.md`.

For durable architecture decisions, use `docs/adr/`.

## Current Repo Map

### `apps/web`

React web app using Vite, TanStack Router, TanStack Query, Better Auth client helpers, and shared UI components.

Look here for:

- Routes and page composition: `apps/web/src/routes`
- Auth UI and client calls: `apps/web/src/components`, `apps/web/src/lib/auth-client.ts`
- oRPC client setup: `apps/web/src/utils/orpc.ts`
- Theme/global app shell: `apps/web/src/routes/__root.tsx`

Do not put business rules here. UI should call typed API/app capabilities.

### `apps/server`

Hono server exposing Better Auth routes, oRPC, and OpenAPI reference handling.

Look here for:

- HTTP entrypoint: `apps/server/src/index.ts`
- Server package scripts/build config: `apps/server/package.json`, `apps/server/tsdown.config.ts`

This app should assemble request context and delegate behavior to `packages/api`, then `packages/app` as that package is introduced.

### `apps/desktop`

Electrobun shell for the web app.

Look here for:

- Desktop boot code: `apps/desktop/src/bun/index.ts`
- Desktop packaging: `apps/desktop/electrobun.config.ts`

Keep desktop-specific behavior native-shell oriented: deep links, notifications, file capture, quick search, and tray integration.

### `packages/api`

Current oRPC router and procedure setup.

Look here for:

- Procedure/context setup: `packages/api/src/index.ts`, `packages/api/src/context.ts`
- Router definitions: `packages/api/src/routers`

Target direction: this package becomes transport contracts and route schemas. It should call application use cases rather than database queries directly.

### `packages/app`

Application use cases and repository ports.

Look here for:

- Quote-to-cash behavior to add: Fortnox connection, account/contact/deal, quote/commercial document, TIC signing, trust checks, and Fortnox invoice handoff.
- Existing reusable modules: `packages/app/src/crm.ts`, `packages/app/src/billing.ts`, `packages/app/src/documents-inbox.ts`, `packages/app/src/integrations.ts`, `packages/app/src/automation.ts`.
- Parked product modules: banking ledger/accountant handoff, projects/time, assistant, public API/developer platform.

Keep business behavior here, not in routes, workers, UI components, or provider adapters.

### `packages/auth`

Better Auth configuration and payment plugin integration.

Look here for:

- Auth configuration: `packages/auth/src/index.ts`
- Polar client setup: `packages/auth/src/lib/payments.ts`

Target direction: Better Auth session, organization, invitation, and membership plumbing remains here. Mapping those auth records into Dawn tenants, principals, memberships, and authorization context belongs in app/domain/db code; CRM permissions do not live in Better Auth roles alone.

### `packages/db`

Drizzle/Postgres schema and database entrypoint.

Look here for:

- Database client: `packages/db/src/index.ts`
- Schemas: `packages/db/src/schema/core.ts`, `packages/db/src/schema/crm.ts`, `packages/db/src/schema/auth.ts`
- Drizzle config: `packages/db/drizzle.config.ts`

Target direction: schema, migrations, repository primitives, transaction helpers, outbox persistence, audit log, and idempotency state.

### `packages/env`

Typed environment variables for server and web.

Look here for:

- Server env: `packages/env/src/server.ts`
- Web env: `packages/env/src/web.ts`

### `packages/infra`

Cloudflare/Alchemy deployment scaffold.

Look here for:

- Infrastructure entrypoint: `packages/infra/alchemy.run.ts`

Target direction: add Workers, Durable Objects, Queues, Workflows, R2, KV, Hyperdrive, and environment-specific bindings here.

### `packages/ui`

Shared UI primitives and styles.

Look here for:

- Components: `packages/ui/src/components`
- Global styles/tokens: `packages/ui/src/styles/globals.css`

UI component direction:

- Prefer coss UI for new reusable UI primitives and component migrations.
- Use the repo-local coss skill before writing coss code: `.agents/skills/coss/SKILL.md`.
- Check coss primitive docs and particle examples through that skill instead of inventing APIs.
- Existing shadcn-style aliases/components are starter context and may be migrated over time.

## Shared Package Direction

- `packages/domain`: pure entities, value objects, financial math, domain events, invariants, and state machines.
- `packages/app`: use cases, authorization, transactions, idempotency, audit, outbox writes, and provider port calls.
- `packages/jobs`: job names, queue names, payload schemas, retry policy, and idempotency policy.
- `packages/integrations`: provider adapter contracts and implementations, including Fortnox and TIC behind app-owned use cases.
- `packages/sync`: TanStack DB collection definitions, sync protocol, cursor policy, and conflict policy.
- `packages/ai`: AI runtime, tools, prompts, permissions, retrieval, and evals. User-facing copilot remains parked for MVP.
- Worker execution currently routes through `apps/server/src/worker-runtime.ts`; add a separate `apps/worker` only when deployment/runtime boundaries require it.

## Reference Repo Map

`ref/midday` is the read-only Midday reference clone.

Useful areas:

- API and routes: `ref/midday/apps/api`
- Dashboard product flows: `ref/midday/apps/dashboard`
- Background jobs: `ref/midday/apps/worker`, `ref/midday/packages/job-client`, `ref/midday/packages/jobs`
- Database schema and queries: `ref/midday/packages/db`
- Banking providers: `ref/midday/packages/banking`
- Accounting providers: `ref/midday/packages/accounting`
- Documents: `ref/midday/packages/documents`
- Invoices: `ref/midday/packages/invoice`
- Assistant/MCP: `ref/midday/apps/api/src/chat`, `ref/midday/apps/api/src/mcp`

Use Midday to understand product surface and provider workflows. Do not copy its architecture blindly.

## When To Inspect Next

- For product requirements: start with `docs/product/FORTNOX-SALES-OS-PRD.md`.
- For active implementation slices: use `docs/work/FORTNOX-SALES-OS-VERTICAL-SLICES.md`.
- For terminology: start with `CONTEXT.md`.
- For implementation location: start with this file.
- For decisions: check `docs/adr/`.
- For agent workflow conventions: check `AGENTS.md`.
