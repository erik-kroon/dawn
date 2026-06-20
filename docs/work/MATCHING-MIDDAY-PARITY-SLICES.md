# Matching Midday Parity Vertical Slices

Triage: ready-for-agent
Publication: Local repo artifact. No project issue tracker or remote is assumed.
Status: in progress
Date: 2026-06-16
Source material: Dawn matching implementation, Dawn email inbox implementation, and Midday reference code under `ref/midday`.

## Outcome

When all slices are done, Dawn should match Midday's production behavior for receipt-to-bank matching while keeping Dawn's cleaner application/domain architecture:

- Bank transactions and inbox receipts can be matched in one coordinated pass without duplicate or conflicting suggestions.
- Binary PDF receipts and email attachments produce usable extracted fields before matching runs.
- Team-specific calibration improves suggestions over time using accepted, rejected, and unmatched history.
- Reviewers can understand, accept, reject, retry, and recover matches without inspecting logs.
- Gmail and other email inbox providers can rely on the same proven extraction and matching path.

## Source Findings

These slices explicitly cover the current comparison findings:

- P2: Dawn lacks Midday's single batch arbitration pass. Midday claims inbox IDs and transaction IDs during one bidirectional worker run. Dawn has both directions, but they currently run as separate outbox jobs.
- P2: Dawn extraction is still the main gap. Midday processes and classifies attachment data before matching. Dawn currently decodes stored objects as UTF-8 and uses a deterministic regex extractor.
- P2/P3: Midday's calibration is more mature. Midday uses recent team feedback, threshold optimization, cached pair history, decline penalties, and merchant patterns. Dawn has cleaner domain calibration and hard negatives, but it is simpler.

## Slice Strategy

Start with a thin manual matching tracer because it proves the existing loop before adding more automation. Then deepen the three high-risk areas: extraction, batch arbitration, and calibration. Finish by hardening lifecycle recovery, exposing reviewer evidence, and using Gmail only as a readiness gate over the same path.

Avoid horizontal slices such as "backend", "frontend", "tests", or "cleanup" unless the slice produces standalone observable value. Each slice below should leave the product in a better state even if later slices are delayed.

## Progress

- 2026-06-16: Slice 1 automated tracer implemented in `packages/api/src/router.test.ts`. The test covers signed upload preparation, upload completion into an inbox item, deterministic extraction, route-level suggestion generation, accept, accepted-match rejection, attachment removal, inbox reset to review, and re-suggesting a still-valid competing candidate. Focused verification passed with `bun test packages/app/src/inbox-matching.test.ts packages/api/src/router.test.ts`.
- 2026-06-16: Slice 3 batch arbitration implemented. `matchBidirectionalBatch` coordinates transaction and inbox candidates in one use case with claimed inbox and transaction sets. Outbox routing now queues `inbox.match_bidirectional_batch` for transaction creation/import, bank sync, extracted documents, and corrected extractions while retaining the single-direction retry commands. Focused verification passed with `bun test packages/app/src/inbox-matching.test.ts packages/jobs/src/index.test.ts packages/app/src/outbox-dispatch.test.ts apps/server/src/worker-runtime.test.ts`.
- 2026-06-16: Slice 2 extraction boundary implemented. Stored document extraction now goes through a server-side text extraction adapter with fast text handling, readable-PDF text extraction, unsupported-binary failure, and app-level failed-state marking. This is not full scanned-image OCR yet, but the OCR/provider seam is isolated. Focused verification passed with `bun test packages/app/src/email-inbox.test.ts packages/jobs/src/index.test.ts apps/server/src/document-extraction.test.ts packages/app/src/inbox-extraction.test.ts`.
- 2026-06-16: Slice 5 lifecycle hardening completed. Accept/reject idempotency replay and conflicting replay are now explicitly covered, accepted-match rejection removes attachments and restores review state, hard negatives block regeneration, expired suggestions revive only through current candidates, and repository list hydration excludes expired suggestions. Focused verification passed with `bun test packages/app/src/inbox-matching.test.ts`.
- 2026-06-16: Slice 4 calibration deepened. Domain match memory now accepts unmatched outcomes as conservative negative calibration input, evidence records unmatched penalty weight, thresholds include unmatched counts, and auto-match rejects material unmatched history even with positive evidence. Persisted product feedback still comes from accepted/rejected suggestion rows until a product event exists for explicit unmatched outcomes. Focused verification passed with `bun test packages/domain/src/matching-evaluation.test.ts packages/domain/src/matching.test.ts packages/app/src/inbox-matching.test.ts`.
- Browser/manual verification for Slice 1 remains pending because no local authenticated session was exercised during this pass.

## Ordered Slices

### 1. Manual Matching Tracer

## Goal

Prove one uploaded receipt can extract, suggest, accept, reject, and re-suggest correctly through Dawn's existing user-visible flow.

