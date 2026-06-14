# Skill Development Posture

Dawn should use skills as small, explicit workflows for recurring repo work. Skills should help agents remember specialized procedure without becoming a parallel source of truth for product, architecture, or domain rules.

## Default Rule

Create or update a repo-owned skill only when repeated work needs Dawn-specific steps that are too detailed for `AGENTS.md`, `CONTEXT.md`, `CONTEXT-MAP.md`, or ADRs.

Do not create a skill just to capture one-off task instructions. Keep one-off execution notes in the relevant plan, PRD, work item, or final response.

## Distillation Rules

- Codify only durable, repo-relevant, stack-compatible rules.
- Keep task-specialized instructions skill-local unless they become cross-cutting policy.
- Prefer small non-overlapping skill baselines per domain instead of parallel overlapping skill stacks.
- Keep specialist skills explicit in `docs/agents/README.md` or `.agents/skills/`; do not retain implicit overlap by habit.
- If a skill contains durable product, domain, or architecture truth, distill that truth into `docs/PRD.md`, `CONTEXT.md`, `CONTEXT-MAP.md`, or an ADR, then keep the skill focused on workflow.
- If skill guidance conflicts with `AGENTS.md`, `CONTEXT.md`, `CONTEXT-MAP.md`, `docs/PRD.md`, or ADRs, those canonical docs win.
- Skill-local choreography must not override repo editing rules, architecture posture, verification expectations, permission checks, financial correctness rules, or git hygiene.

## Dawn Stack Filter

Apply stack-fit filtering before importing skill content from another repo.

Dawn's current target stack is:

- React, Vite, TanStack Router, TanStack Query, and eventually TanStack DB/TanStack AI.
- Hono, oRPC, Better Auth, Drizzle, and Postgres.
- Cloudflare Workers, Durable Objects, Queues, Workflows, R2, KV, Hyperdrive, and Alchemy.
- Electrobun for the desktop shell.

Do not import Next.js, Supabase, BullMQ, Tauri, Node-only worker, or Midday-specific patterns as defaults unless the user explicitly asks for that surface or a Dawn ADR accepts the decision.

## When To Add A Repo-Owned Skill

Add or revise a repo-owned skill when at least one condition is true:

- The same workflow has repeated enough that agents keep rediscovering the steps.
- The workflow has Dawn-specific routing, file ownership, commands, or verification checks.
- The work touches high-risk areas such as financial state, permissions, sync, jobs, AI tools, provider adapters, or deploy infrastructure.
- A general-purpose skill needs a short Dawn wrapper to point at local source-of-truth docs and commands.

## Where Skills Live

- Repo-owned skills live under `.agents/skills/<name>/SKILL.md`.
- General agent workflow guidance lives under `docs/agents/`.
- Durable architecture decisions live under `docs/adr/`; do not use ADRs for process-only skill guidance.
- If the repo later adds a first-class agent-system package, update this file and `docs/agents/README.md` before moving skill ownership.

## Skill Authoring Checklist

Before adding or changing a skill:

1. Confirm the skill does not duplicate an existing useful skill listed in `docs/agents/README.md`.
2. Link to canonical Dawn docs instead of copying long product or architecture sections.
3. State clear trigger conditions so agents know when to use the skill.
4. Keep the workflow short enough to read before task work starts.
5. Include only commands that are valid for this repo.
6. Define verification expectations for the risk level of the work.
7. Re-check the stack filter before keeping external repo instructions.
