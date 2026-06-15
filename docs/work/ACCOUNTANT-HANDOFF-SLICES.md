# Accountant Handoff Vertical Work Plan

Used `verticalize-work`.

Triage: ready-for-agent
Publication: Local repo artifact
Source material: Dawn vs Midday accountant workflow comparison, `docs/PRD.md`, `CONTEXT.md`, `CONTEXT-MAP.md`, and existing `docs/work/*-SLICES.md` plans
Reference product: `ref/midday` is read-only comparison material
Date: 2026-06-15

## Goal Thread Contract

This file is intended to be handed to a `/goal` Codex thread. The thread should run slice by slice until Dawn is up to par or better than Midday for the related accountant handoff topics.

The goal thread should:

- Treat this file as the execution tracker and update it as work completes.
- Complete slices in order unless a later slice can be safely advanced without conflicting schema, API, or UI ownership.
- Keep each slice vertical: domain/app rules, persistence, API/job wiring, UI, and verification should land together when needed for observable behavior.
- Commit after each verified slice or coherent sub-slice.
- Prefer local deterministic verification when live Gmail, email delivery, or Cloudflare credentials are unavailable, but clearly mark live-only checks as blocked with the exact missing prerequisite.
- Avoid changing `ref/midday`; use it only for behavioral comparison.
- Keep the final state aligned with `AGENTS.md`, `CONTEXT.md`, `CONTEXT-MAP.md`, `docs/PRD.md`, and the ADRs.

## Full Goal Definition Of Done

The full goal is done when all of these are true:

- [ ] A user can import a company bank CSV through a polished mapped preview flow.
- [ ] Imported transactions feed the review/export queue without duplicates.
- [ ] Gmail can be connected, synced, and used to create inbox/document evidence in the accountant workflow.
- [ ] Receipt matching works in both directions and exposes accept/reject review controls.
- [ ] Transactions have a clear accountant lifecycle from needs work to ready, exporting, exported, failed, excluded, or archived.
- [ ] A user can generate an accountant packet containing transaction CSV, manifest, and matched receipt/invoice files.
- [ ] The accountant packet can optionally include XLSX and can optionally be sent to an accountant email address, when email delivery is configured.
- [ ] Export status, history, retries, and package access are visible and audited.
- [ ] The accountant role can access handoff artifacts according to Dawn permissions without unsafe financial mutation rights.
- [x] The close-loop path is verified with representative fixture data from CSV import through export package.
- [x] `bun run check-types` passes.
- [x] Focused package/app/job tests for changed areas pass.
- [x] This file is updated with completed slice status, verification run, and any residual live-credential caveats.

Live Gmail OAuth and email delivery should not block completion of local product behavior if credentials are absent. In that case, the goal thread must leave the code configurable, add deterministic tests around provider boundaries, and mark only the live smoke checks as blocked.

## Progress Tracker

| Slice                                                   | Status      | Notes                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Accountant Packet Tracer                             | Completed   | Local tracer exports reviewed transactions to a ZIP with `transactions.csv`, `manifest.json`, optional resolved attachments, idempotency, audit, outbox, API, and transactions-page download wiring. Browser smoke reached `/login`; authenticated click smoke still needs a local test account/session.     |
| 2. Midday-Parity Transaction Lifecycle And Review Queue | Completed   | Added accountant lifecycle status, derived receipt/export readiness, DB persistence, audited/idempotent status transitions, sync invalidation, ready-only export semantics, and transactions-page queue filters/actions. Browser smoke still needs a local test account/session for authenticated UI clicks. |
| 3. CSV Import Wizard Parity Plus                        | Completed   | Added header auto-detection, mapped column selectors, sign inversion, richer preview metadata, duplicate visibility, synchronous commit, queued large-import sessions, R2-backed payload handoff, worker execution, payload cleanup, and operations-page queued feedback.                                    |
| 4. Gmail Connector Production Readiness                 | Local backend/runtime hardening completed | Gmail config health, scheduled/manual sync locking, skipped-count reporting, and deterministic provider-boundary tests landed. Live OAuth smoke remains blocked on Google credentials and a test mailbox.                                                                                                    |
| 5. Receipt Matching Parity Plus                         | Completed   | Bidirectional transaction/inbox suggestions, hard-negative feedback, expired suggestion revival, and focused domain/app/job tests landed. Browser smoke remains deferred while inbox/transactions UI files are under concurrent coss work.                                                                   |
| 6. Accountant Export Package Depth                      | Partial     | CSV/XLSX selection, delimiter choice, manifest hashes, attachments, queued packet storage, worker processing, signed download links, skipped attachment counts, exported-after-storage status, packet download token policy, accountant email-link delivery, and failed export telemetry landed. Visible export history UI and live email provider setup remain open. |
| 7. Accountant Access And Handoff Audit                  | Partial     | Accountant role can view/export ready packets without transaction categorization or other unsafe write permissions. Stored packet records, export history API, signed download/email success and failure audits, revocable packet links, and email-only handoff API exist; visible history UI remains open. |
| 8. Operational Hardening And Accountant Close Loop      | Partial     | Operations API now returns selected-period accountant close readiness from lifecycle states, job-run retry/dead-letter guidance with redacted actionable errors, and a deterministic CSV-to-export close-loop fixture covers duplicate-safe reruns. Operations UI and live Gmail close smoke remain open. |