## Scope

- `packages/app/src/documents-inbox.ts`
- `packages/db/src/dawn-repository.ts`
- `packages/domain/src/inbox-matching.ts`
- `packages/api/src/routers/index.ts`
- `apps/web/src/routes/_auth/inbox.tsx`

## Acceptance Criteria

- [x] A seeded or fixture receipt creates an inbox item with extracted merchant, date, total, and currency.
- [x] A seeded or fixture transaction appears as a visible match suggestion.
- [x] Accepting a suggestion attaches the document to the transaction and resolves the inbox item.
- [x] Rejecting an accepted match removes the attachment and returns the inbox item to review.
- [x] A still-valid competing suggestion can be re-suggested after the accepted match is rejected.
- [x] Existing expired-suggestion revival behavior remains covered by tests.

## Verification

- `bun test packages/app/src/inbox-matching.test.ts packages/api/src/router.test.ts`
- Manual browser pass on `/inbox` with seeded data if a local authenticated session is available.

## Dependencies

None.

### 2. Provider-Grade Text Extraction Path

## Goal

Make binary PDF and email attachment receipts produce usable extracted fields instead of relying on UTF-8 byte decoding and regex extraction.

## Scope

- `apps/server/src/document-extraction.ts`
- `packages/app/src/documents-inbox.ts`
- `packages/app/src/email-inbox.ts`
- `packages/integrations/src/email-inbox.ts`
- Document object storage adapters and tests.

## Acceptance Criteria

- [x] A PDF receipt fixture extracts merchant, date, total, currency, and document type.
- [x] Text-like email body receipts continue to use the fast deterministic path.
- [x] Binary attachments use a real text extraction/OCR provider path or a clearly isolated provider adapter.
- [x] Extraction failure leaves the inbox item reviewable with a clear failed extraction state.
- [x] Successful extraction emits `document.extracted`.
- [x] `document.extracted` queues `inbox.match_bidirectional_batch`.

## Verification

- `bun test apps/server/src/document-extraction.test.ts packages/app/src/inbox-extraction.test.ts`
- Add one PDF fixture test and one failed extraction test.
- `bun run check-types`

## Dependencies

Slice 1.

### 3. Bidirectional Batch Arbitration

## Goal

Close the gap with Midday's single bidirectional worker by coordinating inbox and transaction claims during batch imports and bank sync.

## Scope

- `packages/app/src/documents-inbox.ts`
- `packages/jobs/src/index.ts`
- `apps/server/src/worker-runtime.ts`
- `packages/db/src/dawn-repository.ts`
- Midday reference: `ref/midday/apps/worker/src/processors/inbox/match-transactions-bidirectional.ts`

## Acceptance Criteria

- [x] A batch matching use case can process newly arrived transactions and pending inbox items together.
- [x] The run keeps an in-memory claimed inbox ID set.
- [x] The run keeps an in-memory claimed transaction ID set.
- [x] One transaction is not suggested for multiple inbox items in the same run.
- [x] One inbox item is not suggested for multiple accepted-equivalent candidates in the same run.
- [x] Job routing can call the batch use case for transaction imports, bank syncs, and extracted inbox items where appropriate.
- [x] Existing single-inbox and single-transaction matching commands remain available for manual retry and narrow jobs.

## Verification

- Add app tests with two same-amount receipts and two same-amount transactions.
- Add a job mapping test for the batch command if a new queue message type is introduced.
- `bun test packages/app/src/inbox-matching.test.ts packages/jobs/src/index.test.ts packages/app/src/outbox-dispatch.test.ts apps/server/src/worker-runtime.test.ts`

## Dependencies

Slice 1.

### 4. Team Calibration And Learning

## Goal

Bring Dawn's matching calibration closer to Midday's maturity without moving business policy into database query code.

## Scope

- `packages/domain/src/inbox-matching.ts`
- `packages/domain/src/matching-evaluation.ts`
- `packages/domain/src/__fixtures__/golden-datasets.ts`
- `packages/app/src/documents-inbox.ts`
- `packages/db/src/dawn-repository.ts`
- Midday reference: `ref/midday/packages/db/src/queries/transaction-matching.ts`

## Acceptance Criteria

- [x] Team match memory includes recent accepted, rejected, and unmatched outcomes.
- [x] Suggested and auto-match thresholds adapt from team history with conservative bounds.
- [x] Repeated confirmed merchant/counterparty pairs can boost confidence.
- [x] Recent rejected or unmatched pairs penalize confidence.
- [x] Confirmations can outweigh older negative history only when recent positive evidence is stronger.
- [x] Auto-match requires repeated positive history, weak negative history, and enough score gap from alternatives.
- [x] Suggestion evidence stores calibration inputs, posture, and thresholds.

## Verification

