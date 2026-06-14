# 0003: Cloudflare-First Runtime Boundaries

Status: Accepted
Date: 2026-06-14

## Context

The target architecture should benefit from Cloudflare Workers, Queues, Workflows, Durable Objects, R2, KV, and Hyperdrive without forcing every workload into the edge runtime. Some future jobs may require heavy SDKs, memory, CPU, long execution windows, or regional database affinity.

## Decision

Dawn is Cloudflare-first, not Cloudflare-only. Request handling, realtime coordination, lightweight jobs, scheduled triggers, object storage, and workflow orchestration should prefer Cloudflare primitives when they fit. Heavy or incompatible work may run in a regional Bun/Node worker pool behind the same application/job contracts.

Runtime-specific code belongs at infrastructure, worker, adapter, or transport edges. Business use cases and domain rules must remain runtime-portable TypeScript.

## Consequences

- Application and domain packages should avoid direct dependencies on Worker-only globals, Node-only APIs, or provider SDKs.
- Job contracts should allow Cloudflare Queue, Workflow, Trigger.dev, or regional worker implementations.
- Infrastructure decisions can evolve without rewriting business behavior.
- Engineers must check runtime compatibility before importing libraries into Worker-bound entrypoints.

## Alternatives Considered

- Cloudflare-only: simpler deployment story but too restrictive for document processing, provider SDKs, exports, and heavy AI workflows.
- Regional Node/Bun-first: broader library support but gives up Cloudflare's coordination, latency, and platform fit.
- Per-feature runtime choices without boundaries: flexible but likely to fragment behavior and observability.
