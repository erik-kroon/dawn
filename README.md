# dawn

This project was created with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack), a modern TypeScript stack that combines React, TanStack Router, Hono, ORPC, and more.

## Features

- **TypeScript** - For type safety and improved developer experience
- **TanStack Router** - File-based routing with full type safety
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **Shared UI package** - Coss-first reusable primitives live in `packages/ui`
- **Hono** - Lightweight, performant server framework
- **oRPC** - End-to-end type-safe APIs with OpenAPI integration
- **Bun** - Runtime environment
- **Drizzle** - TypeScript-first ORM
- **PostgreSQL** - Database engine
- **Authentication** - Better-Auth
- **Electrobun** - Lightweight desktop shell for web frontends
- **Oxlint** - Oxlint + Oxfmt (linting & formatting)
- **Vite+** - Unified Vite toolchain, workspace task runner, linting, and formatting

## Getting Started

First, install the dependencies:

```bash
bun install
```

## Database Setup

This project uses PostgreSQL with Drizzle ORM.

1. Make sure you have a PostgreSQL database set up.
2. Update your `apps/server/.env` file with your PostgreSQL connection details.

3. Apply the schema to your database:

```bash
bun run db:push
```

Then, run the development server:

```bash
bun run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser to see the web application.
The API is running at [http://localhost:3000](http://localhost:3000).

## UI Customization

React web apps in this stack share reusable UI primitives through `packages/ui`. New UI component work should prefer coss UI primitives and particles.

- Change design tokens and global styles in `packages/ui/src/styles/globals.css`
- Update shared reusable components in `packages/ui/src/components/*`
- Use `.agents/skills/coss/SKILL.md` before adding or migrating coss components
- Treat the existing shadcn-style aliases in `packages/ui/components.json` and `apps/web/components.json` as starter compatibility context

### Add more shared components

Use the coss skill to choose the right primitive or particle, then install coss components into the shared UI package. The common registry pattern is:

```bash
npx shadcn@latest add @coss/<component>
```

Import shared components like this:

```tsx
import { Button } from "@dawn/ui/components/button";
```

### Add app-specific blocks

Prefer reusable coss-based primitives in `packages/ui`. App-specific composition can live in `apps/web/src/components` when it is tightly coupled to one product surface.

## Deployment

### Cloudflare via Alchemy

- Target: web
- Dev: bun run dev
- Deploy: bun run deploy
- Destroy: bun run destroy

For more details, see the guide on [Deploying to Cloudflare with Alchemy](https://www.better-t-stack.dev/docs/guides/cloudflare-alchemy).

## Git Hooks and Formatting

- Optional native Vite+ hooks: `bun run hooks:setup`
- Docs: [Vite+ commit hooks](https://viteplus.dev/guide/commit-hooks)
- Run checks: `bun run check`

## Project Structure

```
dawn/
├── apps/
│   ├── web/         # Frontend application (React + TanStack Router)
│   └── server/      # Backend API (Hono, ORPC)
├── packages/
│   ├── ui/          # Shared Coss-first UI components and styles
│   ├── api/         # API layer / business logic
│   ├── auth/        # Authentication configuration & logic
│   └── db/          # Database schema & queries
```

## Available Scripts

- `bun run dev`: Start all applications in development mode
- `bun run build`: Build all applications
- `bun run dev:web`: Start only the web application
- `bun run dev:server`: Start only the server
- `bun run check-types`: Check TypeScript types across all apps
- `bun run db:push`: Push schema changes to database
- `bun run db:generate`: Generate database client/types
- `bun run db:migrate`: Run database migrations
- `bun run db:studio`: Open database studio UI
- `bun run check`: Run Vite+ format/lint checks and workspace TypeScript checks
- `bun run lint`: Run Vite+ lint checks
- `bun run format`: Run Vite+ formatting
- `bun run staged`: Run Vite+ checks against staged files
- `bun run hooks:setup`: Install Vite+ native Git hooks with `vp config`
- `bun run dev:desktop`: Start the Electrobun desktop app with HMR
- `bun run build:desktop`: Build the stable Electrobun desktop app
- `bun run build:desktop:canary`: Build the canary Electrobun desktop app
