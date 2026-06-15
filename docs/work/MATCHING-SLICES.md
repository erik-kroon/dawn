# Matching Vertical Work Plan

Triage: ready-for-agent
Publication: Local repo artifact. No project issue tracker or remote is assumed.
Status: Slice 6 implemented; Slice 7 next
Date: 2026-06-15
Source material: `docs/PRD.md`, `CONTEXT.md`, `CONTEXT-MAP.md`, Dawn matching code, and Midday reference matching docs/code under `ref/midday`.

## Outcome

When all slices are done, Dawn has a deterministic, bidirectional transaction/document matcher that is at least on par with Midday and cleaner architecturally:

- New inbox document or receipt arrives: Dawn finds plausible transactions and creates explainable suggestions or safe auto-matches.
- New bank transaction arrives later: Dawn finds pending inbox receipts and creates the same kind of suggestions. This covers the Gmail receipt-before-bank-clearing path.
- The critical matcher does not depend on an LLM. AI can explain, search, or assist later, but matching policy remains deterministic and testable.
- Amount, currency, optional base currency, document date vs transaction date, merchant/name similarity, invoice number, sender/domain hints, team threshold calibration, alias learning, and hard-negative memory all influence the score.
- Public API routes, oRPC, workers, automation, and assistant tools call application use cases rather than owning matching rules.
- Postgres remains authoritative for suggestions, attachments, audit, outbox, feedback history, aliases, and hard negatives.

## Current Dawn Baseline

Dawn already has the first layer of matching behavior:

- Domain scoring: `packages/domain/src/inbox-matching.ts`
- App use cases for generating, accepting, and rejecting suggestions: `packages/app/src/documents-inbox.ts`
- App tests: `packages/app/src/inbox-matching.test.ts`
- Existing tables for inbox items, extractions, suggestions, attachments, aliases, and hard negatives: `packages/db/src/schema/core.ts`
- Existing queue/outbox scaffold: `packages/jobs/src/index.ts`, `packages/app/src/index.ts`, `apps/server/src/index.ts`

The main gaps are production-grade candidate retrieval, reverse matching on transaction arrival, richer scoring, calibrated thresholds, recoverable feedback memory, cross-currency/base-currency evidence, conservative auto-match policy, and a real evaluation harness.

## Better-Than-Midday Design Posture

Do not copy Midday's database-query-owned business policy. Use Midday for product behavior and proven heuristics, then place each concern in Dawn's intended layer:

- `packages/domain`: pure match scoring, normalization, confidence policy, thresholds, feedback-memory math, and golden fixtures.
- `packages/app`: use cases, permissions, idempotency, transaction boundaries, audit, outbox, suggestion lifecycle, auto-match state transitions, and worker-callable commands.
- `packages/db`: Drizzle persistence and efficient SQL candidate retrieval. SQL narrows candidates; it does not decide business policy.
- `packages/jobs`: queue schemas for matching work triggered by `document.extracted`, `transaction.created`, `transaction_import.committed`, and `bank_connection.synced`.
- `apps/server`: Cloudflare runtime adapters and queue handlers that deserialize messages, construct repositories/providers, call app use cases, and classify failures.
- `apps/web`: review UI only. It displays suggestions, explanations, accept/reject actions, and match status without encoding matching rules.

## Horizontal Temptations To Avoid

- Do not create separate backend-only, frontend-only, and test-only tickets for matching. Each slice must produce observable matching behavior or measurable quality.
- Do not start by porting all Midday matching files. Dawn's target is parity in capability, not parity in file shape.
- Do not add LLM matching before deterministic matching is strong and measurable.
- Do not auto-attach documents in the tracer slice. Auto-match needs history, thresholds, audit, and an explicit policy gate.
- Do not make candidate retrieval an unbounded report transaction scan.
- Do not put matching decisions in queue handlers, API routers, or React components.

## Commit Protocol

