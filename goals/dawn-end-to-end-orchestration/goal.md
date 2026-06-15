# Dawn Architecture Verticalization

Implement the architecture remediation plan in `docs/work/ARCHITECTURE-VERTICAL-SLICES.md`.

Use this goal file together with `docs/goal.md`. Treat `docs/work/ARCHITECTURE-VERTICAL-SLICES.md` as the active execution backlog, with `docs/work/VERTICAL-SLICES.md`, `docs/work/IMPLEMENTATION-PRD.md`, `docs/PRD.md`, `CONTEXT.md`, and `CONTEXT-MAP.md` as supporting context.

The first seven slices must stay first:

1. Move data export completion into app.
2. Finish data workflow mutation locality.
3. Deepen the outbox and job runner.
4. Deepen Actor and Team intake.
5. Narrow the persistence seam.
6. Add the public API operation contract tracer.
7. Add the sync collection authorization contract.

After those, continue through the remaining architecture slices: app module extraction, domain module extraction, Drizzle repository locality, public API contract migration and breadth, dedicated worker runtime, sync expansion, dashboard decomposition, and verification closure.

Keep the Dawn architecture invariant intact: business rules live in `packages/domain` and `packages/app`; transports, workers, provider adapters, sync, AI tools, and UI call app use cases; Postgres remains authoritative; audit, idempotency, permission checks, and outbox events guard sensitive mutations.

Use `ref/midday` only as read-only reference material. Copy useful product packaging and operational maturity, not Midday's direct router-to-query business flow.

Done means every slice in `docs/work/ARCHITECTURE-VERTICAL-SLICES.md` is implemented or explicitly blocked by concrete external prerequisites, relevant verification passes, docs/ADRs match the delivered architecture, and implementation status is tracked under `docs/work`.
