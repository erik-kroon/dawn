# 0010: Trigger.dev Is An Exception Behind Job Contracts

Status: Accepted
Date: 2026-06-14

## Context

Cloudflare Queues and Workflows are the preferred platform direction, but some workflows may need long-running execution visibility, third-party SDK support, manual replay, or operational affordances that Trigger.dev provides well.

## Decision

Use Cloudflare Queues for retryable jobs that fit Worker limits and Cloudflare Workflows for durable multi-step processes. Trigger.dev may be used only behind job contracts when runtime limits, long-running workflow visibility, provider SDK constraints, or operational needs justify the extra platform.

Business code must depend on job contracts and application use cases, not Trigger.dev-specific APIs.

## Consequences

- Trigger.dev adoption requires an explicit rationale and can be replaced by another runner.
- Job payload schemas, idempotency policy, retry policy, and observability metadata belong in shared contracts.
- The default answer for async work remains Cloudflare-native.

## Alternatives Considered

- Trigger.dev for all jobs: strong workflow visibility but adds another operational platform and cost early.
- Cloudflare-only forever: clean platform story but may block workloads with incompatible SDK or execution requirements.
- Ad hoc background tasks in route handlers: simple but unreliable and hard to observe.
