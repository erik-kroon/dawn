# Gmail Auto-Import Accountant Slices

## Outcome

After Google login with Gmail consent, Dawn automatically connects Gmail,
starts importing receipt evidence for the accounting period, and gives visible
sync progress/results. A user can then import a company bank CSV and match
transactions against Gmail-derived receipts without manual dispatch, duplicate
OAuth steps, or a 30-day ceiling.

## Slice Strategy

Build this as vertical product behavior, not backend/frontend chores. Each slice
should leave the app more usable on its own:

1. Prove login -> Gmail connection -> sync worker starts.
2. Make the import range accountant-valid.
3. Make sync results understandable.
4. Connect Gmail evidence to CSV matching confidence.
5. Harden and clean the operational path.

## Ordered Slices

## 1. Google Login Starts Gmail Import

## Goal

Google login with `gmail.readonly` should be enough to create the Gmail inbox
connection and start an initial sync.

## Scope

Inspect:

- `apps/web/src/components/sign-in-form.tsx`
- `apps/web/src/components/sign-up-form.tsx`
- `apps/web/src/routes/_auth/inbox.tsx`
- `packages/api/src/routers/index.ts`
- `packages/app/src/email-inbox.ts`
- `apps/server/src/index.ts`
- `apps/server/src/worker-runtime.ts`

Implement:

- Persist "Google login should connect Gmail" intent through the OAuth callback.
- On authenticated `/inbox`, connect Gmail from Better Auth Google tokens.
- After `requestEmailInboxSync`, dispatch the outbox immediately server-side or
  via an app-layer `requestAndDispatchEmailInboxSync` use case.
- Keep the worker as the only place that calls Gmail.

## Acceptance Criteria

- [ ] User logs in with Google once and grants Gmail read-only once.
- [ ] `/inbox` shows Gmail connected without pressing "Connect Gmail."
- [ ] Initial sync starts without manual curl/internal endpoint.
- [ ] Server logs show an `inbox.provider.sync` worker run after login.
- [ ] Existing manual `Sync` button also triggers actual worker execution.

## Verification

- Focused router/use-case test for Google-token connect + sync request +
  dispatch.
- Local smoke with mock inbox.
- Local smoke with real Google login if credentials are available.

## Dependencies

Better Auth Google account tokens must include access token, refresh token,
expiry, and Gmail scope.

## 2. Replace 30-Day Gmail Window With Accounting Backfill

## Goal

Initial Gmail import should cover the period needed for accountant prep, not just
recent mail.

## Scope

Inspect:

- `packages/integrations/src/email-inbox.ts`
- `packages/app/src/email-inbox.ts`
- Bank CSV import/session date-range code in `packages/app` and `packages/api`

Implement:

- Add a sync range to Gmail sync commands/settings.
- Initial sync default: current calendar year to date.
- If bank CSV transactions exist/import session has a date range, use that range
  with a small pad.
- Store enough cursor/range metadata to avoid future syncs collapsing back to 30
  days.

## Acceptance Criteria

- [ ] First Gmail sync on June 16, 2026 searches from `2026-01-01`, not
      `newer_than:30d`.
- [ ] If CSV has transactions from `2025-01-01` to `2025-12-31`, Gmail backfill
      can target that range.
- [ ] Incremental syncs after initial backfill still use cursor-based behavior.
- [ ] Tests assert generated Gmail query range.

## Verification

- Unit tests for Gmail query construction.
- App tests for initial backfill range selection.
- Manual log inspection of Gmail query in local dev.

## Dependencies

Need a reliable place to read bank CSV/import date range. If absent, YTD default
is enough for this slice.

## 3. Make Sync State Honest In The Inbox UI

## Goal

The UI must tell the user what happened: queued, running, imported, zero
matches, skipped, or failed.

## Scope

Inspect:

- `apps/web/src/routes/_auth/inbox.tsx`
- `packages/app/src/email-inbox.ts`
- `packages/db/src/repositories/integrations.ts`

Implement:

- Show latest sync run status and counts.
- Distinguish "connected but never synced" from "sync queued."
- Show "0 matching receipt emails found" when sync completed with zero imported.
- Show skipped count/reasons where available.
- Disable or relabel Sync while queued/running.

## Acceptance Criteria

