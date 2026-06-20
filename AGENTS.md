# Agent Guidance

This repo is building Dawn. The active product focus is now a Fortnox-native quote-to-cash CRM: a Cloudflare-first Swedish B2B sales flow for account/contact -> deal -> quote/contract -> TIC BankID signing/trust check -> Fortnox invoice -> payment timeline. The product sells Fortnox-first, but shared architecture should stay accounting-provider-native so Spiris/eAccounting can be proven later without rewriting the commercial core. The broader business-OS code remains reusable infrastructure or parked product surface. Read this file first, then use the linked context docs.

## Source Of Truth

- Active product PRD: `docs/product/FORTNOX-SALES-OS-PRD.md`
- Active product slices: `docs/work/FORTNOX-SALES-OS-VERTICAL-SLICES.md`
- Domain terms and concepts: `CONTEXT.md`
- Codebase routing map: `CONTEXT-MAP.md`
- Architecture decisions: `docs/adr/`
- Reference product clone: `ref/midday` is read-only reference material and is ignored by git.

For the first beta, do not make generic CRM metadata, banking ledger, accountant handoff, projects/time, public API/developer platform, AI copilot, generic automation builder, email/OCR parity, or Spiris/Visma parity blockers for product work.

## Architecture Posture

- Keep business rules out of route handlers, UI components, workers, and provider adapters.
- Add shared business behavior through `packages/domain` and `packages/app` as the system grows.
- Public API, internal oRPC, webhooks, workers, automations, and AI tools should all call application use cases rather than touching database queries directly.
- Postgres is the authoritative store. Durable Objects, TanStack DB, KV, cache, search, and vector indexes are projections or coordination layers.
- Prefer Cloudflare-native primitives where they fit: Workers, Durable Objects, Queues, Workflows, R2, KV, and Hyperdrive.
- Trigger.dev is acceptable only behind job contracts when Cloudflare runtime limits or workflow visibility justify it.

## Current Stack

- `apps/web`: React, Vite, TanStack Router, TanStack Query, shared UI package.
- `apps/server`: Hono, oRPC, OpenAPI support, Better Auth session extraction.
- `apps/desktop`: Electrobun shell.
- `packages/api`: transport/router layer.
- `packages/auth`: Better Auth and Polar integration.
- `packages/db`: Drizzle/Postgres schema and database access.
- `packages/env`: typed environment parsing.
- `packages/infra`: Cloudflare/Alchemy deployment scaffold.
- `packages/ui`: shared UI primitives and global styles. New UI component work should prefer coss UI primitives/particles.

## UI Component Policy

- Use coss UI for new product UI components and component migrations unless the user explicitly asks otherwise.
- Before writing coss UI code, read `.agents/skills/coss/SKILL.md` and follow its component docs/particle workflow.
- Prefer existing coss primitives and particles over custom markup or one-off component behavior.
- Keep shared reusable components in `packages/ui`; app-specific composition can live under `apps/web/src/components`.
- The starter still has shadcn-style aliases and some existing primitives. Treat those as migration context, not the preferred direction for new UI.

## Development Commands

- Install: `bun install`
- Run all dev tasks: `bun run dev`
- Web only: `bun run dev:web`
- Server only: `bun run dev:server`
- Desktop only: `bun run dev:desktop`
- Typecheck: `bun run check-types`
- Lint/format check: `bun run check`
- Database push: `bun run db:push`
- Database migrations: `bun run db:migrate`
- Cloudflare deploy: `bun run deploy`

## Editing Rules

- Do not edit `ref/midday` unless the user explicitly asks; use it for comparison only.
- Do not introduce a second agent entrypoint unless this file is intentionally replaced.
- Keep repo context docs durable and short. Put detailed product scope in `docs/product/FORTNOX-SALES-OS-PRD.md`; put decisions in ADRs.
- When adding a major architecture decision, add or update an ADR before spreading the decision across code.
- If implementation touches financial state, permissions, sync, jobs, AI tools, or provider adapters, check the active Fortnox PRD, `CONTEXT.md`, and ADRs first.