Matching work should commit as it goes. Do not wait until several matcher slices
have accumulated in one dirty worktree.

After each verified slice, or after a coherent independently useful sub-slice:

1. Run the slice's focused verification and any impacted workspace checks.
2. Update the relevant implementation tracker with status, verification, blockers,
   and the next slice.
3. Inspect `git status --short` and the diff before staging.
4. Stage only files owned by the matching slice; do not stage unrelated UI,
   banking, Gmail, or user-owned worktree changes.
5. Commit the verified unit with a concise conventional message, for example
   `feat(matching): add reverse matching job` or
   `refactor(matching): share deterministic score engine`.
6. If live data or broader evaluation proof is blocked, commit the local/testable
   foundation only when it is independently useful and record the prerequisite
   explicitly.

Use a separate docs checkpoint commit when tracking/docs updates are substantial
or when separating them makes history easier to review.

## Ordered Slices

### 1. Reverse Matching Tracer

## Goal

When a new transaction is created, imported, or synced after a receipt already exists, Dawn creates a persisted match suggestion without requiring the user to click "Find matches."

## Scope

- Add an app use case such as `matchPendingInboxForTransaction`.
- Add repository methods for a bounded list of pending inbox candidates for a transaction.
- Add a queue message for transaction-triggered matching.
- Fan out the message from `transaction.created`, `transaction_import.committed`, and bank-sync transaction events.
- Add a server queue handler that calls the app use case with a system actor.
- Persist suggestions through the existing suggestion table and keep existing accept/reject flows working.

## Areas To Inspect

- `packages/domain/src/inbox-matching.ts`
- `packages/app/src/documents-inbox.ts`
- `packages/app/src/inbox-matching.test.ts`
- `packages/app/src/banking-ledger.ts`
- `packages/jobs/src/index.ts`
- `apps/server/src/index.ts`
- `packages/db/src/dawn-repository.ts`
- `packages/db/src/schema/core.ts`

## Acceptance Criteria

- [x] A pending extracted inbox item with matching amount, currency, date, and merchant gets a suggestion after a new transaction arrives.
- [x] The generated reverse suggestion is visible through the existing inbox list path.
- [x] Existing accept and reject use cases work for reverse-generated suggestions.
- [x] The job is idempotent by team, transaction ID, and source outbox event.
- [x] Queue handlers contain no matching scoring or business policy.
- [x] Re-running the same job does not create duplicate pending suggestions.

## Implementation Notes

- Added `matchPendingInboxForTransaction` in `packages/app`, using the existing deterministic scorer and suggestion persistence.
- Added a bounded reverse candidate repository method and Drizzle implementation for unresolved extracted inbox items.
- Added `transaction.match_pending_inbox` queue fanout for `transaction.created`, `transaction_import.committed`, and `bank_connection.synced` outbox events.
- Added a worker handler that resolves a system actor and delegates to the app use case.
- Verified with `bun test packages/app/src/inbox-matching.test.ts packages/jobs/src/index.test.ts` and `bun run check-types`.

## Verification

- [x] `bun test packages/app/src/inbox-matching.test.ts packages/jobs/src/index.test.ts`
- [x] `bun run check-types`

## Dependencies

None. This is the tracer slice.

### 2. Shared Match Engine Contract

## Goal

Make forward and reverse matching use one pure domain engine instead of one-way inbox-input semantics.

## Scope

- Replace or wrap `suggestInboxTransactionMatches` with direction-neutral types such as `DocumentMatchSubject`, `TransactionMatchSubject`, `MatchCandidate`, `MatchSignals`, `MatchDecision`, and `MatchPolicy`.
- Keep explanation generation deterministic and derived from structured signals.
- Preserve current behavior while making bidirectional use cases call the same scorer.
- Keep authoritative money values as exact minor units.

## Areas To Inspect

- `packages/domain/src/inbox-matching.ts`
- `packages/domain/src/matching.test.ts`
- `packages/domain/src/transactions.ts`
- `packages/domain/src/money.ts`
- `packages/app/src/documents-inbox.ts`