- Domain tests for threshold posture, repeated positive history, and decline penalty.
- App tests proving repeated accepted pairs improve ranking.
- App tests proving recent rejected pairs suppress or block auto-match.
- Golden dataset checks still pass.

## Dependencies

Slice 1. Slice 3 is preferred before enabling auto-match changes broadly.

### 5. Match Lifecycle Hardening

## Goal

Make accept, reject, unmatch, alias learning, hard negatives, expiration, and revival behave as one explicit state machine.

## Scope

- `packages/app/src/documents-inbox.ts`
- `packages/db/src/dawn-repository.ts`
- `packages/domain/src/inbox-matching.ts`
- Transaction attachment and accountant-status lifecycle code.

## Acceptance Criteria

- [x] Rejected pairs never auto-match.
- [x] Accepted then rejected pairs remove the attachment and reset the inbox item to review.
- [x] Competing expired suggestions revive when they are still valid candidates.
- [x] Alias and feedback updates affect future scores without overriding hard negatives.
- [x] Rejecting an accepted match updates transaction accountant status.
- [x] Accept/reject commands are idempotent by key and reject conflicting replay payloads.
- [x] Suggestion list APIs do not return expired rows as currently actionable candidates.

## Verification

- Focused lifecycle tests in `packages/app/src/inbox-matching.test.ts`.
- Repository integration coverage if a lifecycle rule depends on Drizzle SQL behavior.
- `bun test packages/app/src/inbox-matching.test.ts packages/db/src/dawn-repository.pglite.test.ts`

## Dependencies

Slice 1. Slice 4 is preferred for learning-related assertions.

### 6. Review UX Parity

## Goal

Make the reviewer see enough evidence to trust, reject, or retry a suggested match without reading logs or database rows.

## Scope

- `apps/web/src/routes/_auth/inbox.tsx`
- `packages/api/src/routers/index.ts`
- `packages/app/src/documents-inbox.ts`
- Shared UI components only where reuse is clearly needed.

## Acceptance Criteria

- [ ] Inbox detail shows the best suggestion with amount, date, counterparty, score, and confidence.
- [ ] Reviewer can inspect the signal reasons that produced the suggestion.
- [ ] Accept and reject update the inbox list and detail pane without a full page reload.
- [ ] Failed extraction, no extraction, no suggestion, suggested, accepted, rejected, and resolved states are visually distinct.
- [ ] Retry matching is available for extracted unresolved items.
- [ ] UI does not encode matching rules; it only renders app/API state.

## Verification

- Router tests for any new or changed procedures.
- Focused component smoke where the app test stack supports it.
- Manual browser pass on `/inbox` with seeded suggested, failed, and resolved items.

## Dependencies

Slices 1 and 5.

### 7. Gmail Readiness Gate

## Goal

Validate that Gmail-imported evidence uses the same extraction, matching, lifecycle, and review path rather than needing Gmail-specific matching behavior.

## Scope

- `packages/app/src/email-inbox.ts`
- `packages/integrations/src/email-inbox.ts`
- `apps/server/src/worker-runtime.ts`
- `apps/web/src/routes/_auth/inbox.tsx`
- `packages/jobs/src/index.ts`

## Acceptance Criteria

- [ ] Gmail or mock email import creates documents and inbox items.
- [ ] Body-only receipt evidence extracts and matches automatically.
- [ ] PDF attachment evidence extracts through the provider-grade path from Slice 2.
- [ ] Duplicate email evidence is skipped by provider-object dedupe.
- [ ] Sync errors mark the connection actionable.
- [ ] Imported email evidence can be accepted, rejected, and retried through the normal inbox review UI.
- [ ] No Gmail-specific matching rules are added outside provider ingestion.

## Verification

- `bun test packages/app/src/email-inbox.test.ts packages/integrations/src/email-inbox.test.ts`
- `bun test packages/jobs/src/index.test.ts apps/server/src/worker-runtime.test.ts`
- Manual browser pass on `/inbox` with a mock email provider sync if local auth is available.

## Dependencies

Slices 2, 3, 5, and 6.

## Dependencies

- Slice 1 is the tracer and should be done first.
- Slice 2 can run in parallel with Slice 3 after Slice 1 is stable.
- Slice 4 can start after Slice 1, but should not loosen auto-match behavior until Slice 3 exists.
- Slice 5 depends on the lifecycle states exercised by Slice 1 and benefits from Slice 4.
- Slice 6 depends on user-visible state from Slice 5.
- Slice 7 should wait for extraction, arbitration, lifecycle, and review behavior to be proven.

## Suggested First Slice

Start with Slice 1, Manual Matching Tracer.

It is the smallest end-to-end proof that matters: one receipt, one transaction, one suggestion, accept, reject, and re-suggest. It validates the current implementation before adding provider extraction, batch arbitration, calibration, or Gmail-specific pressure.
