# Dawn

Dawn is a Cloudflare-first business operating system for finance workflows, team operations, automations, and AI-assisted work.

The product direction lives in [docs/PRD.md](docs/PRD.md). Domain language lives in [CONTEXT.md](CONTEXT.md), and the current routing map lives in [CONTEXT-MAP.md](CONTEXT-MAP.md).

## Stack

- React, Vite, TanStack Router, and TanStack Query in `apps/web`
- Hono, oRPC, OpenAPI support, and Better Auth session extraction in `apps/server`
- Drizzle and Postgres in `packages/db`
- Application use cases in `packages/app`
- Domain rules in `packages/domain`
- Shared coss-first UI primitives in `packages/ui`
- Cloudflare deployment scaffolding in `packages/infra`
- Electrobun desktop shell in `apps/desktop`

## Development

Install dependencies:

```bash
bun install
```

Run all dev tasks:

```bash
bun run dev
```

Run individual surfaces:

```bash
bun run dev:web
bun run dev:server
bun run dev:desktop
```

The web app runs on [http://localhost:5173](http://localhost:5173). The API runs on [http://localhost:3000](http://localhost:3000).

## Database

Configure the server database environment, then apply schema changes:

```bash
bun run db:push
```

Other database commands:

```bash
bun run db:generate
bun run db:migrate
bun run db:studio
```

## Quality

```bash
bun run check-types
bun run check
```

`bun run check` runs linting and formatting through the workspace toolchain.

## UI

New product UI should prefer coss primitives and particles. Read [.agents/skills/coss/SKILL.md](.agents/skills/coss/SKILL.md) before adding or migrating shared UI components.

Shared reusable components belong in `packages/ui`. App-specific composition can live under `apps/web/src/components`.

## Deploy

```bash
bun run deploy
```

Cloudflare resources are defined in `packages/infra`.