## Acceptance Criteria

- [x] Forward inbox-to-transaction and reverse transaction-to-inbox paths use the same scoring function.
- [x] The scorer emits structured amount, currency, date, name, reference, sender/domain, alias, and hard-negative signals.
- [x] Score, confidence, match type, and explanation are reproducible for the same inputs.
- [x] Existing forward matching tests pass with updated names.
- [x] Domain code remains pure and has no database, app, worker, or route imports.

## Implementation Notes

- Added `DocumentMatchSubject`, `TransactionMatchSubject`, `MatchCandidate`, `MatchSignals`, `MatchDecision`, and `MatchPolicy`.
- Moved matching policy into `scoreDocumentTransactionMatch` and `scoreDocumentTransactionMatches`; `suggestInboxTransactionMatches` remains as a compatibility wrapper.
- Added structured `signalDetails` while preserving legacy numeric suggestion signals for existing callers.
- Added hard-negative decisions at the pure scorer level, while suggestion generation still suppresses them.
- Verified forward and reverse app paths produce the same score and explanation for the same pair.

## Verification

- [x] `bun test packages/domain/src/matching.test.ts packages/domain/src/golden-datasets.test.ts packages/app/src/inbox-matching.test.ts`
- [x] `bun run check-types`

## Dependencies

Slice 1 can land first, but this should land before deeper scoring.

### 3. Production Candidate Retrieval

## Goal

Replace broad transaction scans with SQL-first, team-bounded candidate retrieval equivalent to Midday's production approach.

## Scope

- Add repository methods such as `listTransactionMatchCandidatesForInboxItem` and `listInboxMatchCandidatesForTransaction`.
- Filter by team, unresolved inbox state, posted transaction state, date windows, amount/currency proximity, existing attachments, existing pending suggestions, and explicit exclusions.
- Use provider reference, counterparty, merchant/name, invoice number, and optional text similarity as retrieval signals where available.
- Keep final ranking in domain/app scoring, not SQL.

## Areas To Inspect

- `packages/app/src/documents-inbox.ts`
- `packages/app/src/index.ts`
- `packages/db/src/dawn-repository.ts`
- `packages/db/src/schema/core.ts`
- `packages/app/src/testkit/memory-repository.ts`
- Midday reference: `ref/midday/packages/db/src/queries/transaction-matching.ts`

## Acceptance Criteria

- [x] Forward match generation no longer calls `listTransactionsForReport` for candidate retrieval.
- [x] Reverse matching retrieves bounded pending inbox candidates.
- [x] Already attached transactions/documents are excluded.
- [x] Existing pending suggestions are not duplicated.
- [x] Candidate retrieval supports deterministic ordering and a configurable limit.
- [x] App tests prove behavior with multiple plausible candidates.

## Implementation Notes

- Added `listTransactionMatchCandidatesForInboxItem` for forward candidate retrieval and replaced the report transaction scan in `generateInboxMatchSuggestions`.
- Renamed the reverse repository method to `listInboxMatchCandidatesForTransaction`.
- Drizzle retrieval now applies team scope, unresolved inbox state, extraction state, date/amount/currency windows, attachment exclusions, active-suggestion exclusions, deterministic ordering, and limits.
- App tests assert forward retrieval does not call `listTransactionsForReport` and ranks multiple plausible candidates through domain scoring.

## Verification

- [x] `bun test packages/app/src/inbox-matching.test.ts packages/jobs/src/index.test.ts`
- [x] `bun run check-types`
- No dedicated DB repository test harness exists for this matching retrieval area yet.

## Dependencies

Slice 1 or Slice 2.

### 4. Midday-Grade Deterministic Scoring

## Goal

Bring Dawn's scoring up to Midday-level capability while keeping policy in pure domain code.

## Scope

