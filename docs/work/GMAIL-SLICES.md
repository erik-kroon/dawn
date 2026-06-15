**Outcome**
Dawn has a Gmail connector that matches or exceeds Midday by supporting:

- Gmail OAuth with `gmail.readonly`, encrypted token storage, refresh, reauth states, and manual disconnect.
- Manual and scheduled sync, roughly every 6 hours.
- Attachment ingestion for PDFs/octet-streams into Documents/Inbox.
- Body-only receipt ingestion, not just attachment-first sync.
- Deduping, sender/domain blocklists, size limits, sync run records, audit logs, outbox jobs, and observable failure states.
- Provider-neutral architecture so Outlook or another mailbox provider can use the same app/job/document pipeline.

**Implementation Status**
Implemented on 2026-06-15.

- Provider-neutral `InboxConnector` and email evidence contract live in `packages/integrations`.
- Gmail OAuth, token refresh, message search, attachment fetch, body evidence mapping, and structured provider errors are implemented behind the Gmail adapter.
- Email inbox app use cases own OAuth completion, encrypted token persistence, settings, sync requests, evidence ingestion, dedupe, audit, outbox, and sync-run status.
- Manual and scheduled sync jobs route through `inbox.provider.sync`; the scheduled worker requests due connections on cron.
- Mock provider coverage imports both a PDF attachment and body-only receipt into Documents/Inbox, with body receipt extraction.
- Inbox UI exposes provider connect status, OAuth callback handling, manual sync, and filtering controls.

Verification passed:

- `bun test packages/integrations`
- `bun test packages/integrations packages/app/src/email-inbox.test.ts packages/api/src/router.test.ts packages/jobs/src/index.test.ts`
- `DATABASE_URL=postgres://user:pass@localhost:5432/dawn BETTER_AUTH_SECRET=12345678901234567890123456789012 BETTER_AUTH_URL=http://localhost:3000 CORS_ORIGIN=http://localhost:3000 bun test apps/server/src/worker-runtime.test.ts`
- `bun run check-types`
- Browser smoke opened `/inbox` on the local web app and verified the unauthenticated redirect to `/login` with no client errors. A full authenticated Gmail browser smoke still requires a working local database/session and Google OAuth credentials.

**Slice Strategy**
Do not port Midday’s `getAttachments()` shape directly. In Dawn, Gmail should be an `email inbox provider` behind `packages/integrations`, with application use cases in `packages/app` owning OAuth completion, sync requests, evidence ingestion, idempotency, audit, and outbox events.

Current key areas:

- [packages/integrations/src/index.ts](/Users/erik/dawn/packages/integrations/src/index.ts)
- [packages/app/src/integrations.ts](/Users/erik/dawn/packages/app/src/integrations.ts)
- [packages/app/src/documents-inbox.ts](/Users/erik/dawn/packages/app/src/documents-inbox.ts)
- [packages/jobs/src/index.ts](/Users/erik/dawn/packages/jobs/src/index.ts)
- [packages/db/src/schema/core.ts](/Users/erik/dawn/packages/db/src/schema/core.ts)
- Midday reference: [ref/midday/packages/inbox/src/providers/gmail.ts](/Users/erik/dawn/ref/midday/packages/inbox/src/providers/gmail.ts)

**Commit Protocol**

Gmail work should commit as it goes. Do not leave several verified slices in one
large dirty worktree.

After each verified slice, or after a coherent independently useful sub-slice:

1. Run the slice's focused verification and any impacted workspace checks.
2. Update the relevant implementation tracker with status, verification, blockers,
   and the next slice.
3. Inspect `git status --short` and the diff before staging.
4. Stage only files owned by the Gmail slice; do not stage unrelated UI, banking,
   matching, or user-owned worktree changes.
5. Commit the verified unit with a concise conventional message, for example
   `feat(gmail): add email inbox provider contract` or
   `feat(gmail): ingest body-only receipts`.
6. If live Google credentials or redirect setup block proof, commit the
   local/testable foundation only when it is independently useful and record the
   live prerequisite explicitly.

Use a separate docs checkpoint commit when tracking/docs updates are substantial
or when separating them makes history easier to review.

**Ordered Slices**

1. **Email Inbox Provider Contract**
   - Goal: Define a provider-neutral contract for mailbox evidence, not just attachments.
   - Scope: Add `EmailInboxProvider`, `EmailInboxEvidence`, attachment/body artifact types, sync cursor, auth error classes.
   - Acceptance: Mock provider can return a PDF attachment and a body-only receipt through one typed interface.
   - Verification: `bun test packages/integrations packages/app/src/integrations.test.ts`
   - Dependencies: None.