- [ ] "Ready to sync" no longer appears after a sync request has been queued.
- [ ] Completed zero-result sync is visible and understandable.
- [ ] Failed sync shows actionable error.
- [ ] User can tell whether waiting, retrying, or changing filters is the next
      action.

## Verification

- Component/route test or mock-data visual check.
- Manual smoke with mock connector returning imported, zero, and failed cases.

## Dependencies

Slice 1 must record/dispatch sync runs reliably.

## 4. Import Evidence Useful For CSV Matching

## Goal

Imported Gmail evidence should become usable matching material for bank CSV
transactions.

## Scope

Inspect:

- `packages/app/src/documents-inbox.ts`
- `packages/app/src/inbox-matching*.ts`
- `packages/app/src/email-inbox.ts`
- `apps/web/src/routes/_auth/inbox.tsx`

Implement:

- Ensure Gmail-imported evidence creates normal inbox/document/extraction
  records.
- Ensure match suggestions run or are easy to trigger after import.
- Preserve source metadata: sender, subject, received date, attachment filename.
- Make imported receipts visible in the same review queue as uploads.

## Acceptance Criteria

- [ ] Gmail PDF receipt creates an inbox item.
- [ ] Body-only receipt can create an inbox item.
- [ ] Imported receipt can match a CSV transaction by amount/date/merchant.
- [ ] Duplicate Gmail evidence does not create duplicate inbox items.

## Verification

- End-to-end app test using mock email evidence and imported transaction.
- Existing matching tests extended only where needed.

## Dependencies

Document extraction must work for email-imported documents.

## 5. Gmail Filter And Privacy Controls

## Goal

Dawn should scan broadly enough for accountant work while persisting narrowly
enough to avoid becoming a mailbox archive.

## Scope

Inspect:

- Gmail connector filters in `packages/integrations/src/email-inbox.ts`
- Settings UI in `apps/web/src/routes/_auth/inbox.tsx`

Implement:

- Keep Gmail read-only.
- Persist only candidate receipt/invoice/order/payment evidence.
- Keep block sender/domain filters.
- Add optional search query override only if it helps real testing.
- Make defaults suitable for accountant backfill.

## Acceptance Criteria

- [ ] Dawn does not store arbitrary non-receipt emails.
- [ ] User can block noisy senders/domains.
- [ ] Sync results include skipped counts or at least evidence-found/imported
      counts.
- [ ] Query covers accountant period while staying receipt-focused.

## Verification

- Connector tests for included/excluded message cases.
- Manual test with real Gmail search terms.

## Dependencies

Slice 2 defines the date window.

## 6. Operational Hardening

## Goal

Make the flow stable enough to trust before using real accountant data.

## Scope

Inspect:

- `packages/app/src/outbox-dispatch.test.ts`
- `packages/jobs/src/index.ts`
- `apps/server/src/worker-runtime.ts`
- `packages/app/src/email-inbox.ts`

Implement:

- Idempotency around initial sync.
- No concurrent syncs per Gmail connection.
- Retry behavior for failed dispatch/worker jobs.
- Reauth state for revoked/expired Google tokens.
- Avoid helper scripts unless they are productized commands.

## Acceptance Criteria

- [ ] Repeated login/callback does not duplicate connections or imports.
- [ ] Pressing Sync repeatedly does not launch concurrent Gmail syncs.
- [ ] Revoked Google access produces a reconnect state.
- [ ] Failed jobs are inspectable through existing operations/sync state.
- [ ] Typecheck/tests pass without adding stray one-off scripts.

## Verification

- App/use-case tests for idempotency and lock behavior.
- Worker test for Gmail sync job.
- `bun run check-types` or targeted typecheck once unrelated dirty work is
  controlled.

## Dependencies

Slices 1-3.

## Dependencies

External:

- Google OAuth client configured with Gmail readonly scope.
- Better Auth storing Google provider tokens.
- Local/dev server has `BETTER_AUTH_SECRET`, Google client ID/secret, document
  storage, and queue binding/local queue.

Internal:

- Outbox dispatcher must be callable from server-side app code, not browser.
- Gmail sync range needs access to team accounting period or CSV import date
  range.
- Inbox/document extraction pipeline must accept email-imported artifacts.

## Suggested First Slice

Start with Slice 1. It creates the real product signal: log in with Google, land
on `/inbox`, and watch Gmail import start automatically. Without that, range
tuning and matching polish are premature.