## Outcome

Dawn reaches Midday parity or better for the accountant-relevant workflow:

- A company bank CSV can be imported through a polished, fault-tolerant flow with column mapping, duplicate handling, preview, background commit, audit, and import history.
- Gmail can be connected, synced manually and on schedule, and used to ingest attachment and body-only receipt evidence into the document inbox.
- Receipt matching is bidirectional enough to handle both flows: new transactions finding existing inbox items, and new inbox items finding existing transactions.
- A dedicated review queue shows transactions that need action, transactions ready for accountant export, and transactions already exported or excluded.
- The accountant export produces a useful package: transaction CSV, optional XLSX, receipt/invoice attachments, manifest, signed download link, and optional accountant email.
- All sensitive financial state changes stay behind Dawn's application use cases, with permissions, idempotency, audit, and outbox/job traceability.

Midday is the parity bar for the user-facing workflow. Dawn should be better where its architecture matters: provider-neutral ports, exact money handling, team/accountant permissions, Cloudflare-first jobs/storage, and stricter financial mutation boundaries.

## Slice Strategy

Start with one thin accountant packet tracer, then deepen the workflow around the five comparison areas: CSV import, Gmail/inbox, receipt matching, accountant export, and review queue.

Avoid horizontal slices like "build export backend", "make export UI", or "write matching tests". Each slice should produce a user-observable improvement and keep business rules out of route handlers, UI components, workers, and provider adapters.

The slices should inspect Midday for behavior, not copy its architecture. Relevant Midday reference areas:

- `ref/midday/apps/worker/src/processors/transactions/export.ts`
- `ref/midday/apps/dashboard/src/components/modals/export-transactions-modal.tsx`
- `ref/midday/apps/dashboard/src/components/tables/transactions/data-table.tsx`
- `ref/midday/apps/worker/src/processors/transactions/import-transactions.ts`
- `ref/midday/apps/dashboard/src/components/modals/import-modal/`
- `ref/midday/apps/api/src/rest/routers/apps/gmail/`
- `ref/midday/apps/worker/src/processors/inbox/match-transactions-bidirectional.ts`

Dawn areas likely involved:

- `packages/domain/src/transactions.ts`
- `packages/domain/src/csv-import.test.ts`
- `packages/domain/src/inbox-matching.ts`
- `packages/app/src/banking-ledger.ts`
- `packages/app/src/documents-inbox.ts`
- `packages/app/src/email-inbox.ts`
- `packages/app/src/integrations.ts`
- `packages/jobs/src/index.ts`
- `packages/db/src/schema/core.ts`
- `packages/api/src/routers/index.ts`
- `apps/server/src`
- `apps/web/src/routes/_auth/transactions.tsx`
- `apps/web/src/routes/_auth/operations.tsx`
- `apps/web/src/routes/_auth/inbox.tsx`

## Commit Protocol

Accountant handoff work should commit as it goes. Do not let CSV import, Gmail, matching, and export changes pile into one dirty worktree.

After each verified slice, or after a coherent independently useful sub-slice:

1. Run the slice's focused verification and any impacted workspace checks.
2. Update this tracker with status, verification, blockers, and the next slice.
3. Inspect `git status --short` and the diff before staging.
4. Stage only files owned by the slice; do not stage unrelated user-owned worktree changes.
5. Commit the verified unit with a concise conventional message, for example `feat(export): add accountant packet tracer`.
6. If live Gmail or email delivery is blocked by credentials, commit only the local/testable foundation and record the live prerequisite explicitly.

## Ordered Slices

### 1. Accountant Packet Tracer

## Goal

Turn the disabled transaction export affordance into a thin end-to-end accountant packet flow.

Status: Completed on 2026-06-15.

## Scope

- Add an application use case that exports reviewed transactions for a team and date range.
- Generate a CSV with accountant-useful fields: date, description, amount, currency, account, category, counterparty, tags, note, review state, document match state, and attachment names.
- Include a simple manifest JSON with export metadata, counts, filters, generated timestamp, and actor/team identifiers.
- Include matched document files when they are already available through Dawn's document storage abstraction.
- Expose a download action from the transactions page and keep permissions behind app use cases.
- Do not add email delivery, XLSX, or accounting-provider export in this tracer.

## Areas To Inspect

- `apps/web/src/routes/_auth/transactions.tsx`
- `packages/app/src/banking-ledger.ts`
- `packages/app/src/documents-inbox.ts`
- `packages/api/src/routers/index.ts`
- `packages/jobs/src/index.ts`
- `apps/server/src`
- Midday reference: `ref/midday/apps/worker/src/processors/transactions/export.ts`

## Acceptance Criteria

