# Implementation PRD: Dawn End-State Business Operating System

Triage: ready-for-agent
Publication: Local repo artifact. No project issue tracker or remote is configured yet.
Source material: `docs/PRD.md`, `docs/product/CRM-BACKEND-DATA-MODEL-PRD.md`, `CONTEXT.md`, `CONTEXT-MAP.md`, current repo structure, and the Midday reference clone in `ref/midday`.
Status: Draft for implementation planning
Date: 2026-06-14

## Problem Statement

The user wants to build a better version of Midday inside this repo, not copy Midday's implementation. The current repo is a clean Better-T-Stack starter with React, TanStack Router, Hono, oRPC, Better Auth, Drizzle, Postgres, Electrobun, and a Cloudflare deployment scaffold. It does not yet have the domain model, application boundary, financial data model, event backbone, worker system, integration architecture, TanStack DB sync model, or TanStack AI assistant required for the desired product.

From the user's perspective, the problem is that Midday proves the product surface is valuable, but its architecture is not the optimal end-state for this repo. Dawn needs a design that is easier to reason about, easier for agents to extend, safer for financial data, better aligned with Cloudflare primitives, and explicit about where business rules live.

The product must support serious business workflows: teams, permissions, banking, transactions, documents, inbox, matching, invoices, customers, projects, reporting, automations, integrations, public API, desktop shell, and AI assistance. These workflows must share one domain and application model instead of drifting across UI code, API handlers, background workers, webhooks, and assistant tools.

## Solution

Build Dawn as a Cloudflare-first business operating system with Postgres as the authoritative store, a strict domain/application boundary, event-driven jobs, TanStack DB-powered client sync, and TanStack AI-powered assistant experiences.

The solution is an end-state architecture with these properties:

- One canonical domain model for teams, actors, permissions, money, ledger, documents, inbox, matching, CRM customer graph, invoices, customers, projects, integrations, jobs, sync, and AI tools.
- One application layer that owns use cases, authorization, transactions, idempotency, audit logs, outbox events, and provider port calls.
- Thin transports for oRPC, REST, webhooks, worker jobs, automations, and assistant tools.
- Postgres as the system of record for financial and operational state.
- R2 for documents, exports, generated PDFs, and attachments.
- Durable Objects for tenant-local coordination, presence, realtime fanout, progress, locks, and sync session state.
- Cloudflare Queues and Workflows for retryable and durable background work.
- Trigger.dev only as an execution adapter when it materially improves long-running workflow reliability or visibility.
- TanStack DB for reactive, authorized, cursor-based client collections with optimistic updates where safe.
- TanStack AI for assistant state, streaming UX, typed tool interactions, approval gates, and grounded AI flows.
- Provider adapters isolated behind stable ports so banking, accounting, payments, email, messaging, storage, OCR, and AI providers can be swapped.
- A durable outbox backbone so state changes drive jobs, realtime invalidation, analytics, notifications, search indexing, and external webhooks.

## User Stories