- Add robust name normalization: case folding, punctuation cleanup, company suffix removal, token overlap, containment, prefix matching, and concatenated token matching.
- Improve amount scoring with exact match, near match, percentage tolerance, and tax/VAT-inclusive hints.
- Improve date scoring using document type: receipts usually align near purchase/post date; invoices usually get paid after invoice date.
- Support invoice number, provider reference, sender, domain, counterparty, and document text hints.
- Penalize weak amount-only, zero-name, stale-date, and suspicious cross-currency matches.

## Areas To Inspect

- `packages/domain/src/inbox-matching.ts`
- `packages/domain/src/matching.test.ts`
- `packages/app/src/documents-inbox.ts`
- Midday reference: `ref/midday/packages/db/src/utils/transaction-matching.ts`
- Midday reference: `ref/midday/packages/db/src/test/transaction-matching.test.ts`

## Acceptance Criteria

- [x] Same amount/currency/date/name matches rank high.
- [x] Receipt-before-transaction timing is scored as plausible.
- [x] Invoice payment timing supports common payment windows such as immediate, net 7, net 15, net 30, net 60, and net 90.
- [x] Invoice number or domain can lift otherwise weak merchant text.
- [x] Name-only and amount-only matches stay below safe thresholds unless supported by other signals.
- [x] Scores include enough signal detail to explain why a suggestion exists.

## Implementation Notes

- Added name token normalization with company suffix removal, token overlap, containment, prefix matching, and concatenated-token matching.
- Added amount tolerance scoring for exact, near, percentage, subtotal-before-tax, and VAT-like differences while preserving exact minor-unit arithmetic.
- Added document-type-aware date scoring for receipts and invoice payment windows.
- Added sender-domain stem support and conservative risk penalties for weak amount-only or stale-date evidence.
- Added focused domain tests for delayed receipt posting, net-30 invoice timing, invoice-number lift, domain lift, amount-only false positives, and name-only false positives.

## Verification

- [x] Golden domain tests for exact receipt match, delayed bank posting, invoice payment terms, invoice-number hint, domain hint, amount-only false positive, and name-only false positive.
- [x] `bun test packages/domain/src/matching.test.ts packages/domain/src/golden-datasets.test.ts`
- [x] `bun test packages/app/src/inbox-matching.test.ts`
- [x] `bun run check-types`

## Dependencies

Slice 2.

### 5. Feedback Memory And Learning

## Goal

Make confirmed, rejected, and unmatched outcomes improve future matches per team without permanently suppressing recoverable pairs.

## Scope

- Treat accepted suggestions as positive team feedback.
- Treat rejected suggestions and manual unmatches as negative feedback.
- Distinguish exact pair suppression from similar pair penalties.
- Add decayed negative penalties so old declines matter less than recent declines.
- Let repeated recent confirmations override stale negative evidence.
- Preserve current explicit alias and hard-negative concepts, but extend memory inputs to include counts, recency, status, and normalized pair keys.

## Areas To Inspect

- `packages/domain/src/inbox-matching.ts`
- `packages/app/src/documents-inbox.ts`
- `packages/db/src/schema/core.ts`
- `packages/db/src/dawn-repository.ts`
- Midday reference: `ref/midday/packages/db/src/queries/transaction-matching.ts`

## Acceptance Criteria

- [x] Accepting a match strengthens future merchant/counterparty pairs for that team.
- [x] Rejecting a match suppresses the exact inbox/transaction pair.
- [x] Repeated similar declines lower future confidence but do not permanently block all matches.
- [x] Repeated confirmations can override stale negatives.
- [x] Feedback is strictly team-scoped.
- [x] Suggestion status history provides enough evidence for calibration.

## Implementation Notes

- Added team-scoped accepted/rejected feedback memory derived from suggestion status history.
- Passing feedback into forward and reverse matching alongside aliases and hard negatives.
- Added deterministic recency decay using the feedback set reference timestamp rather than wall-clock time.
- Exact hard negatives still suppress exact pairs; similar rejected feedback applies only as a recoverable score penalty.
- App tests now assert accepted/rejected feedback persistence from existing accept/reject flows.