- [x] A permitted owner/admin/member can export reviewed transactions for a date range.
- [x] A viewer cannot export accountant packets.
- [x] The export button is no longer a dead UI element.
- [x] The downloaded package includes `transactions.csv` and `manifest.json`.
- [x] Matched receipts/invoices are included when the file is available through the attachment resolver port.
- [x] Export generation is idempotent for the same request key.
- [x] The export writes audit and outbox records.

## Verification

- `bun test packages/app` passed: 114 tests.
- `bun test` from `packages/jobs` passed: 15 tests.
- `bun run check-types` passed, including the web production build.
- Focused API route test passed: `bun test packages/api/src/accountant-packet-router.test.ts`.
- Manual browser smoke opened `http://localhost:3001/transactions`, which redirected to `http://localhost:3001/login`; authenticated click/download smoke remains blocked until a local test account/session is available.

## Dependencies

- Existing transaction review, document inbox, and storage/download abstractions.
- Production oRPC attachment inclusion currently depends on wiring `AccountantPacketAttachmentResolver` to object storage; local tests cover the available-file path. Full signed storage/export history belongs to Slice 6.

### 2. Midday-Parity Transaction Lifecycle And Review Queue

## Goal

Make the transactions screen behave like a real accountant work queue, not just a generic transaction list.

Status: Completed on 2026-06-15.

## Scope

- Add an explicit accountant workflow status model that can represent Midday's important states: no receipt, receipt found, ready to export, exporting, exported, export failed, excluded, and archived.
- Keep Dawn's existing `reviewState` but add the missing export/reconciliation state needed for accountant handoff.
- Define the domain/application rules for when a transaction is ready for export.
- Make the Review tab show the export queue by default: transactions needing review, receipt confirmation, or export action.
- Add filters/chips/counts for ready, missing receipt, failed export, exported, excluded, and archived.
- Preserve audit records for exclude, archive, unarchive, mark exported, and retry export.

## Areas To Inspect

- `packages/domain/src/transactions.ts`
- `packages/domain/src/transaction-review.test.ts`
- `packages/app/src/banking-ledger.ts`
- `packages/app/src/transaction-review.test.ts`
- `packages/db/src/schema/core.ts`
- `apps/web/src/routes/_auth/transactions.tsx`
- Midday reference: `ref/midday/apps/dashboard/src/components/tables/transactions/data-table.tsx`
- Midday reference: `ref/midday/packages/db/src/queries/transactions.ts`

## Acceptance Criteria

- [x] The Review tab is an actionable accountant queue with stable counts.
- [x] A reviewed transaction with an accepted receipt match can become ready to export.
- [x] A transaction without receipt evidence is clearly separated from ready-to-export items.
- [x] Excluded and archived transactions do not appear in the default export queue.
- [x] Exported transactions disappear from the ready queue but can still be found by filter.
- [x] Failed exports remain visible with retry affordance and error detail.
- [x] All state changes are permissioned, audited, and idempotent.

## Verification

- `bun test packages/domain/src/transaction-review.test.ts packages/app/src/transaction-review.test.ts packages/app/src/accountant-packet.test.ts packages/api/src/accountant-packet-router.test.ts` passed: 22 tests.
- `bun test packages/app` passed: 119 tests.
- `bun test ./src/index.test.ts` from `packages/jobs` passed: 17 tests.
- `bun test` from `packages/jobs` passed: 17 tests.
- `bun run check-types` passed, including the web production build.
- `bun run check` passed; it runs `oxlint && oxfmt --write`.
- Browser smoke opened `http://localhost:3001/transactions`, which redirected to `http://localhost:3001/login`; authenticated queue chip/action/download smoke remains blocked until a local test account/session is available.

## Dependencies

- Can run after Slice 1, or in parallel if schema migration ownership is coordinated.

### 3. CSV Import Wizard Parity Plus

## Goal

Bring Dawn's CSV import UX and reliability up to Midday parity, then improve it with Dawn's existing domain/app boundaries.

Status: Completed on 2026-06-15.

## Scope

- Replace or deepen the operations CSV import surface into a guided flow: select file, detect columns, map fields, preview rows, confirm import, show results.
- Add deterministic column mapping heuristics and an optional AI-assisted mapper behind an application/service boundary.
- Support required fields: amount, date, description. Support optional fields: counterparty, balance, currency, account, external id, category, note, tags.
- Preserve the existing duplicate/invalid/ready preview model and make it visible in the UI.
- Move large commits through a background job when the file exceeds the synchronous threshold.
- Store import session metadata: source file name, mapped columns, row counts, duplicate count, invalid count, actor, account, currency, and completion status.
- Keep raw CSV storage limited and deliberate; do not retain sensitive files forever by accident.

## Areas To Inspect

- `apps/web/src/routes/_auth/operations.tsx`
- `packages/domain/src/csv-import.test.ts`
- `packages/app/src/banking-ledger.ts`
- `packages/app/src/banking.test.ts`
- `packages/jobs/src/index.ts`
- `packages/db/src/schema/core.ts`
- Midday reference: `ref/midday/apps/dashboard/src/components/modals/import-modal/`
- Midday reference: `ref/midday/apps/worker/src/processors/transactions/import-transactions.ts`

