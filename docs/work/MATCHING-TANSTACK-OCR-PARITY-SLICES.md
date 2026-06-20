# Matching OCR Parity With TanStack AI

## Outcome

Dawn should reach Midday-level receipt and invoice extraction before matching:

- PDF, image, email-body, and email-attachment receipts produce structured extraction fields.
- Extraction uses TanStack AI instead of the Vercel AI SDK.
- Extraction quality, confidence, provider attempts, and failure states are persisted.
- Matching only runs after usable financial-document extraction.
- Dawn keeps its application/domain architecture: domain matching stays pure; OCR lives behind app/server/provider ports.

The current Dawn extraction path is not parity yet. The existing deterministic text and readable-PDF extraction path is useful as a seam and fallback, but full parity requires provider-grade OCR and structured extraction.

## Slice Strategy

Start with a thin real workflow: one stored receipt attachment goes through a document-intelligence provider contract, persists normalized fields, and triggers matching. Then deepen toward Midday parity with TanStack AI provider cascade, MIME preprocessing, quality passes, attempt persistence, review UX, and evals.

Avoid horizontal-only slices such as "install dependencies" or "add tests" unless they produce standalone behavior. Each slice below should leave the product more usable or safer by itself.

## Ordered Slices

### 1. TanStack AI Extraction Tracer

## Goal

One stored receipt attachment extracts through a new document-intelligence port and still reaches Dawn's existing match pipeline.

## Scope

Replace the current runtime shape of `DocumentExtractionTextStorage -> deterministic parser` with a binary-aware `DocumentIntelligenceProvider` contract. Keep the deterministic text parser as a fallback implementation for body-only emails and tests.

Inspect:

- `packages/app/src/documents-inbox.ts`
- `apps/server/src/document-extraction.ts`
- `packages/app/src/inbox-extraction.test.ts`
- `apps/server/src/document-extraction.test.ts`
- `packages/jobs/src/index.ts`

## Acceptance Criteria

- [x] App use case accepts stored document bytes and metadata, not only raw text.
- [x] Extraction result persists normalized fields, confidence, source, and raw text or summary.
- [x] Successful receipt extraction emits `document.extracted`.
- [x] Successful financial-document extraction queues matching.
- [x] Failed extraction marks the inbox item failed and does not queue matching.
- [x] Text-like email body receipts still work through the deterministic fallback.

## Verification

- `bun test packages/app/src/inbox-extraction.test.ts`
- `bun test apps/server/src/document-extraction.test.ts`
- `bun test packages/jobs/src/index.test.ts`

## Dependencies

None.

### 2. Provider-Grade TanStack Engine

## Goal

Implement Midday-style structured extraction using TanStack AI.

## Scope

Add a provider-backed extraction module under `packages/documents`. Define Zod schemas for receipt and invoice extraction, use TanStack AI structured output, and support multimodal image/document inputs.

Prefer these provider shapes:

- Gemini adapter for image/PDF-capable fallback.
- OpenRouter or OpenAI-compatible adapter for Mistral-class document extraction.
- A local deterministic fallback for text bodies and development without provider keys.

Inspect:

- `packages/documents/src/index.ts`
- `packages/documents/package.json`
- `packages/env/src/server.ts`
- `apps/server/package.json`
- `ref/midday/packages/documents/src/processors/base-extraction-engine.ts`
- `ref/midday/packages/documents/src/config/extraction-config.ts`

## Acceptance Criteria

- [x] Receipt schema returns document type, merchant/store name, total, currency, date, tax, website, and language where available.
- [x] Invoice schema returns document type, vendor/customer, invoice number, issue date, due date, total, currency, tax, website, and language where available.
- [x] Provider config supports primary, secondary, and tertiary model cascade.
- [x] Provider/model/timeouts are returned in metadata.
- [x] No `ai` / Vercel AI SDK dependency is introduced.
- [x] Provider adapters are not imported from `packages/domain`.

## Verification

