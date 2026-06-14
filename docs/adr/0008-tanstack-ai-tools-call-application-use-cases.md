# 0008: TanStack AI Tools Call Application Use Cases

Status: Accepted
Date: 2026-06-14

## Context

AI will search, explain, draft, classify, match, and propose actions. It may also trigger mutations. AI-originated actions need the same permission checks, auditability, and approval rules as human actions.

## Decision

TanStack AI is the primary assistant UX/runtime direction. AI tools must be typed wrappers around application use cases or application queries. Each tool declares input schema, output schema, required permission, tenant scope, risk level, approval behavior, audit behavior, and rate limit policy.

Risk levels are `read`, `suggest`, `draft`, `mutate`, and `external_side_effect`. Mutations and external side effects require traceable actor context. External side effects require explicit approval unless a user-configured automation permits them.

## Consequences

- AI cannot bypass permissions by querying provider adapters or the database directly.
- Tool calls can be audited and replayed through the same business contracts as UI/API actions.
- Prompt and retrieval work must preserve team scoping and redaction.
- Evaluation datasets should target tool selection, refusal behavior, and mutation safety.

## Alternatives Considered

- Free-form agent with database/tools access: powerful but unsafe and hard to audit.
- AI only as chat text: safe but misses product value in workflows and drafts.
- Separate AI-specific business logic: creates drift from web/API behavior.