## Acceptance Criteria

- [x] A user can upload a company bank CSV and map fields without editing code.
- [x] Common bank headers are auto-detected before the user confirms.
- [x] The preview shows ready, duplicate, and invalid rows with useful reasons.
- [x] The user can invert amount sign when the bank export needs it.
- [x] Small imports commit immediately; large imports create a trackable job.
- [x] Re-importing the same file/rows does not create duplicate transactions.
- [x] Import results update transaction review and matching queues.

## Verification

- `bun test packages/domain/src/csv-import.test.ts packages/app/src/ledger.test.ts` passed: 19 tests.
- `bun test packages/app` passed: 122 tests.
- `bun test packages/jobs/src/index.test.ts` passed: 18 tests.
- `bun test packages/api/src/router.test.ts` passed: 30 tests.
- `DATABASE_URL=postgres://test BETTER_AUTH_SECRET=0123456789abcdef0123456789abcdef BETTER_AUTH_URL=http://localhost:3000 CORS_ORIGIN=http://localhost:3001 bun test apps/server/src/csv-transaction-import.test.ts apps/server/src/worker-runtime.test.ts` passed: 5 tests.
- `bun run check-types` passed, including the web production build.
- `bunx oxlint` passed.
- `bunx oxfmt --check` passed on this slice's touched files after targeted formatting of `packages/app/src/banking-ledger.ts` and `docs/work/ACCOUNTANT-HANDOFF-SLICES.md`. Full `bun run check` was not rerun because it writes across the repo and would collide with concurrent coss UI work in the shared worktree.
- `git diff --check` passed.
- Browser smoke opened `http://localhost:3001/operations`; the authenticated Operations page rendered with no console errors. Authenticated CSV upload/preview/commit click-through remains a future manual smoke.

## Dependencies

- Existing CSV import domain/app functions.
- Slice 2 if import results need final workflow status fields.

### 4. Gmail Connector Production Readiness

## Goal

Make Gmail ingestion reliable enough for accountant workflows, not just a local connector demo.

Status: Local backend/runtime hardening completed on 2026-06-15. Live Gmail smoke
remains blocked until Google OAuth credentials and a test mailbox are available.

## Scope

- Confirm Cloudflare/server environment bindings include Gmail client id, client secret, redirect URL, encryption key, queue, cron, and object storage requirements.
- Add or harden reauth states, disconnect, token refresh failures, sync run status, and per-connection locking.
- Schedule incremental syncs and keep manual sync available.
- Preserve Gmail read-only posture.
- Ingest both PDF/octet-stream attachments and body-only receipt emails.
- Add visible last sync, next sync, imported count, skipped count, and latest error in the inbox UI.
- Keep provider logic in `packages/integrations`; keep OAuth/sync state changes in `packages/app`.

## Areas To Inspect

- `packages/app/src/email-inbox.ts`
- `packages/app/src/email-inbox.test.ts`
- `packages/app/src/documents-inbox.ts`
- `packages/integrations/src/index.ts`
- `packages/jobs/src/index.ts`
- `apps/web/src/routes/_auth/inbox.tsx`
- `apps/server/src`
- Cloudflare/Alchemy config under `packages/infra`
- Midday reference: `ref/midday/apps/api/src/rest/routers/apps/gmail/`

## Acceptance Criteria

- [x] Gmail OAuth can be configured in the deployment environment without ad hoc local-only secrets.
- [x] A connected Gmail account can sync manually and on schedule.
- [x] Expired or revoked credentials produce a reauth state, not silent failure.
- [x] Sync runs are idempotent and do not concurrently process the same connection.
- [x] Attachments and body-only receipts can both produce inbox items.
- [x] The inbox UI shows actionable sync status and errors.
- [x] Provider message ids, attachment ids, and checksums prevent duplicate document ingestion.

## Verification

- Red tests first confirmed scheduled sync skipped-count reporting and
  per-connection active sync rejection were missing.
- `bun test packages/app/src/email-inbox.test.ts` passed: 5 tests.
- `bun test packages/app` passed: 125 tests.
- `bun test packages/api/src/router.test.ts` passed: 30 tests.
- `DATABASE_URL=postgres://test BETTER_AUTH_SECRET=0123456789abcdef0123456789abcdef BETTER_AUTH_URL=http://localhost:3000 CORS_ORIGIN=http://localhost:3001 bun test apps/server/src/worker-runtime.test.ts`
  passed: 5 tests.
- `bun test packages/jobs/src/index.test.ts` passed: 18 tests. A bare
  `bun test packages/jobs` was not used for verification because it also
  discovers read-only `ref/midday` tests with unavailable Midday-only modules.
- `bun run check-types` passed, including the web production build.
- `bunx oxlint` passed.
- `bunx oxfmt --check` passed on this slice's touched files after targeted
  formatting of `packages/app/src/email-inbox.test.ts` and
  `packages/db/src/repositories/integrations.ts`.
