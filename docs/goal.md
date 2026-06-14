Act as the implementing agent for building Dawn fully end-to-end in this workspace. Personally implement the vertical slices in dependency order, keep architecture coherent, verify each delivered behavior, update docs/ADRs as decisions land, and commit or checkpoint only coherent verified units.

Authoritative inputs:

- AGENTS.md
- CONTEXT.md
- CONTEXT-MAP.md
- docs/PRD.md
- docs/work/IMPLEMENTATION-PRD.md
- docs/work/VERTICAL-SLICES.md
- docs/adr/README.md
- goals/dawn-end-to-end-orchestration/goal.md
- goals/dawn-end-to-end-orchestration/facts.md
- goals/dawn-end-to-end-orchestration/plan.md
- .agents/skills/coss/SKILL.md for UI work

Use ref/midday only as read-only reference material.

End state: the repo implements the complete Cloudflare-first business operating system in the docs: teams/permissions, domain/app layers, Postgres/Drizzle authoritative data, audit/idempotency/outbox, ledger, CSV/banking sync, documents/R2/inbox/extraction/matching, invoicing/payments/recurrence, projects/time tracking, reports/insights, TanStack DB sync/realtime, TanStack AI assistant/tools/approval/evals, automations, integrations, public API/webhooks, desktop improvements, observability, operations, and production gates.

Architecture constraints:

- Business rules live in packages/domain and packages/app.
- UI, routes, workers, providers, and AI tools call app use cases.
- Postgres is authoritative; Durable Objects, TanStack DB, KV, cache, search, and vectors are coordination/projection only.
- Use Cloudflare Workers, Durable Objects, Queues, Workflows, R2, KV/Hyperdrive where appropriate; Trigger.dev only behind job contracts when justified.
- Use Coss UI for new UI components.
- AI actions must be permissioned, auditable, grounded, and approval-gated for risky mutations/external side effects.
- Financial state uses exact money semantics, never JS float for authoritative calculations.
- Sensitive mutations require tenant isolation, permission checks, idempotency, audit logs, and outbox events.
- Do not spawn Codex CLI workers, create worker worktrees, or delegate implementation unless the user explicitly asks later.

Implementation process:

1. Inspect current git status and docs. Preserve user changes. Do not edit ref/midday.
2. Rebaseline the current working tree before editing overlapping files. Treat existing implementation changes as user or prior-agent work.
3. Create/update ADRs before major architecture implementation.
4. Use docs/work/VERTICAL-SLICES.md as the backlog. Maintain implementation tracking under docs/work with slice status, verification, commits/checkpoints, blockers, and next steps.
5. Work vertically where possible: deliver domain/app/db/api/UI/test behavior together when a slice requires the full path.
6. Avoid backend-only/frontend-only/test-only detours unless necessary for a tracked slice or an independently useful foundation.
7. For each slice, inspect the relevant code, implement the smallest coherent final-shape increment, run relevant verification, update tracking, and only then move on.
8. If a slice depends on external credentials or deployed infrastructure, implement provider boundaries, local/test adapters, schemas, fixtures, and verification harnesses first. Mark only live wiring blocked.
9. If a change touches starter compatibility paths, apply zero-tech-debt posture: move toward the intended end-state, delete unused compatibility when caller evidence supports removal, and avoid speculative wrappers/fallbacks.
10. After each coherent milestone, update docs/ADRs if behavior or decisions changed and rerun impacted checks.

Git/commit policy:

- Commit coherent verified units, usually a completed vertical slice or useful sub-slice foundation.
- Commit only after inspecting diff and running relevant verification.
- Do not commit unrelated user changes. Stage paths intentionally.
- Use conventional, scoped messages, e.g. feat(domain): add transaction review tracer, docs(adr): record outbox decision.
- Keep commits bisectable. Docs/ADR changes may be separate from implementation when clearer.
- Before each commit, record in docs/work: slice/task, verification run, result, and commit hash after commit.
- If work is partial, commit only when it is independently useful, verified, and the remaining work is clearly tracked.

Suggested initial sequence:

- First: verify/update ADR baseline.
- Second: complete and harden transaction review tracer work.
- Third: deepen team context and permissions.
- Then proceed through docs/work/VERTICAL-SLICES.md in dependency order.

Completion condition: mark complete only when all required slices and explicit requirements from authoritative docs are implemented, relevant build/type/test/deploy checks pass or credential-dependent blockers are explicitly documented, docs/ADRs match delivered system, git history contains appropriate verified commits for completed work, and no known required slice remains incomplete.

If blocked, keep making adjacent useful implementation progress where possible. Stop only when no defensible path remains, and report blocker, attempted paths, evidence, and exact user input or external change needed.