- Provider unit tests with mocked TanStack AI calls.
- `bun run --filter @dawn/documents check-types`
- `bun run --filter server check-types`

## Dependencies

Slice 1.

### 3. Binary Preprocessing And PDF Fallback

## Goal

Make real Gmail and upload attachments usable before OCR.

## Scope

Add MIME-aware preprocessing: text/email fast path, image path, PDF document path, HEIC conversion boundary, size/page limits, signed URL versus inline bytes decision, and readable-PDF fallback using a real PDF text extractor rather than ad hoc PDF token regex.

Inspect:

- `apps/server/src/document-extraction.ts`
- `apps/server/src/document-storage.ts`
- `packages/app/src/email-inbox.ts`
- `ref/midday/apps/worker/src/processors/inbox/process-attachment.ts`
- `ref/midday/packages/documents/src/utils/pdf-text-extract.ts`

## Acceptance Criteria

- [x] Text and email bodies use the cheap deterministic path.
- [x] JPEG/PNG/WebP images go to a vision-capable TanStack content input.
- [x] PDFs go to document-capable provider input where supported.
- [x] Readable PDF text extraction works as fallback.
- [x] HEIC conversion has an explicit adapter boundary.
- [x] Unsupported or oversized files fail cleanly with a reviewable inbox state.

## Verification

- Fixture tests for body-only email, PNG/JPEG receipt, readable PDF, and scanned/image PDF through mocked OCR.
- Regression test proving unsupported binary attachments do not create match suggestions.

## Dependencies

Slice 2.

### 4. Quality, Re-Extraction, And Validation

## Goal

Match Midday's extraction maturity instead of trusting one model pass.

## Scope

Add quality scoring, critical-field checks, field-specific re-extraction prompts, consistency validation, and deterministic normalization.

Critical fields:

- Receipt: total, currency, merchant/store name, date.
- Invoice: total, currency, vendor name, invoice date, due date when present, invoice number when present.

Inspect:

- `packages/app/src/documents-inbox.ts`
- `packages/domain/src/inbox-matching.ts`
- `ref/midday/packages/documents/src/processors/receipt/receipt-processor.ts`
- `ref/midday/packages/documents/src/processors/invoice/invoice-processor.ts`

## Acceptance Criteria

- [x] Low-quality extraction is not allowed to auto-trigger confident matching.
- [x] Missing critical fields can trigger one targeted repair pass.
- [x] Tax, total, date, currency, and document type are validated before persistence.
- [x] Non-financial documents are classified as `other` and skipped by matching.
- [x] Confidence is field-level and overall.

## Verification

- Golden extraction tests for clean receipt, missing currency, bad date, invoice with due date, non-financial PDF, and ambiguous totals.

## Dependencies

Slices 2 and 3.

### 5. Attempt Persistence And Observability

## Goal

Make OCR behavior debuggable and auditable.

## Scope

Extend persistence to track extraction attempts separately from the latest accepted extraction: provider, model, attempt number, duration, quality score, error class, raw text presence, and redacted provider metadata.

Inspect:

- `packages/db/src/schema/core.ts`
- `packages/db/src/dawn-repository.ts`
- `packages/app/src/documents-inbox.ts`
- `packages/app/src/inbox-extraction.test.ts`

## Acceptance Criteria

- [x] Multiple attempts can be inspected without losing the final extraction.
- [x] Failed provider cascade leaves actionable error metadata.
- [x] Audit and outbox payloads include extraction source and quality summary.
- [x] Sensitive raw provider payloads are not stored by default.
- [x] Existing extraction history remains readable after migration.

## Verification

- Migration check.
- Repository tests for success, failure, and multi-attempt extraction.
- App tests for redacted metadata and latest-extraction mapping.

## Dependencies

Slice 2.

### 6. Matching Gate And Batch Parity

## Goal

Only match extracted financial documents, and do it in one coordinated batch pass.

## Scope

Wire extraction success to the bidirectional batch matcher. Skip failed, low-quality, or non-financial extractions. Ensure batch matching claims inbox IDs and transaction IDs during one run to avoid duplicate or conflicting suggestions.

