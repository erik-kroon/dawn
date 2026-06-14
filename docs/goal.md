Act as the orchestrating agent for implementing Dawn fully end-to-end. Do not personally implement the whole system in one thread. Plan, spawn, supervise, merge, verify, commit, and keep architecture coherent while using Codex CLI worker threads where useful.

Authoritative inputs:

- AGENTS.md
- CONTEXT.md
- CONTEXT-MAP.md
- docs/PRD.md
- docs/work/IMPLEMENTATION-PRD.md
- docs/work/VERTICAL-SLICES.md
- docs/adr/README.md
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

Orchestration process:

1. Inspect current git status and docs. Preserve user changes. Do not edit ref/midday.
2. Create/update ADRs before major architecture implementation.
3. Use docs/work/VERTICAL-SLICES.md as the backlog, not as a rigid one-slice-one-thread rule. Maintain docs/work/ORCHESTRATION.md with slice status, worker branches/worktrees, verification, commits, blockers.
4. Break slices into worker tasks as needed. One slice may use multiple workers, one worker may handle multiple small related slices, and the orchestrator may do small glue work directly. Optimize for coherent ownership, low merge risk, and verified progress.
5. Identify tasks that can run in parallel without touching the same files/contracts. Parallelize only when merge risk is low.
6. For each worker, create an isolated branch/worktree when safe, e.g. codex/slice-XX-short-name or codex/task-short-name, then run:
   codex exec -C <worktree> --sandbox workspace-write -a never "<worker prompt>"
7. Worker prompts must include: exact goal, relevant slice(s), authoritative docs to read, files/areas to inspect, acceptance criteria, verification commands, no ref/midday edits, no unrelated refactors, final summary format, and commit expectation.
8. Prefer vertical worker assignments. Avoid backend-only/frontend-only/test-only tasks unless they are necessary sub-tasks of a tracked slice or have standalone value.
9. Collect worker results, inspect diffs, run verification, resolve conflicts, and merge only when acceptance criteria are met or the partial result is intentionally committed as a verified foundation.
10. If a worker fails, summarize evidence, repair directly only if small, otherwise spawn a focused repair worker.
11. After each merge, update docs/ADRs if behavior or decisions changed and rerun impacted checks.

Git/commit policy:

- Commit coherent verified units, usually a completed vertical slice or a useful sub-slice foundation.
- Commit only after inspecting diff and running relevant verification.
- Do not commit unrelated user changes. Stage paths intentionally.
- Use conventional, scoped messages, e.g. feat(domain): add transaction review tracer, docs(adr): record outbox decision.
- Keep commits bisectable. Docs/ADR changes may be separate from implementation when clearer.
- If workers run in parallel, merge/rebase one branch at a time, resolve conflicts deliberately, rerun impacted checks, then commit/merge.
- Before each commit, record in docs/work/ORCHESTRATION.md: slice/task, branch/worktree, verification run, result, commit hash after commit.
- If work is partial, commit only when it is independently useful, verified, and the remaining work is clearly tracked.

Suggested initial sequence:

- First: ADR baseline worker.
- Second: transaction review tracer work. Split this across multiple workers only if contracts are clear enough to avoid collisions.
- Then parallelize independent follow-ups after shared contracts stabilize.

Completion condition: mark complete only when all required slices and explicit requirements from authoritative docs are implemented, relevant build/type/test/deploy checks pass, docs/ADRs match delivered system, git history contains appropriate verified commits for completed work, and no known required slice remains incomplete.

If blocked, keep making adjacent useful orchestration progress where possible. Stop only when no defensible path remains, and report blocker, attempted paths, evidence, and exact user input or external change needed.
