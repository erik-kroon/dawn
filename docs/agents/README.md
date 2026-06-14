# Agent Workflow

This folder records repo-local guidance for AI agents. Keep it short and durable.

## Default Orientation

1. Read `AGENTS.md`.
2. Read `CONTEXT.md` for domain language.
3. Read `CONTEXT-MAP.md` to find the right files.
4. Read `docs/PRD.md` for end-state product and architecture requirements.
5. Check `docs/adr/` before making architecture decisions.

## Useful Skills

- `repo-context-bootstrap`: repair or extend repo-local context docs.
- `context-map`: map unfamiliar code or product areas before changing them.
- `product-brief`: turn product intent into durable PRD/spec material.
- `docs-sync`: keep README, context docs, ADRs, and plans synchronized after substantial decisions.
- `shape-contract`: define scope, requirements, risks, and verification level before broad implementation.
- `signal-cut`: reduce broad product work into the smallest valuable delivery slice.
- `verticalize-work`: turn the PRD or plan into independently executable implementation slices.
- `contract-review`: review code boundaries, trust, permissions, and state transitions.
- `proof-repair`: fix broken behavior with evidence, root cause, patch, and verification.
- `improve-codebase-architecture`: find deep architecture improvements once enough code exists.
- `cloudflare-deploy`: use for Cloudflare deploy or infrastructure work.
- `interface-craft`: use for serious UI/UX work.
- `test-first-delivery`: use for behavior-changing financial, permission, sync, job, or AI-tool changes.
- `.agents/skills/coss/SKILL.md`: use for new UI components, coss primitive/particle selection, and migrations from shadcn/Radix-style assumptions.

## Skill Development

Canonical posture for adding or changing repo-owned skills: `docs/agents/SKILL-DEVELOPMENT-POSTURE.md`.

Repo-owned skills should live under `.agents/skills/<name>/SKILL.md` unless a future first-class agent-system package is introduced. Skills should route agents to Dawn's source-of-truth docs instead of duplicating product, domain, or architecture policy.

## Work Tracking

No issue tracker or label convention is defined in this repo yet. Do not invent tracker labels or states unless the user asks.

For local planning, prefer short markdown checklists in the relevant plan/spec document. If a durable work queue becomes necessary, add a small convention here or in a dedicated docs file.

Current local planning artifacts:

- `docs/work/IMPLEMENTATION-PRD.md`: implementation-oriented PRD payload marked `ready-for-agent`.
- `docs/work/VERTICAL-SLICES.md`: independently executable vertical work slices.

## Review Priorities

When reviewing or implementing, prioritize:

- Tenant isolation.
- Permission enforcement.
- Financial correctness.
- Idempotency.
- Auditability.
- Outbox/job reliability.
- Provider webhook verification.
- TanStack DB consistency.
- AI tool approval and traceability.
- Cloudflare runtime fit.