Inspect:

- `packages/app/src/documents-inbox.ts`
- `packages/jobs/src/index.ts`
- `packages/db/src/dawn-repository.ts`
- `packages/app/src/inbox-matching.test.ts`
- `ref/midday/packages/jobs/src/tasks/inbox/match-transactions-bidirectional.ts`

## Acceptance Criteria

- [x] Successful receipt/invoice extraction triggers bidirectional matching.
- [x] Failed extraction does not create suggestions.
- [x] Non-financial extraction does not create suggestions.
- [x] Low-quality extraction creates a review task, not confident suggestions.
- [x] Competing same-amount receipts and transactions produce non-conflicting suggestions.
- [x] Auto-match is disabled unless extraction quality and match policy both pass.

## Verification

- App/job tests with two receipts and two transactions.
- Failed extraction test.
- Non-financial document test.
- Low-quality OCR test.

## Dependencies

Slices 1 and 4.

### 7. Review UX For OCR Confidence

## Goal

Expose OCR uncertainty where humans need to act.

## Scope

Update inbox/review UI to show extraction status, provider failure, field confidence, correction flow, retry action, and match readiness. Keep matching accept/reject separate from extraction correction.

Inspect:

- `apps/web/src/routes`
- `apps/web/src/components`
- `packages/api/src/routers/index.ts`
- `packages/app/src/documents-inbox.ts`

## Acceptance Criteria

- [x] User can distinguish `needs extraction review` from `ready to match`.
- [x] User can correct amount, date, merchant/vendor, and currency.
- [x] Correction creates a new extraction version and reruns matching.
- [x] Failed OCR has a retry action when provider config exists.
- [x] Low-confidence fields are visible without exposing noisy model internals.

## Verification

- Focused component tests.
- Authenticated browser smoke for upload/sync, failed OCR, correction, and match suggestion.

## Dependencies

Slices 4, 5, and 6.

### 8. OCR Evaluation Dataset

## Goal

Prevent regression and measure parity honestly.

## Scope

Add eval fixtures covering representative receipt and invoice shapes, including Gmail bodies and binary attachments. Report extraction accuracy and downstream matching impact.

Fixture set:

- Body-only receipt email.
- Clear image receipt.
- Scanned PDF receipt.
- Readable PDF receipt.
- Invoice with due date and invoice number.
- Non-financial PDF.
- Receipt with multiple totals.
- Foreign-currency receipt.
- Tax-heavy receipt.

Inspect:

- `packages/documents/src/evals.ts`
- `packages/documents/src/evals.cli.ts`
- `packages/domain/src/golden-datasets.test.ts`

## Acceptance Criteria

- [x] Eval reports critical-field recall.
- [x] Eval reports false financial-document classification.
- [x] Eval reports field-level accuracy for amount, currency, date, merchant/vendor, and invoice number.
- [x] Eval reports downstream matching impact.
- [x] Deterministic/mock evals run without provider keys.
- [x] Provider evals run only when provider keys are configured.

## Verification

- `bun run eval:documents`
- Provider-gated eval command with TanStack AI keys configured.

## Dependencies

Slices 2 through 6.

## Cross-Cutting Design Decisions

- Keep OCR out of `packages/domain`.
- Keep extraction orchestration in `packages/app`.
- Keep document extraction provider adapters in `packages/documents`; `apps/server` should only adapt runtime storage/configuration.
- Use TanStack AI structured outputs, multimodal content, and provider adapters.
- Preserve the deterministic extractor only as a fallback and test fixture.
- Do not match on garbage extraction.
- Treat scanned/image receipt OCR as required for parity, not a future nice-to-have.

## Suggested First Slice

Start with Slice 1. It creates the correct architecture boundary and proves the end-to-end product behavior without waiting on provider keys. Slice 2 can then add real TanStack AI provider extraction behind the contract without forcing matching, jobs, or domain code to know about provider details.