1. As an owner, I want to create a team, so that my business data is isolated from my personal account and other teams.
2. As an owner, I want to invite team members, so that collaborators can work inside the same business workspace.
3. As an owner, I want role-based permissions, so that accountants, members, admins, and viewers only see and do what they are allowed to.
4. As an owner, I want to manage API keys per team, so that external systems can integrate without sharing my login.
5. As an owner, I want OAuth apps to request scoped permissions, so that integrations can be granted limited access.
6. As an accountant, I want access to client teams, so that I can review transactions, documents, invoices, and reports.
7. As a viewer, I want read-only access, so that I can inspect business health without risking accidental changes.
8. As a system actor, I want every request to resolve actor, team, permissions, and request ID, so that actions are traceable.
9. As an owner, I want to connect bank accounts, so that transactions and balances can be imported automatically.
10. As an owner, I want multiple banking providers supported through one product model, so that provider differences do not leak into my workflow.
11. As an owner, I want manual CSV transaction imports, so that I can use the product even before bank-provider coverage exists.
12. As an owner, I want duplicate transaction detection, so that imports and provider syncs do not corrupt my ledger.
13. As an owner, I want to disconnect a bank provider without losing historical transactions, so that provider churn does not destroy records.
14. As a member, I want to see a dense transaction table, so that I can review many transactions quickly.
15. As a member, I want to filter transactions by account, date, category, tag, customer, and review state, so that I can focus on the right work.
16. As a member, I want to categorize transactions inline, so that review is fast.
17. As a member, I want to tag transactions, so that reporting and custom views can match how my business works.
18. As a member, I want to mark transactions reviewed, so that the team knows what still needs attention.
19. As an owner, I want transaction edits to be auditable, so that financial changes can be explained later.
20. As an owner, I want exact money handling, so that reports and invoice totals are correct.
21. As an owner, I want transfer detection, so that moving money between accounts does not look like income or expense.
22. As an owner, I want transaction splits, so that one bank transaction can map to multiple business categories when necessary.
23. As an owner, I want cashflow, profit, revenue, expense, balance, and category reports, so that I can understand business health.
24. As an owner, I want reports to drill into source transactions, so that every number can be explained.
25. As a user, I want to upload receipts and documents, so that business artifacts are stored with the records they support.
26. As a user, I want to forward emails into an inbox, so that vendor invoices and receipts can enter the system without manual upload.
27. As a user, I want uploaded files stored securely, so that sensitive documents are not exposed.
28. As a user, I want document metadata in the business database, so that files can be searched, matched, reviewed, and audited.
29. As a user, I want document extraction, so that merchant, date, amount, currency, invoice number, tax, and line-item data can be prefilled.
30. As a user, I want extraction results to be versioned, so that corrections and model changes do not erase prior state.
31. As a user, I want duplicate document detection, so that the inbox does not fill with repeated uploads.
32. As a user, I want inbox items to show extraction confidence, so that I know when to trust a suggestion.
33. As a user, I want to match documents to transactions, so that receipts and invoices support the ledger.
34. As a user, I want match suggestions to explain their reasoning, so that I can accept or reject them confidently.
35. As a user, I want rejected matches remembered, so that bad suggestions do not keep returning.
36. As a user, I want accepted matches to teach aliases, so that recurring vendors are easier to match.
37. As an owner, I want low-confidence matches to require review, so that automation does not silently attach wrong documents.
38. As an owner, I want to create customers, so that invoices, projects, documents, and transactions can be associated with real business relationships.
39. As an owner, I want customer contacts and billing details, so that invoice sending is reliable.
40. As an owner, I want to create products and services, so that invoice line items are reusable and consistent.
41. As an owner, I want to create invoice drafts, so that billing work can be prepared before anything is sent.
42. As an owner, I want invoice previews and PDFs, so that invoices look correct before customers receive them.
43. As an owner, I want to send invoices by email, so that customers can be billed from the product.
44. As an owner, I want invoice send events to be audited, so that external communication is traceable.
45. As an owner, I want to record manual invoice payments, so that bank transfers and offline payments can be tracked.
46. As an owner, I want payment provider events to update invoices, so that payment status stays current.
47. As an owner, I want recurring invoices, so that repeat billing can run without manual recreation.
48. As an owner, I want invoice reminders, so that overdue payments can be followed up consistently.
49. As an owner, I want invoice lifecycle states, so that draft, sent, viewed, paid, overdue, and void invoices are unambiguous.
50. As a consultant, I want projects linked to customers, so that work can be organized by client.
51. As a team member, I want to track time, so that billable and non-billable work is recorded.
52. As an owner, I want billable time converted into invoice lines, so that billing matches work performed.
53. As an owner, I want utilization and billable-value reports, so that I can understand team productivity.
54. As an owner, I want weekly business insights, so that I can see important changes without manually building reports.
55. As an owner, I want insights to cite source records, so that the explanation can be trusted.
56. As a user, I want a global assistant, so that I can ask business questions from any page.
57. As a user, I want the assistant to understand current page context, so that questions can be shorter and more natural.
58. As a user, I want the assistant to search transactions, invoices, documents, customers, projects, and reports, so that it can answer grounded questions.
59. As a user, I want the assistant to draft invoices, categories, emails, and automations, so that repetitive work is faster.
60. As an owner, I want risky AI actions to require approval, so that AI cannot silently send invoices or alter external systems.
61. As an owner, I want AI tool calls logged, so that assistant actions can be audited.
62. As an owner, I want AI evaluations, so that classification, matching, extraction, and tool selection quality can be measured over time.
63. As an owner, I want automations triggered by domain events, so that recurring operational work can run reliably.
64. As an owner, I want automation runs logged, so that I can see what happened and why.
65. As an owner, I want integration connection status, so that failed syncs are visible and actionable.
66. As a developer, I want provider adapters behind stable ports, so that adding a provider does not rewrite domain or application logic.
67. As a developer, I want public API scopes to map to product permissions, so that external access follows the same rules as the app.
68. As a developer, I want OpenAPI generated from contracts, so that API clients can integrate safely.
69. As a developer, I want webhook subscriptions for domain events, so that external systems can react to business changes.
70. As a developer, I want idempotency keys on mutations, so that retries do not duplicate sensitive operations.
71. As a system operator, I want job runs, retries, and dead letters visible, so that background work can be debugged.
72. As a system operator, I want structured logs with request, actor, team, and operation metadata, so that production issues can be traced.
73. As a system operator, I want queue depth, job failure, provider failure, AI cost, and sync lag metrics, so that reliability can be measured.
74. As a system operator, I want Durable Objects used for coordination rather than financial storage, so that edge state does not become an inconsistent database.
75. As a user, I want realtime updates when teammates change shared records, so that the UI does not feel stale.
76. As a user, I want optimistic updates for safe edits, so that common actions feel instant.
77. As an owner, I want unsafe actions to wait for server confirmation, so that sensitive state does not appear complete before it is durable.
78. As a desktop user, I want a native shell around the web app, so that I can use tray, notifications, deep links, and file capture.
79. As a desktop user, I want quick capture for files and receipts, so that business artifacts can be sent to the inbox with minimal friction.
80. As a future agent, I want clear repo context, ADRs, and work slices, so that I can implement without rediscovering the product architecture.

