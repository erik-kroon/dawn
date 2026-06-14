# 0009: Provider Adapters Are Isolated Behind Ports

Status: Accepted
Date: 2026-06-14

## Context

Dawn will integrate with banking, accounting, payments, email, storage, OCR/document AI, messaging, and AI providers. Provider payloads, auth models, failure modes, webhooks, and SDK compatibility vary widely.

## Decision

Provider implementations live behind stable adapter ports. Application use cases depend on canonical ports and product models, not provider SDKs or raw payload shapes. Adapters normalize provider data into canonical commands/events and preserve raw payloads enough for debugging, reconciliation, idempotency, and audit.

Webhook handlers verify signatures and store provider event records before invoking mutable application work.

## Consequences

- Adding or swapping providers should not rewrite domain rules or UI workflows.
- Provider-specific error handling and retry classification stay near adapters.
- Raw payload retention and canonical mapping must be considered together.
- Worker/runtime compatibility is handled at adapter/job edges, not inside domain code.

## Alternatives Considered

- Import provider SDKs directly in use cases: fast but couples business behavior to provider details.
- Normalize only in database queries: hides provider semantics in persistence and complicates retries/webhooks.
- Store only raw payloads: preserves data but leaves product behavior without canonical records.
