# Dawn Architecture Verticalization Goal

Act as the implementing agent for the Dawn architecture remediation and Midday-informed hardening plan. Implement the slices in `docs/work/ARCHITECTURE-VERTICAL-SLICES.md` in dependency order, keeping the first seven architecture-review slices first unless the user explicitly changes the order.

Authoritative inputs:

- `AGENTS.md`
- `CONTEXT.md`
- `CONTEXT-MAP.md`
- `docs/PRD.md`
- `docs/work/IMPLEMENTATION-PRD.md`
- `docs/work/ARCHITECTURE-VERTICAL-SLICES.md`
- `docs/work/VERTICAL-SLICES.md` for original product slice context
- `docs/work/ORCHESTRATION.md` for current implementation and verification status
- `docs/adr/README.md` and existing ADRs
- `goals/dawn-end-to-end-orchestration/goal.md`
- `.agents/skills/coss/SKILL.md` for UI work

Use `ref/midday` only as read-only reference material. Copy product and operational lessons from Midday, not its direct route-to-query business architecture.

End state:

- Worker jobs, public API routes, oRPC handlers, sync sockets, automations, AI tools, and UI mutations call application use cases instead of owning business behavior.
- `packages/app` is feature-modular while preserving stable `@dawn/app` exports.
- `packages/domain` is split into focused pure modules while preserving stable `@dawn/domain` exports.
- The outbox/job runner owns claim, stale recovery, fanout, retry behavior, handler routing, and job run records.
- Actor and Team request intake is consistent across session users, API keys, OAuth apps, system jobs, assistant tools, provider webhooks, and realtime sync.
- Public API operations are contract-backed and use one source for parsing, scope, idempotency, response mapping, and OpenAPI.
- Sync collections have one authorization, cursor, invalidation, and realtime fanout contract.
- Drizzle persistence has narrower repository ports and clearer implementation locality while keeping Postgres authoritative.
- Dawn gains Midday-inspired worker/runtime visibility, provider organization, public API breadth, dashboard decomposition, and verification gates without weakening the app/domain architecture.

Architecture constraints:

- Business rules live in `packages/domain` and `packages/app`.
- Routes, workers, providers, sync sockets, UI components, and AI tools call app use cases.
- Postgres is authoritative; Durable Objects, TanStack DB, KV, cache, search, and vectors are coordination/projection only.
- Durable Objects coordinate tenants and realtime fanout; they are not financial storage.
- Cloudflare Queues and Workflows are the default async path; Trigger.dev remains behind job contracts only when justified.
- Financial state uses exact money semantics, never JavaScript floating point for authoritative calculations.
- Sensitive mutations require tenant isolation, permission checks, idempotency, audit logs, and outbox events.
- Public API endpoints must be versioned, scoped, rate-limited, idempotent where mutating, and use-case-backed.
- AI actions must be permissioned, auditable, grounded, and approval-gated for risky mutations or external side effects.
- Use coss UI for new product UI components unless the user explicitly asks otherwise.
- Do not edit `ref/midday`.
- Do not spawn Codex CLI workers, create worker worktrees, or delegate implementation unless the user explicitly asks later.

Implementation process:

1. Inspect git status and read the current slice, relevant docs, and touched code before editing.
2. Preserve user changes. Rebaseline overlapping files before modifying them.
3. Follow `docs/work/ARCHITECTURE-VERTICAL-SLICES.md` slice order. The first seven are the architecture spine.
4. Work vertically. Each slice should leave a working boundary or observable behavior, not only a horizontal refactor.
5. Use existing tests as the first verification surface; add or adjust focused tests only when needed to prove changed behavior.
6. Keep public exports stable unless the slice explicitly requires a migration.
7. Update ADRs before spreading a major architecture decision across code.
8. Keep implementation tracking under `docs/work` with slice status, verification, blockers, and next steps.
9. If a slice needs external credentials or live infrastructure, implement local/test adapters and mark only the live proof blocked.
10. After each coherent milestone, run impacted checks, inspect the diff, update tracking, and commit only verified coherent units if committing is part of the active request.

Git/commit policy:

- Commit only coherent verified units.
- Do not commit unrelated user changes.
- Stage paths intentionally.
- Use concise conventional messages, for example `refactor(app): move operations export completion` or `feat(jobs): add outbox runner`.
- Keep docs/ADR-only changes separate when that makes history clearer.
- If work is partial, commit only when it is independently useful, verified, and the remaining work is clearly tracked.

Required initial sequence:

1. Move data export completion into app.
2. Finish data workflow mutation locality.
3. Deepen the outbox and job runner.
4. Deepen Actor and Team intake.
5. Narrow the persistence seam.
6. Add the public API operation contract tracer.
7. Add the sync collection authorization contract.

Then continue through the remaining slices in `docs/work/ARCHITECTURE-VERTICAL-SLICES.md`: app module extraction, domain module extraction, Drizzle repository split, public API contract migration and breadth, worker runtime/registry, sync expansion, dashboard decomposition, and verification closure.

Completion condition:

Mark complete only when all slices in `docs/work/ARCHITECTURE-VERTICAL-SLICES.md` are implemented or explicitly blocked by concrete external prerequisites, relevant checks pass, docs/ADRs match the delivered architecture, implementation tracking is current, and no required architecture slice remains unaccounted for.

If blocked, keep making adjacent useful progress within the same slice or dependency chain. Stop only when no defensible path remains, and report the blocker, attempted paths, evidence, and exact user input or external change needed.