## Implementation Decisions

- Build the system around deep modules rather than shallow feature folders. The important deep modules are domain, application, jobs, integrations, sync, AI, database, auth, API transport, infrastructure, UI, and worker runtime.
- The domain module owns pure business rules, value objects, state machines, deterministic matching, money handling, invoice lifecycle, and domain events. It has no database, provider, auth, HTTP, UI, queue, or AI runtime dependencies.
- The application module owns use cases. It receives actor, team, permissions, request ID, idempotency key, locale, timezone, and feature flags through a request context. It enforces authorization, starts database transactions, calls domain rules, writes audit logs, writes outbox events, and calls provider ports.
- API transports remain thin. oRPC, REST, webhooks, worker jobs, automations, and assistant tools validate transport input, build application context, call use cases, and map typed errors.
- The database module owns Drizzle schema, migrations, repositories, transaction helpers, outbox persistence, idempotency keys, audit log persistence, and row mapping. It does not own business decisions.
- Postgres is the authoritative store for financial and operational state. R2 stores files and generated artifacts. Vector/search stores are derived projections. KV and cache are only for low-risk metadata, feature flags, or cacheable lookups.
- Durable Objects are used for per-tenant coordination: realtime fanout, presence, sync sessions, operation locks, import progress, and near-term duplicate request protection. Durable Objects are not used as the ledger or document database.
- The outbox event model is required for important state transitions. Events drive queues, workflows, realtime invalidations, analytics, notifications, search indexing, external webhooks, and AI context refresh.
- Cloudflare Queues are the default async execution path for retryable jobs that fit Worker runtime limits.
- Cloudflare Workflows are the default for durable multi-step processes such as bank initial sync, document extraction, invoice reminder lifecycle, accounting sync, and bulk import.
- Trigger.dev is allowed only behind job contracts when runtime requirements, long-running workflow visibility, or third-party SDK constraints justify it.
- A regional Bun/Node worker pool may be added behind the same job contracts for heavy PDF rendering, large CSV parsing, provider SDKs, OCR, or memory-heavy accounting exports.
- TanStack DB is used for reactive client collections, not as the authority. Collections require server-owned authorization, cursor policy, conflict policy, mutation capability declarations, and redaction rules.
- Optimistic updates are allowed for safe edits such as tags, categories, marking inbox items done, draft invoice changes, customer metadata, and time entries. Sending invoices, recording payments, deleting financial records, changing team roles, connecting banks, and exporting to accounting providers require server confirmation.
- TanStack AI is used for assistant UX, streaming interaction state, typed tool-call UI, page-context-aware assistance, and AI-enabled product flows.
- AI tools are wrappers around application use cases. Each tool declares name, input schema, output schema, required permission, risk level, approval behavior, audit behavior, and rate limit policy.
- AI risk levels are read, suggest, draft, mutate, and external side effect. External side effects require explicit approval unless a configured automation permits them.
- Financial amounts use exact representations. Authoritative calculations must not use JavaScript floating point. A money value object should handle currency, minor units, exact decimal strings where needed, exchange rates, and base-currency reporting values.
- Provider adapters normalize external data into canonical application records and preserve raw provider payloads enough for debugging and reconciliation.
- Webhooks verify signatures before mutable work and store provider webhook events for idempotency and observability.
- The public API is versioned, scoped, rate-limited, idempotent for mutations, and generated into OpenAPI from typed contracts.
- Billing and subscription concerns stay integrated with the auth/payment layer but product entitlements are enforced in application use cases.
- The desktop app remains a shell around the same web product. Native behavior should focus on deep links, notifications, tray, quick capture, and file handoff.
- ADRs are required for Cloudflare runtime boundaries, Postgres authority, Durable Object usage, application-layer ownership, outbox model, TanStack DB sync, TanStack AI tools, Trigger.dev criteria, money representation, provider adapter boundaries, and public API scopes.

