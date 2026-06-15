# Banking Vertical Work Plan

Used `verticalize-work`. I’d treat Dawn’s existing mock/sandbox banking path as the tracer base, especially [packages/app/src/banking-ledger.ts](/Users/erik/dawn/packages/app/src/banking-ledger.ts), [packages/integrations/src/index.ts](/Users/erik/dawn/packages/integrations/src/index.ts), [packages/jobs/src/index.ts](/Users/erik/dawn/packages/jobs/src/index.ts), and [packages/db/src/schema/core.ts](/Users/erik/dawn/packages/db/src/schema/core.ts).

**Outcome**
Dawn has provider-neutral EU banking that is at least Midday-parity: GoCardless and Enable Banking adapters, institution discovery with country/history/consent metadata, consent connection flow, idempotent account/balance/transaction sync, verified webhooks, preserved raw payloads, audit/outbox/job traceability, disconnect-with-history, and product UI that does not know provider-specific details.

**Slice Strategy**
Use vertical slices around observable banking workflows. Avoid “schema-only”, “adapter-only”, or “UI-only” tickets unless they ship standalone product value. Dawn should improve on Midday by keeping provider SDKs behind typed ports and routing all mutation paths through app use cases, audit, idempotency, and outbox.

## Commit Protocol

Banking work should commit as it goes. Do not wait until several slices have
accumulated in one dirty worktree.

After each verified slice, or after a coherent independently useful sub-slice:

1. Run the slice's focused verification and any impacted workspace checks.
2. Update the relevant implementation tracker with status, verification, blockers,
   and the next slice.
3. Inspect `git status --short` and the diff before staging.
4. Stage only files owned by the banking slice; do not stage unrelated UI,
   Gmail, matching, or user-owned worktree changes.
5. Commit the verified unit with a concise conventional message, for example
   `feat(banking): add provider connection registry` or
   `test(banking): add provider sync fixture coverage`.
6. If a live-provider proof is blocked, commit the local/testable foundation only
   when it is independently useful and record the live prerequisite explicitly.

Use a separate docs checkpoint commit when tracking/docs updates are substantial
or when separating them makes history easier to review.

Current banking source slices live in
[`docs/work/VERTICAL-SLICES.md`](./VERTICAL-SLICES.md), especially the banking
provider adapter and real-provider slices. Future banking-specific slices should
inherit this commit protocol.

**Ordered Slices**

1. **GoCardless institution-to-transaction tracer**  
   Goal: connect one EU bank through GoCardless and import transactions into the existing ledger path.  
   Scope: minimal institution picker, GoCardless adapter, consent callback, persisted connection metadata, queued sync, account + transaction import.  
   Acceptance: user selects an institution, completes consent, sees connection/accounts/imported transactions; repeat sync is idempotent.  
   Verification: adapter fixture tests, app use-case test, API router test, one UI smoke path.  
   Dependencies: GoCardless sandbox credentials and redirect URL.

2. **Provider-neutral institution catalog**  
   Goal: match/better Midday’s institution sync model.  
   Scope: `listInstitutions` provider port, institution table/cache, provider/countries/logo/sourceLogo/availableHistory/maximumConsentValidity/type/popularity, partial provider failure handling.  
   Acceptance: UI can search/filter EU institutions by country/provider/business-personal type; provider errors do not break the full catalog.  
   Verification: fixture tests for GoCardless + Enable Banking normalization, API tests for search/filter.

3. **Enable Banking parity adapter**  
   Goal: Enable Banking works through the same user flow and app use cases as GoCardless.  
   Scope: adapter methods for institution list, consent session, callback/exchange, accounts, balances, transactions, disconnect, webhook verification where supported.  
   Acceptance: no API/use-case/UI branching beyond provider capabilities; same sync result shape as GoCardless.  
   Verification: provider contract test suite reused for both EU providers.

4. **Consent lifecycle and reconnect**  
   Goal: make consent expiry visible and recoverable.  
   Scope: connection fields for consent expiry/status, refresh/reconnect use case, UI status/action, scheduled checks.  
   Acceptance: expired consent blocks sync with actionable state; reconnect preserves historical accounts/transactions.  
   Verification: tests for expired, expiring, refreshed, and disconnected states.

5. **Sync orchestration hardening**  
   Goal: make bank sync safe under retries, webhooks, manual clicks, and long initial imports.  
   Scope: DB/DO lock or lease, provider error classification, incremental cursor/date window, Cloudflare Queue for normal sync, Workflow for long initial history import if needed.  
   Acceptance: concurrent syncs collapse or reject cleanly; transient failures retry; failed sync runs record useful errors.  
   Verification: race/idempotency tests, job contract tests, failed-provider fixture tests.

6. **Account controls and reporting correctness**  
   Goal: imported accounts behave like product-owned ledger sources.  
   Scope: exclude-from-reports toggle, inactive account state, balance snapshots, currency checks, disconnect without deletion.  
   Acceptance: excluded accounts disappear from reports but records remain auditable; disconnect never deletes history by default.  
   Verification: report totals tests and disconnect/history tests.

7. **Provider webhooks and event lineage**  
   Goal: provider events are durable and traceable.  
   Scope: `provider_webhook_events`, verified GoCardless/Enable Banking webhook routes, duplicate-event idempotency, event-to-outbox-to-job trace in operations UI.  
   Acceptance: bad signatures rejected; duplicate events replay safely; valid events queue bank sync.  
   Verification: webhook signature tests, replay tests, operations workspace assertions.

8. **Transaction enrichment and reconciliation depth**  
   Goal: better-than-Midday ledger quality, not just raw import.  
   Scope: pending-to-booked reconciliation, counterparty/merchant normalization, transfer matching across bank accounts, document matching hooks, assistant-safe `start_bank_sync`.  
   Acceptance: duplicate pending/booked transactions do not double count; transfer candidates are suggested; document matching can cite provider metadata.  
   Verification: domain/app tests for reconciliation and transfer matching.

**Dependencies**
Provider credentials, legal consent copy, redirect/webhook URLs, Cloudflare queue/workflow bindings, encrypted token storage policy, coss UI usage for new product UI, and a decision on first launch country/provider order.

**Suggested First Slice**
Start with Slice 1: GoCardless institution-to-transaction tracer. It proves the full architecture under one real EU/open-banking provider before broadening to catalog depth and Enable Banking.