- Manual live Gmail smoke remains blocked until deployment has Google OAuth
  credentials and a test mailbox.

## Dependencies

- Google OAuth credentials and redirect URL for live proof.
- Object storage and queue bindings for production-like sync.

### 5. Receipt Matching Parity Plus

## Goal

Make transaction-to-receipt matching at least Midday-parity for accountant handoff, with Dawn-specific safeguards around financial state.

Status: Completed on 2026-06-15 for domain/app/job behavior. Focused browser
smoke remains deferred while the inbox and transaction UI files are under
concurrent coss work.

## Scope

- Ensure matching runs both ways: new transactions search pending inbox items, and new inbox items search existing transactions.
- Persist match suggestions with scores, reasons, candidate fields, and expiry.
- Add accepted, rejected, and expired states for suggestions.
- Add team-level alias memory and hard-negative feedback where it materially improves matching.
- Define a conservative auto-match path for high-confidence exact amount/date/currency/counterparty cases, with an easy way to disable it.
- Keep low-confidence suggestions in review and never mutate financial state silently.
- Add evaluation fixtures for realistic accountant handoff cases.

## Areas To Inspect

- `packages/domain/src/inbox-matching.ts`
- `packages/domain/src/matching-evaluation.ts`
- `packages/domain/src/golden-datasets.test.ts`
- `packages/app/src/documents-inbox.ts`
- `packages/app/src/inbox-matching.test.ts`
- `packages/jobs/src/index.ts`
- `apps/web/src/routes/_auth/inbox.tsx`
- `apps/web/src/routes/_auth/transactions.tsx`
- Midday reference: `ref/midday/apps/worker/src/processors/inbox/match-transactions-bidirectional.ts`
- Midday reference: `ref/midday/docs/inbox-matching.md`

## Acceptance Criteria

- [x] Importing a transaction can produce receipt/invoice match suggestions from existing inbox items.
- [x] Syncing a Gmail receipt can produce transaction match suggestions from existing transactions.
- [x] Suggestions show human-readable reasons, not only a numeric score.
- [x] Accepting a suggestion links the document and updates transaction readiness.
- [x] Rejecting a suggestion prevents the same bad match from resurfacing.
- [x] High-confidence auto-match, if enabled, is audited and reversible.
- [x] Matching quality is measured against fixture cases before broadening thresholds.

## Verification

- `bun test packages/domain/src/matching-evaluation.test.ts packages/domain/src/golden-datasets.test.ts`
  passed: 7 tests.
- `bun test packages/app/src/inbox-matching.test.ts packages/app/src/inbox-extraction.test.ts`
  passed: 15 tests.
- `bun test packages/jobs/src/index.test.ts` passed: 18 tests.
- `bun run check-types` passed, including the web production build.
- Focused browser smoke for accepting and rejecting match suggestions from both
  inbox and transaction screens was deferred to avoid touching the concurrent
  coss UI work.

## Dependencies

- Slice 2 readiness/status fields.
- Slice 4 for live Gmail-originated evidence, though fixtures can land earlier.

### 6. Accountant Export Package Depth

## Goal

Match or exceed Midday's file export: ZIP with CSV, optional XLSX, attachments, accountant email, retryable jobs, and export history.

Status: Partially completed on 2026-06-15 for synchronous package format depth:
CSV/XLSX selection, CSV delimiter, manifest hashes, attachments, skipped
attachment counts, exported transaction state, and queued object-storage export
processing, durable packet records, signed download link creation, scoped
accountant packet download token policy, accountant email-link delivery through
a provider boundary, and failed export telemetry that leaves transactions
retryable. Visible export history UI and live email provider setup remain open.

## Scope

- Move export generation behind a job for larger requests while keeping small exports fast when safe.
- Add CSV delimiter settings and optional XLSX output.
- Organize attachments in stable folders, for example `attachments/expense/` and `attachments/income/`, or by account/month if that better serves accountants.
- Add `manifest.json` with export settings, filters, totals, currency summary, transaction count, attachment count, skipped attachment count, and integrity hashes.
- Generate signed download links with expiration.
- Support optional accountant email delivery and optional copy to the requester.
- Mark included transactions exported only after the package is successfully stored.
- Add retry and export-failed states with visible errors.
- Support unmark/reopen exported transactions when a correction is needed.

## Areas To Inspect

- `packages/app/src/banking-ledger.ts`
- `packages/app/src/documents-inbox.ts`
- `packages/jobs/src/index.ts`
- `packages/db/src/schema/core.ts`
- `packages/api/src/routers/index.ts`
- `apps/server/src`
- `apps/web/src/routes/_auth/transactions.tsx`
- Midday reference: `ref/midday/apps/worker/src/processors/transactions/export.ts`
- Midday reference: `ref/midday/apps/dashboard/src/components/modals/export-transactions-modal.tsx`

## Acceptance Criteria