2. **Gmail OAuth Connection Flow**
   - Goal: Users can connect Gmail and store an encrypted connection.
   - Scope: Auth URL, callback exchange, encrypted token bundle, provider account email/id, granted scopes, expiry, audit/outbox.
   - Acceptance: OAuth callback creates or updates an `integration_connection` with provider `gmail`, category `email`, status `connected`.
   - Verification: App use-case tests plus server route tests if routes are added.
   - Dependencies: Slice 1.

3. **Manual Sync Tracer**
   - Goal: A manual Gmail sync creates a real inbox item from one PDF attachment.
   - Scope: Add `inbox.provider.sync` job payload, app sync use case, provider-object dedupe, R2/storage adapter handoff, document upload completion.
   - Acceptance: One mocked Gmail attachment becomes a `document`, `document_version`, `inbox_item`, audit event, and `document.uploaded` outbox event.
   - Verification: `bun test packages/app/src/inbox-extraction.test.ts packages/jobs`
   - Dependencies: Slices 1-2.

4. **Real Gmail Adapter**
   - Goal: Replace the mock tracer with real Gmail API behavior.
   - Scope: OAuth URL/exchange, token refresh, user info, message search, attachment fetch, structured auth/sync errors.
   - Acceptance: Adapter supports the Midday-level attachment flow: not-from-me, PDF/octet-stream attachments, incremental date window, refresh before expiry.
   - Verification: Unit tests around adapter mapping with mocked Google client; manual live test gated by env vars.
   - Dependencies: Slices 1-3.

5. **Scheduled Incremental Sync**
   - Goal: Gmail sync runs automatically around every 6 hours and can be manually triggered.
   - Scope: Cron/workflow emits sync requests for connected Gmail accounts; per-connection idempotency key; lock/rate-limit; sync run status.
   - Acceptance: Due Gmail connections produce `inbox.provider.sync` jobs without duplicate concurrent runs.
   - Verification: `bun test packages/jobs packages/app/src/integrations.test.ts`
   - Dependencies: Slice 3.

6. **Body-Only Receipt Ingestion**
   - Goal: Beat Midday’s attachment-first limitation.
   - Scope: Fetch candidate body-only emails, sanitize/normalize body text/html, store as an inbox evidence artifact, extract receipt fields, create reviewable inbox items.
   - Acceptance: A receipt email with no attachment creates an inbox item with merchant/date/amount/currency extraction candidates.
   - Verification: Focused app tests using representative receipt bodies.
   - Dependencies: Slices 1, 3, 4.

7. **Filtering, Privacy, And Deduping**
   - Goal: Prevent noisy or sensitive mailbox ingestion.
   - Scope: Sender/domain blocklist, optional allowlist/search settings, max attachment size, MIME filtering, deterministic duplicate key using provider message/part IDs plus checksum.
   - Acceptance: Blocked senders/domains, oversized files, repeated message parts, and unsupported MIME types are skipped with sync-run counts.
   - Verification: App sync tests for each skip reason.
   - Dependencies: Slices 3 and 6.

8. **Extraction And Matching Depth**
   - Goal: Gmail-ingested artifacts flow into Dawn’s document extraction and transaction matching.
   - Scope: Reuse `runStoredDocumentExtraction`, add body receipt extractor path, generate inbox match suggestions, preserve low-confidence suggestions for review.
   - Acceptance: Attachment and body receipts both produce match suggestions without silently mutating financial state.
   - Verification: `bun test packages/app/src/inbox-extraction.test.ts packages/app/src/inbox-matching.test.ts`
   - Dependencies: Slices 3 and 6.

9. **UX And Operations**
   - Goal: Make the connector usable and supportable.
   - Scope: Gmail connect card, connected account status, last sync, manual sync, reauth banner, sync errors, blocklist/settings UI, observability fields.
   - Acceptance: User can connect, sync, see imported inbox items, handle reauth, and adjust filtering.
   - Verification: Web typecheck plus browser smoke test.
   - Dependencies: Slices 2, 5, 7.

**Dependencies**
External prerequisites: Google OAuth client, redirect URL env vars, token encryption key management, object storage/R2 binding, queue/cron support, and live Gmail test account.

Internal prerequisites: keep provider logic out of routes/workers; add use cases in `packages/app`; job payloads in `packages/jobs`; provider implementation in `packages/integrations`; persistence in `packages/db`.

**Suggested First Slice**
Start with **Slice 1: Email Inbox Provider Contract** plus a fake provider tracer. It creates the right architecture before Gmail-specific code lands, and it prevents Dawn from inheriting Midday’s attachment-only abstraction.
