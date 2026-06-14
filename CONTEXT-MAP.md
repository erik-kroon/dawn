# Context Map

Use this file to route quickly through the repo. The current codebase is a starter; the target package layout is described in `docs/PRD.md`.

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

### `packages/auth`

Better Auth configuration and payment plugin integration.

Look here for:

- Auth configuration: `packages/auth/src/index.ts`
- Polar client setup: `packages/auth/src/lib/payments.ts`

Target direction: session identity remains here, while team permissions and authorization decisions live in application/domain code.

### `packages/db`

Drizzle/Postgres schema and database entrypoint.

Look here for:

- Database client: `packages/db/src/index.ts`
- Current auth schema: `packages/db/src/schema`
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

## Target Packages To Add

- `packages/domain`: pure entities, value objects, financial math, domain events, invariants, state machines.
- `packages/app`: use cases, authorization, transactions, idempotency, audit, outbox writes, provider port calls.
- `packages/jobs`: job names, queue names, payload schemas, retry/idempotency policy.
- `packages/integrations`: provider adapter contracts and implementations.
- `packages/sync`: TanStack DB collection definitions, sync protocol, cursor/conflict policies.
- `packages/ai`: TanStack AI runtime, tools, prompts, permissions, retrieval, evals.
- `apps/worker`: queue/workflow consumers and scheduled job execution.

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

- For product requirements: start with `docs/PRD.md`.
- For terminology: start with `CONTEXT.md`.
- For implementation location: start with this file.
- For decisions: check `docs/adr/`.
- For agent workflow conventions: check `docs/agents/`.