- [x] A user can choose CSV, XLSX, or both.
- [x] A user can choose delimiter where CSV is selected.
- [x] The export package includes attachments for matched documents and records skipped attachments.
- [x] The package includes a manifest with totals and hashes.
- [x] The user can download the export through a signed link.
- [x] The user can send the package to an accountant email address.
- [x] Successful exports mark transactions exported and remove them from the ready queue.
- [x] Failed exports are visible, retryable, and do not mark transactions exported.

## Verification

- `bun test packages/app/src/accountant-packet.test.ts` passed: 10 tests.
- `DATABASE_URL=postgres://test BETTER_AUTH_SECRET=0123456789abcdef0123456789abcdef BETTER_AUTH_URL=http://localhost:3000 CORS_ORIGIN=http://localhost:3001 POLAR_ACCESS_TOKEN=test POLAR_SUCCESS_URL=http://localhost:3001/success bun test packages/api/src/accountant-packet-router.test.ts`
  passed: 4 tests.
- App tests cover package content, idempotency, format settings, manifest hashes,
  skipped attachments, and successful export state transition.
- `DATABASE_URL=postgres://test BETTER_AUTH_SECRET=0123456789abcdef0123456789abcdef BETTER_AUTH_URL=http://localhost:3000 CORS_ORIGIN=http://localhost:3001 POLAR_ACCESS_TOKEN=test POLAR_SUCCESS_URL=http://localhost:3001/success bun test packages/app/src/accountant-packet.test.ts packages/api/src/accountant-packet-router.test.ts packages/jobs/src/index.test.ts apps/server/src/worker-runtime.test.ts apps/server/src/accountant-packet-export.test.ts`
  passed: 37 tests.
- Queued export tests cover request idempotency, outbox-to-job mapping, worker
  registration, storage-backed attachment inclusion, archive write, replay, and
  not marking transactions exported when object storage fails.
- Signed download tests cover durable packet export records and the API route
  creating a signed download URL for the stored ZIP.
- `bun test packages/api/src/document-url.test.ts` passed: 5 tests.
- Document URL tests cover signed accountant packet download tokens, expiration,
  tamper rejection, and scoped packet object keys.
- `bun test packages/integrations/src/invoice-delivery.test.ts` passed: 2 tests.
- `bun test packages/app/src/accountant-packet.test.ts` passed: 13 tests.
- `DATABASE_URL=postgres://test BETTER_AUTH_SECRET=0123456789abcdef0123456789abcdef BETTER_AUTH_URL=http://localhost:3000 CORS_ORIGIN=http://localhost:3001 POLAR_ACCESS_TOKEN=test POLAR_SUCCESS_URL=http://localhost:3001/success bun test packages/api/src/accountant-packet-router.test.ts`
  passed: 7 tests.
- App/API tests cover emailing stored packet links, optional requester copy,
  provider message IDs, audit, outbox, and idempotent replay.
- Live transactional email provider setup remains open; local behavior is covered
  through the mock email provider boundary.
- `bun test apps/server/src/accountant-packet-export.test.ts` passed: 2 tests.
- Worker tests cover failed archive storage writing redacted audit, outbox, and
  job-run telemetry while leaving ready transactions unexported for retry.
- Browser smoke for export settings modal and download.
- Open the produced ZIP and verify file names, CSV rows, manifest counts, and attachment presence.
- `bun run check-types` passed.
- `bunx oxlint` passed.
- `bunx oxfmt --check packages/app/src/accountant-packet.ts packages/app/src/accountant-packet.test.ts packages/api/src/routers/index.ts packages/api/src/accountant-packet-router.test.ts packages/jobs/src/index.ts packages/jobs/src/index.test.ts apps/server/src/accountant-packet-export.ts apps/server/src/accountant-packet-export.test.ts apps/server/src/worker-runtime.ts apps/server/src/worker-runtime.test.ts`
  passed.
- `bunx oxfmt --check packages/integrations/src/index.ts packages/integrations/src/invoice-delivery.test.ts packages/app/src/accountant-packet.ts packages/app/src/accountant-packet.test.ts packages/api/src/routers/index.ts packages/api/src/accountant-packet-router.test.ts`
  passed.
- `git diff --check -- packages/integrations/src/index.ts packages/integrations/src/invoice-delivery.test.ts packages/app/src/accountant-packet.ts packages/app/src/accountant-packet.test.ts packages/api/src/routers/index.ts packages/api/src/accountant-packet-router.test.ts docs/work/ACCOUNTANT-HANDOFF-SLICES.md`
  passed.

## Dependencies

- Slice 1 tracer.
- Slice 2 lifecycle fields.
- Email delivery binding/provider decision.
- Object storage/signer availability.

### 7. Accountant Access And Handoff Audit

## Goal

Make accountant collaboration better than Midday's email-only path where Dawn's team role model can help.

Status: Partially completed on 2026-06-15 for accountant role access. The
accountant role can be invited and can export ready packets, but it no longer
has transaction categorization or other write-oriented product permissions.
Stored packet records, signed download-link audit, email-send success/failure
audit, export history API, revocable packet links, and email-only handoff API
now exist. Visible export history UI remains open.