## Verification

- [x] Domain tests for alias boost, exact hard-negative suppression, decayed negative penalty, confirmation override, and team isolation through team-scoped feedback input.
- [x] App tests for accepted/rejected feedback persistence.
- [x] `bun test packages/domain/src/matching.test.ts packages/app/src/inbox-matching.test.ts`
- [x] `bun run check-types`

## Dependencies

Slice 2.

### 6. Team Threshold Calibration

## Goal

Replace global hard-coded thresholds with team-specific suggested and auto-match thresholds.

## Scope

- Add a domain/app calibration policy using recent confirmed, rejected, and unmatched outcomes.
- Use conservative defaults for low-sample teams.
- Compute bounded suggested and auto-match thresholds.
- Cache or materialize calibration carefully without making it authoritative financial state.
- Include threshold and calibration metadata in match decisions for debugging.

## Areas To Inspect

- `packages/domain/src/inbox-matching.ts`
- `packages/app/src/documents-inbox.ts`
- `packages/db/src/dawn-repository.ts`
- Midday reference: `ref/midday/packages/db/src/queries/transaction-matching.ts`

## Acceptance Criteria

- [x] Low-sample teams use conservative default thresholds.
- [x] Teams with strong recent confirmation history can get slightly lower suggested thresholds.
- [x] Teams with bad precision get stricter suggested thresholds.
- [x] Auto-match threshold stays strict and bounded above suggested threshold.
- [x] Forward and reverse matching use the same calibration result.
- [x] Calibration is explainable through metadata or logs.

## Implementation Notes

- Added `calibrateMatchPolicy` in the pure domain matcher, deriving team posture from accepted/rejected suggestion feedback counts.
- Added bounded suggested and auto-match thresholds, with low-sample defaults, high-precision relaxation, low-precision tightening, and strict auto-match bounds.
- Match decisions now include threshold and calibration metadata for debugging and future evaluation tooling.
- Forward and reverse app use cases now compute one calibrated policy from team memory and filter suggestions against `policy.suggestedScoreThreshold`.
- Unmatched-outcome analysis is still deferred to the read-only evaluation harness slice because Dawn does not yet persist unmatched candidates as authoritative feedback.

## Verification

- [x] App/domain tests for low-sample defaults, high-precision history, low-precision history, confidence-gap adjustment, threshold bounds, and reverse-path threshold use.
- [x] `bun test packages/domain/src/matching.test.ts packages/app/src/inbox-matching.test.ts`
- [x] `bun run check-types`

## Dependencies

Slice 5.

### 7. Cross-Currency And Base-Currency Evidence

## Goal

Support currency/base-currency matching without using JavaScript floating point for authoritative financial state.

## Scope

- Add optional base amount minor and base currency evidence to transaction and extraction/matching subjects.
- Treat base amount as matching evidence, not as authoritative transaction money.
- Score same-currency exact matches strongest.
- Score cross-currency matches only when shared base currency, amount tolerance, date, and name evidence align.
- Keep cross-currency without base evidence low confidence.

## Areas To Inspect

- `packages/domain/src/money.ts`
- `packages/domain/src/transactions.ts`
- `packages/domain/src/inbox-matching.ts`
- `packages/app/src/documents-inbox.ts`
- `packages/db/src/schema/core.ts`
- Midday reference: `ref/midday/packages/db/src/utils/transaction-matching.ts`

## Acceptance Criteria

- [ ] Same-currency exact matches remain strongest.
- [ ] Cross-currency matches require shared base currency evidence or stay low confidence.
- [ ] Small, medium, and large cross-currency tolerances are bounded and deterministic.
- [ ] Large base-amount mismatches are rejected.
- [ ] Base amount fields use exact minor units and do not weaken authoritative money rules.

## Verification