## Testing Decisions

- Good tests assert externally visible behavior and stable contracts, not private implementation details.
- Domain tests should cover money math, invoice totals, invoice lifecycle transitions, transaction classification, deterministic matching, permission-independent state transitions, and edge cases around dates, currencies, and rounding.
- Application tests should run use cases against a test database or repository fakes that preserve transaction semantics. They should assert authorization, idempotency, audit writes, outbox writes, command results, typed errors, and rollback behavior.
- API contract tests should cover oRPC, REST, webhook, and public API behavior through transport-level inputs and outputs, including auth failures, validation errors, scope errors, idempotency replay, and OpenAPI generation.
- Database tests should cover schema constraints, migrations, repository behavior, transaction boundaries, outbox persistence, audit persistence, and tenant scoping.
- Job tests should cover job payload schema validation, retry behavior, idempotency, dead-letter paths, workflow progress, and worker-to-application handoff.
- Integration tests should cover provider adapter normalization, webhook verification, raw payload preservation, provider error mapping, and sync idempotency.
- Sync tests should cover collection authorization, cursors, invalidation, conflict policies, optimistic mutation confirmation, and server correction after stale client state.
- AI tests should cover tool schemas, permission enforcement, approval gates, retrieval scoping, grounded answer behavior, refusal behavior, and audit logging.
- AI evaluations should cover transaction categorization, inbox matching, receipt extraction, invoice drafting, cashflow explanation, tool selection, and false mutation avoidance.
- UI tests should focus on critical workflows: onboarding/team selection, transaction review, document upload/inbox resolution, invoice creation/send confirmation, assistant approval flow, and realtime/sync refresh behavior.
- Prior art in the current repo is limited because it is still a starter. Use the existing package boundaries and script conventions, but add test patterns as the first meaningful behavior is implemented.

## Out of Scope

- Rebuilding Midday line-for-line.
- Payroll.
- Tax filing as a regulated filing service.
- Bank custody or money movement as a financial institution.
- Payment facilitation beyond integrating with payment providers.
- Full ERP scope.
- Offline-first financial mutation support.
- Separate native desktop product logic.
- Deep two-way accounting sync until the adapter boundary and ledger model are stable.
- Public marketplace for third-party apps until public API, OAuth scopes, and webhook delivery are stable.
- AI silently executing high-risk external side effects.
- Using Durable Objects, KV, browser storage, vector search, or TanStack DB as authoritative financial storage.

## Further Notes

This PRD is the implementation-oriented companion to the broader product PRD. It intentionally avoids locking implementation to brittle file paths. The current local equivalent of issue-tracker publication is this document marked `ready-for-agent`.

Before broad implementation begins, the first useful work should create accepted ADRs and a thin tracer slice that proves the intended architecture with one small, observable business workflow. The best tracer is a team-scoped transaction review path because it exercises actor/team context, permissions, domain rules, database persistence, audit/outbox behavior, API transport, TanStack DB sync shape, and UI behavior without requiring real banking providers.