## Scope

- Use the existing accountant role as a first-class workflow participant.
- Define what accountants can see and do: view/export transactions, view linked receipts, comment or mark questions, but not mutate financial state unless explicitly permitted.
- Add an accountant-friendly export history view with packages, filters, actor, recipient, created time, expiration, and status.
- Add package access audit events for download, email send, failed send, regeneration, and revoke.
- Allow revoking an export link before expiration.
- Keep the email-to-accountant path from Slice 6 for external accountants who are not invited.

## Areas To Inspect

- `packages/domain/src/identity.ts`
- `packages/domain/src/permissions.test.ts`
- `packages/app/src/team-permissions.test.ts`
- `packages/app/src/banking-ledger.ts`
- `packages/app/src/documents-inbox.ts`
- `apps/web/src/routes/_auth/operations.tsx`
- `apps/web/src/routes/_auth/transactions.tsx`

## Acceptance Criteria

- [x] A team can invite an accountant role.
- [x] An accountant can view the review/export queue and download allowed accountant packets.
- [x] An accountant cannot review, categorize, delete, or alter transactions unless a permission explicitly allows it.
- [x] Export history API shows who generated each stored package.
- [ ] Export history UI shows who generated and who accessed each package.
- [x] Revoked or expired links cannot be used.
- [x] Email-only handoff still works without creating a team member.

## Verification

- `bun test packages/domain/src/permissions.test.ts` passed: 7 tests.
- `bun test packages/app/src/team-permissions.test.ts packages/app/src/accountant-packet.test.ts packages/app/src/transaction-review.test.ts`
  passed: 33 tests.
- Permission matrix tests cover the accountant role.
- App tests cover accountant export access and denied transaction review.
- App/API tests cover stored packet export history for accountant-permitted actors.
- `bun test packages/app/src/accountant-packet.test.ts` passed: 12 tests.
- `DATABASE_URL=postgres://test BETTER_AUTH_SECRET=0123456789abcdef0123456789abcdef BETTER_AUTH_URL=http://localhost:3000 CORS_ORIGIN=http://localhost:3001 POLAR_ACCESS_TOKEN=test POLAR_SUCCESS_URL=http://localhost:3001/success bun test packages/api/src/accountant-packet-router.test.ts`
  passed: 6 tests.
- App/API tests cover revoking stored packet exports, idempotent revoke replay,
  and blocking new signed download links for revoked packets.
- Server download handling rechecks accountant packet status before reading R2,
  so previously issued signed links stop working after revocation.
- App/API tests cover emailing a stored packet link to an arbitrary accountant
  email address without creating a team member, including audit and outbox.
- `bun test packages/app/src/accountant-packet.test.ts` passed: 14 tests.
- App tests cover provider email failures writing redacted
  `accountant_packet.email_failed` audit and outbox events without saving the
  failed idempotency result.
- Browser smoke with owner and accountant accounts if test auth supports it.
- `bun run check-types` passed.
- `bunx oxlint` passed.
- `bunx oxfmt --check packages/api/src/document-url.ts packages/api/src/document-url.test.ts packages/app/src/accountant-packet.ts packages/app/src/accountant-packet.test.ts packages/app/src/testkit/memory-repository.ts packages/db/src/schema/core.ts packages/db/src/dawn-repository.ts packages/api/src/routers/index.ts packages/api/src/accountant-packet-router.test.ts apps/server/src/index.ts`
  passed.
- `git diff --check -- packages/api/src/document-url.ts packages/api/src/document-url.test.ts packages/app/src/accountant-packet.ts packages/app/src/accountant-packet.test.ts packages/app/src/testkit/memory-repository.ts packages/db/src/schema/core.ts packages/db/src/dawn-repository.ts packages/api/src/routers/index.ts packages/api/src/accountant-packet-router.test.ts apps/server/src/index.ts packages/db/src/migrations/0026_accountant_packet_revocation.sql packages/db/src/migrations/meta/_journal.json docs/work/ACCOUNTANT-HANDOFF-SLICES.md`
  passed.
- `bunx oxfmt --check packages/integrations/src/index.ts packages/integrations/src/invoice-delivery.test.ts packages/app/src/accountant-packet.ts packages/app/src/accountant-packet.test.ts packages/api/src/routers/index.ts packages/api/src/accountant-packet-router.test.ts`
  passed.
- `git diff --check -- packages/integrations/src/index.ts packages/integrations/src/invoice-delivery.test.ts packages/app/src/accountant-packet.ts packages/app/src/accountant-packet.test.ts packages/api/src/routers/index.ts packages/api/src/accountant-packet-router.test.ts docs/work/ACCOUNTANT-HANDOFF-SLICES.md`
  passed.

## Dependencies

- Slice 6 export package depth.
- Existing team invite/accountant role surfaces.

### 8. Operational Hardening And Accountant Close Loop

## Goal