- Domain tests for exact same-currency, plausible cross-currency, missing base amount, different base currency, and large base mismatch.
- `bun test packages/domain/src/matching.test.ts packages/domain/src/money.test.ts`
- `bun run check-types`

## Dependencies

Slice 4.

### 8. Conservative Auto-Match Policy

## Goal

Allow automatic document attachment only when score, threshold, and historical pattern evidence are strong enough.

## Scope

- Add an explicit auto-match policy gate, disabled by default or controlled by config/team setting.
- Require calibrated auto threshold, repeated confirmed merchant pattern, low negative evidence, sufficient name evidence, and no competing close candidates.
- Auto-match inside an app use case transaction.
- Write audit and outbox events for auto-match state transitions.
- Keep one-off high-confidence matches as suggestions.

## Areas To Inspect

- `packages/domain/src/inbox-matching.ts`
- `packages/app/src/documents-inbox.ts`
- `packages/db/src/dawn-repository.ts`
- `packages/jobs/src/index.ts`
- `apps/server/src/index.ts`

## Acceptance Criteria

- [ ] One-off high-confidence matches create suggestions, not automatic attachments.
- [ ] Eligible repeated merchant patterns can auto-attach when the policy is enabled.
- [ ] Auto-matches create accepted suggestion records or equivalent feedback records.
- [ ] Auto-matches attach the document, resolve the inbox item, and write audit/outbox records.
- [ ] Auto-match can be disabled without disabling suggestions.
- [ ] Rejecting or unmatching an auto-match becomes negative memory.

## Verification

- App tests for disabled auto-match, one-off high score, repeated eligible pair, competing candidate, audit/outbox writes, and rejection feedback.
- `bun run check-types`

## Dependencies

Slices 5 and 6.

### 9. Matching Evaluation Harness

## Goal

Make matcher quality measurable before tuning thresholds or enabling auto-match.

## Scope

- Add a read-only evaluation command or app test harness that replays historical suggestions/outcomes.
- Report likely false positives, likely false negatives, threshold quality, score distributions, and top review candidates.
- Support team/date filters and a fixed-threshold override.
- Ensure any DB-backed command runs in a read-only transaction where possible and rolls back.

## Areas To Inspect

- `packages/domain/src/inbox-matching.ts`
- `packages/app/src/documents-inbox.ts`
- `packages/db/src/dawn-repository.ts`
- `packages/db/package.json`
- Midday reference: `ref/midday/packages/db/src/scripts/matching-eval-db.ts`

## Acceptance Criteria

- [ ] Evaluation can run without mutating production data.
- [ ] Output shows confirmed, rejected, unmatched, suggested, and auto-match performance buckets.
- [ ] Output highlights likely false positives and false negatives with inspectable IDs.
- [ ] Team/date filters are supported.
- [ ] The command is documented enough for an agent or engineer to run locally.

## Verification

- Unit tests against fixtures.
- Manual local command run against seed or development data.
- `bun run check-types`

## Dependencies

Slices 4, 5, and 6.

## Dependencies

Recommended order:

1. Reverse Matching Tracer
2. Shared Match Engine Contract
3. Production Candidate Retrieval
4. Midday-Grade Deterministic Scoring
5. Feedback Memory And Learning
6. Team Threshold Calibration
7. Cross-Currency And Base-Currency Evidence
8. Conservative Auto-Match Policy
9. Matching Evaluation Harness

Slices 7 and 8 can be deferred if the immediate milestone is bidirectional suggestions only. Slice 9 should land before auto-match is enabled for real teams.

## Suggested First Slice

Start with Slice 1: Reverse Matching Tracer.

This closes the largest Midday parity gap in the current Dawn baseline: a Gmail receipt can arrive first, extraction can finish, and a later bank transaction can create the match suggestion automatically. Keep it suggestion-only, idempotent, and app-use-case-owned. That creates real product signal while leaving scoring, thresholds, and auto-match policy room to deepen safely.