Make the workflow dependable for repeated monthly closes.

Status: Partially completed on 2026-06-15 for backend/API close readiness,
job-run retry/dead-letter guidance, and deterministic close-loop fixture
coverage. Operations UI and live Gmail close smoke remain open.

## Scope

- Add operations visibility for import sessions, Gmail sync runs, matching jobs, and export jobs.
- Add retry policies and structured error categories for import, sync, matching, storage, and email delivery.
- Add close-period workflow affordances: date range presets, month exported status, missing receipt count, failed export count, and open questions count.
- Add a durable "accountant handoff ready" summary that can be checked before exporting.
- Add regression fixtures for a representative month: bank CSV, Gmail receipts, unmatched transactions, duplicate receipts, failed attachment fetch, export retry.

## Areas To Inspect

- `apps/web/src/routes/_auth/operations.tsx`
- `apps/web/src/routes/_auth/reports.tsx`
- `apps/web/src/routes/_auth/transactions.tsx`
- `packages/app/src/operations.ts`
- `packages/app/src/reporting.test.ts`
- `packages/jobs/src/index.ts`
- `packages/domain/src/golden-datasets.test.ts`

## Acceptance Criteria

- [ ] Operations UI can explain the latest import, sync, match, and export runs.
- [x] Operations API can report whether a selected month is ready to send to an accountant.
- [x] Failed jobs have retry affordances and actionable error messages in the
  Operations API.
- [x] A representative monthly close fixture exercises CSV import, receipt evidence, review, and export.
- [x] The system can rerun the close flow without duplicate transactions, documents, or exports.

## Verification

- Red tests first confirmed `workspace.accountantClose` was absent from the
  app and API operations workspace.
- `bun test packages/app/src/operations.test.ts` passed: 9 tests.
- `bun test packages/api/src/router.test.ts` passed: 30 tests.
- `bun run check-types` passed.
- `bunx oxlint` passed.
- `bunx oxfmt --check packages/app/src/operations.ts packages/app/src/operations.test.ts packages/api/src/routers/index.ts packages/api/src/router.test.ts`
  passed.
- `git diff --check -- packages/app/src/operations.ts packages/app/src/operations.test.ts packages/api/src/routers/index.ts packages/api/src/router.test.ts docs/work/ACCOUNTANT-HANDOFF-SLICES.md`
  passed.
- `bun test packages/app/src/accountant-close-flow.test.ts` passed: 1 test.
- Close-loop fixture covers CSV import replay, transaction review, receipt
  evidence attached through the accountant packet attachment boundary, CSV/XLSX
  export, package attachments, export replay, and duplicate prevention. Live
  Gmail ingestion remains covered by provider-boundary tests and still needs a
  credentialed smoke.
- Operations app/API tests cover `jobRunActions` for dead-lettered and retryable
  failed jobs with redacted reasons, retry eligibility, next attempts, and
  operator next steps.
- `bun test packages/app/src/operations.test.ts` passed: 9 tests.
- `DATABASE_URL=postgres://test BETTER_AUTH_SECRET=0123456789abcdef0123456789abcdef BETTER_AUTH_URL=http://localhost:3000 CORS_ORIGIN=http://localhost:3001 POLAR_ACCESS_TOKEN=test POLAR_SUCCESS_URL=http://localhost:3001/success bun test packages/api/src/router.test.ts --test-name-pattern "operations workspace"`
  passed: 1 test.
- `bun run check-types` passed.
- `bunx oxlint` passed.
- `bunx oxfmt --check packages/app/src/operations.ts packages/app/src/operations.test.ts packages/api/src/router.test.ts`
  passed.
- `git diff --check -- packages/app/src/operations.ts packages/app/src/operations.test.ts packages/api/src/router.test.ts docs/work/ACCOUNTANT-HANDOFF-SLICES.md`
  passed.
- Browser smoke for operations visibility and month-ready summary remains
  deferred while operations/web UI files are under concurrent coss work.

## Dependencies

- Slices 2, 3, 4, 5, and 6.

## Dependencies

External prerequisites:

- Google OAuth credentials and redirect URL for live Gmail proof.
- Cloudflare queue/cron/object storage/signed URL bindings.
- Email delivery provider or transactional email binding for accountant delivery.
- A sample company bank CSV and a small set of representative Gmail receipt emails.
- A policy decision for how long export packages and raw CSV uploads are retained.

Internal prerequisites:

- Keep business rules in `packages/domain` and `packages/app`.
- Keep provider APIs behind `packages/integrations`.
- Keep workers/jobs behind typed contracts in `packages/jobs`.
- Use coss UI primitives for new product UI where component work is needed.
- Preserve audit, idempotency, and outbox behavior for financial state changes.

## Suggested First Slice

Start with **Slice 1: Accountant Packet Tracer**.

It produces the first actual accountant artifact from Dawn, proves the product promise end to end, and exposes the exact gaps the deeper slices must close. After that, run Slice 2 before expanding export depth, because a good export depends on a clear transaction lifecycle and review queue.
