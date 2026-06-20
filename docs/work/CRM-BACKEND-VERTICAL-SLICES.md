# CRM Backend Ultimate Vertical Slices

Triage: ready-for-agent
Publication: Local repo artifact. No project issue tracker or remote is assumed.
Status: Active execution plan
Date: 2026-06-20

This is the single working file for continuing Dawn's CRM backend/data-model implementation.

## Source Of Truth

- Product architecture: `docs/PRD.md`
- CRM end-state PRD: `docs/product/CRM-BACKEND-DATA-MODEL-PRD.md`
- Domain language: `CONTEXT.md`
- Code map: `CONTEXT-MAP.md`
- Architecture decisions: `docs/adr/`
- Reference repos: `ref/`

Reference repos reduce guesswork, but they are not requirements. Dawn's source-of-truth requirements are the PRD, context docs, and ADRs.

## Outcome

When all slices are done, Dawn has a Swedish B2B CRM backend where:

- Team/tenant-scoped CRM records share a record envelope for ownership, lifecycle, versioning, custom fields, access, audit, search, and relations.
- Better Auth remains the identity plane and maps into Dawn tenant, membership, principal, actor, and authorization context through explicit links.
- Real external parties are separate from the team's commercial account relationship to them.
- Organizations, people, accounts, opportunities, commercial documents, contracts, engagements, tasks, notes, assets, payments, integrations, workflows, reports, and AI insights use application use cases instead of route-specific business rules.
- Built-in CRM fields stay strongly typed, while customer-specific fields, objects, and relationships use typed metadata extensions.
- Every mutation resolves actor, team/tenant, permissions, idempotency, expected version, audit, domain events, and outbox publication.
- Integration and registry data has source links, field authority, provenance, sync state, webhook receipts, conflict handling, outbound idempotency, and GDPR tombstone awareness.
- TIC.io-style registry data supports search, enrichment, observations, monitoring, and prospecting without becoming CRM source of truth.
- Search, timeline, reporting facts, and AI recommendations are rebuildable projections, not canonical business data.
- GDPR consent, suppression, retention, deletion jobs, legal holds, and tombstones are executable backend behavior.

## Current Baseline

### Done: Reference Mining And Boundary Notes

The reference-repo mining pass is complete and folded into this file. Use the reference map below before opening `ref/` for a slice.

Boundary docs already created in this workstream:

- `docs/adr/0012-auth-and-registry-providers-are-boundary-layers.md`
- `docs/product/CRM-BACKEND-DATA-MODEL-PRD.md`

### Done: CRM Customer Graph Tracer

The tracer is implemented in the current worktree. It proves a thin end-to-end path through domain, database, app use cases, and API.

Implemented files:

- `packages/domain/src/crm.ts`
- `packages/domain/src/events.ts`
- `packages/domain/src/identity.ts`
- `packages/domain/src/index.ts`
- `packages/domain/src/permissions.test.ts`
- `packages/db/src/schema/crm.ts`
- `packages/db/src/schema/index.ts`
- `packages/db/src/dawn-repository.ts`
- `packages/db/src/migrations/0028_crm_customer_graph_tracer.sql`
- `packages/db/src/migrations/meta/_journal.json`
- `packages/app/src/crm.ts`
- `packages/app/src/crm.test.ts`
- `packages/app/src/index.ts`
- `packages/api/src/routers/index.ts`
- `packages/api/src/router.test.ts`
- `CONTEXT.md`

Completed behavior:

- Team-scoped organization, account, and opportunity creation through app use cases.
- Idempotency replay returns the original result without duplicates.
- Cross-team access returns `NOT_FOUND` for inaccessible organization/account records.
- Viewer write attempts return `FORBIDDEN`.
- Money validates safe integer amounts and ISO 4217 currency format.
- Every mutation writes audit and outbox events.
- Account summary returns organization, account, and open opportunities.

Verified by the implementing agent:

- `bun run check-types`
- `bun test packages/app/src/crm.test.ts`
- `bun test packages/api/src/router.test.ts`
- `bun test packages/domain/src/permissions.test.ts`

Before starting the next slice, quickly rerun the relevant tests if the worktree has changed.

### Done: CRM Permissions And Request Context

The permission/request-context slice is implemented for the current CRM tracer boundary. Later slices that introduce CRM update, search, export, worker, integration, automation, or assistant entrypoints must reuse the same request context and CRM access helpers instead of adding route-local authorization.

Implemented files:

- `packages/domain/src/crm-permissions.ts`
- `packages/domain/src/crm-permissions.test.ts`
- `packages/domain/src/index.ts`
- `packages/app/src/index.ts`
- `packages/app/src/request-context.test.ts`
- `packages/app/src/crm.ts`
- `packages/app/src/crm.test.ts`
- `packages/db/src/schema/crm.ts`
- `packages/db/src/dawn-repository.ts`
- `packages/db/src/migrations/0029_crm_permissions_request_context.sql`
- `packages/db/src/migrations/meta/_journal.json`
- `packages/api/src/routers/index.ts`
- `packages/api/src/router.test.ts`

Completed behavior:

- App request context carries actor, team, principal, session, membership, correlation ID, and idempotency key.
- CRM object permissions map to organization, account, and opportunity read/write actions.
- Record grants can allow read access without full team CRM read capability.
- Field security can redact selected fields and reject selected writes.
- CRM reads mask unauthorized records as `NOT_FOUND`.
- API-key and other non-user actors use explicit actor permissions and effective principal IDs.

Verified by the implementing agent:

- `bun run check-types`
- `bun test packages/domain/src/crm-permissions.test.ts packages/domain/src/permissions.test.ts packages/app/src/request-context.test.ts packages/app/src/crm.test.ts packages/api/src/context.test.ts packages/api/src/router.test.ts`

## Reference Repo Map

Use reference repos as behavior and architecture input. Do not copy code from AGPL/GPL/source-available references.

| Repo               | License posture                    | Best use                                                                                                                                                       | Do not use for                                                                                                        |
| ------------------ | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `ref/open-mercato` | MIT                                | Modular CRM/ERP foundation, tenant/org scoping, command/undo/audit, events, workflows, AI tool packs, module override contracts.                               | Copying its full framework shape into Dawn; Dawn keeps `packages/domain` and `packages/app` as the business boundary. |
| `ref/twenty`       | AGPL/commercial markers            | Custom object/field metadata, workspace metadata caches, object/field permissions, row-level predicates, app-as-code product model.                            | Code copying or turning Dawn into a generic CRM object engine.                                                        |
| `ref/nextcrm-app`  | MIT                                | Concrete CRM workflow implementation: invoices, activities, targets, enrichment, MCP inventory, vector search.                                                 | Data model, global roles, direct Prisma mutations, non-atomic audit/event dispatch.                                   |
| `ref/atomic-crm`   | MIT                                | Lean CRM UX, contact/company/deal/task/note flows, import/export, merge contacts, activity feed, email-to-note capture.                                        | Backend architecture, tenancy, audit, or permission model.                                                            |
| `ref/erpjs`        | MIT                                | Sales invoice domain, document numbering, VAT/tax, Factur-X/ZUGFeRD XML/PDF invoice references, ERP customer/product/currency model.                           | Modern app architecture or CRM authorization.                                                                         |
| `ref/erxes`        | AGPL/source-available restrictions | Plugin architecture, automations, segments, omnichannel/frontline, module permissions, AI agent memory/workflows.                                              | Code copying or adopting Mongo/GraphQL federation/microfrontend complexity by default.                                |
| `ref/midday`       | AGPL                               | Business operating system breadth, invoices, recurring invoice schedules, provider packages, banking/accounting/document/workflow surfaces, MCP/product scope. | Copying implementation code or accepting its query/router business-rule spread.                                       |

Reference-use format for future slice notes or PR descriptions:

```text
Reference: ref/<repo>/<path>
Use: mine | adapt | avoid | optional
Reason: <one sentence>
Boundary: <Dawn rule that still controls the implementation>
```

## Slice Reference Matrix

| Slice area                        | First references to inspect                                                                                                                                                                                                                                                                                                         | Classification |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| Customer graph                    | `ref/open-mercato/packages/core/src/modules/customers/README.md`, `ref/open-mercato/packages/core/src/modules/customers/data/entities.ts`, `ref/atomic-crm/src/components/atomic-crm/deals`                                                                                                                                         | adapt          |
| Tenant and org scoping            | `ref/open-mercato/packages/core/src/modules/directory`, `ref/open-mercato/packages/core/src/modules/customers/data/entities.ts`, `ref/twenty/packages/twenty-server/src/engine/workspace-cache-storage/workspace-cache-storage.service.ts`                                                                                          | adapt          |
| Permissions and field security    | `ref/twenty/packages/twenty-server/src/engine/metadata-modules/object-permission`, `ref/twenty/packages/twenty-server/src/engine/metadata-modules/flat-row-level-permission-predicate`, `ref/open-mercato/packages/core/src/modules/customers/acl.ts`                                                                               | adapt          |
| Custom fields and custom objects  | `ref/twenty/packages/twenty-server/src/engine/metadata-modules/field-metadata`, `ref/twenty/packages/twenty-server/src/engine/metadata-modules/flat-field-metadata`, `ref/open-mercato/packages/core/src/modules/customers/README.md`                                                                                               | adapt          |
| Commercial documents and payments | `ref/nextcrm-app/actions/invoices`, `ref/midday/packages/db/src/queries/invoices.ts`, `ref/midday/apps/worker/src/processors/invoices`, `ref/midday/packages/invoice/src`, `ref/erpjs/apps/api/src/model/lib/sales.invoice.service.ts`, `ref/erpjs/apps/api/src/model/lib/document.numbering.service.ts`, `ref/erpjs/docs/Factur-X` | mine/adapt     |
| Activities, notes, timeline       | `ref/atomic-crm/src/components/atomic-crm/activity`, `ref/atomic-crm/src/components/atomic-crm/notes`, `ref/nextcrm-app/prisma/schema.prisma`, `ref/open-mercato/packages/core/src/modules/customers/api/activities/route.ts`                                                                                                       | adapt          |
| Duplicate handling and merge      | `ref/atomic-crm/supabase/schemas/02_functions.sql`, `ref/atomic-crm/src/components/atomic-crm/providers/commons/mergeContacts.ts`                                                                                                                                                                                                   | adapt          |
| Email and communication capture   | `ref/atomic-crm/supabase/functions/postmark`, `ref/open-mercato/packages/channel-imap`, `ref/open-mercato/packages/channel-gmail`, `ref/erxes/backend/plugins/frontline_api`                                                                                                                                                        | adapt          |
| Audit, undo, and action history   | `ref/open-mercato/packages/core/src/modules/audit_logs`, `ref/open-mercato/packages/core/src/modules/customers/__integration__/TC-UNDO-001-companies.spec.ts`, `ref/nextcrm-app/lib/audit-log.ts`                                                                                                                                   | adapt/avoid    |
| Events, workflows, automations    | `ref/open-mercato/packages/events`, `ref/open-mercato/packages/core/src/modules/workflows`, `ref/erxes/backend/services/automations/src`, `ref/erxes/backend/core-api/src/meta/automations`                                                                                                                                         | adapt          |
| AI tools and assistants           | `ref/open-mercato/packages/core/src/modules/customers/ai-tools.ts`, `ref/open-mercato/packages/ai-assistant`, `ref/twenty/packages/twenty-server/src/engine/metadata-modules/ai`, `ref/erxes/backend/plugins/erxes-agent_api`                                                                                                       | adapt          |
| Search and projections            | `ref/nextcrm-app/inngest/functions/embed-account.ts`, `ref/open-mercato/packages/search`, `ref/twenty/packages/twenty-shared/src/database-events`                                                                                                                                                                                   | adapt          |

## Reference Mining Ledger

### Commercial Documents, Invoices, Payments, And Delivery

Reference: `ref/nextcrm-app/actions/invoices/create-invoice.ts`, `ref/nextcrm-app/actions/invoices/update-invoice.ts`, `ref/nextcrm-app/lib/invoices/totals.ts`  
Use: adapt  
Reason: The draft invoice flow proves line-level quantity, unit price, discount, tax, totals, VAT breakdown, and activity logging as an understandable first commercial-document lifecycle.  
Boundary: Dawn should keep monetary values in exact minor units and typed document-line tables, not Prisma `Decimal` action code or JSON blobs.

Reference: `ref/nextcrm-app/actions/invoices/issue-invoice.ts`, `ref/nextcrm-app/lib/invoices/numbering.ts`, `ref/nextcrm-app/prisma/migrations/20260415164939_invoices_module/migration.sql`  
Use: adapt  
Reason: Invoice issue should consume a number inside the issuance transaction, snapshot customer/supplier/tax/payment data, recompute totals, capture base-currency FX, and then queue PDF/XML generation after commit.  
Boundary: Dawn should make issuance idempotent by command key and transactional outbox; PDF/XML failure must not roll back legal issuance.

Reference: `ref/nextcrm-app/lib/invoices/permissions.ts`, `ref/nextcrm-app/actions/invoices/cancel-invoice.ts`, `ref/nextcrm-app/actions/invoices/duplicate-invoice.ts`, `ref/nextcrm-app/actions/invoices/send-invoice-email.ts`, `ref/nextcrm-app/__tests__/invoices/lifecycle.test.ts`  
Use: mine  
Reason: Useful lifecycle expectations are draft-only editing, draft duplication from an existing document, issued/sent/partially-paid/paid/overdue/cancelled/disputed/refunded/written-off status vocabulary, email delivery status, and tests that prove issued documents cannot be edited.  
Boundary: Dawn must evaluate status transitions through app use cases, record status history, audit/outbox events, and CRM permission context instead of role checks in actions.

Reference: `ref/midday/packages/db/src/schema.ts`, `ref/midday/packages/db/src/queries/invoices.ts`, `ref/midday/packages/invoice/src/token/index.ts`, `ref/midday/apps/worker/src/processors/invoices/generate-invoice.ts`, `ref/midday/apps/worker/src/processors/invoices/send-invoice-email.ts`, `ref/midday/apps/worker/src/processors/invoices/schedule-invoice.ts`  
Use: adapt  
Reason: Midday adds product-grade invoice behavior: public invoice token, viewed timestamp, scheduled send, email sent timestamp/recipient, file path/size, payment intent, refund timestamp, template snapshots, PDF generation worker, optional email attachment, and stale scheduled-job protection.  
Boundary: Dawn should represent public access as scoped document-share tokens with auditable views, use outbox/jobs for rendering and delivery, and avoid JSON-heavy canonical invoice data.

Reference: `ref/midday/docs/invoice-recurring.md`, `ref/midday/packages/db/src/queries/invoice-recurring.ts`, `ref/midday/packages/db/src/utils/invoice-recurring.ts`, `ref/midday/apps/worker/src/processors/invoices/generate-recurring.ts`, `ref/midday/apps/worker/src/processors/invoices/upcoming-notification.ts`, `ref/midday/packages/db/migrations/0010_add_invoice_recurring.sql`  
Use: adapt  
Reason: Recurring invoices need an explicit series state machine, timezone-aware schedules, sequence numbers, unique `(series, sequence)` idempotency, due-series batching, failure counters with auto-pause, upcoming notifications, and "invoice exists but delivery pending" recovery.  
Boundary: Dawn should connect recurring document generation to subscriptions/contracts and workflow/action ledgers, not create hidden scheduler writes outside app use cases.

Reference: `ref/midday/packages/db/migrations/0008_add_invoice_payments.sql`, `ref/midday/packages/db/src/queries/invoices.ts`, `ref/midday/packages/jobs/src/tasks/invoice/operations/check-status.ts`, `ref/midday/packages/jobs/src/tasks/invoice/notifications/send-notifications.ts`  
Use: mine  
Reason: Payment provider intent IDs, refund timestamps, overdue checks, payment notifications, and bank-transaction matching are important payment and reconciliation surfaces.  
Boundary: Dawn should store provider payment identifiers as external links/provenance and create idempotent payment allocations; automatic bank matches should be explainable proposals or audited app commands.

Reference: `ref/midday/packages/app-store/src/e-invoice/config.ts`, `ref/erpjs/docs/Factur-X`, `ref/erpjs/apps/api/src/model/lib/sales.invoice.service.ts`, `ref/erpjs/apps/api/src/model/lib/document.numbering.service.ts`  
Use: mine/adapt  
Reason: Swedish/EU B2B invoicing should leave room for Peppol/e-invoice and Factur-X/ZUGFeRD-style XML/PDF outputs, plus durable document numbering and tax/legal snapshots.  
Boundary: Dawn should put network-specific delivery and XML generation behind provider adapters and document rendering jobs, not in the canonical document model.

Reference: `ref/midday/packages/db/src/queries/reports.ts`, `ref/midday/packages/db/src/queries/invoices.ts`, `ref/midday/packages/db/src/queries/invoice-recurring.ts`  
Use: mine  
Reason: Invoice data feeds outstanding invoices, overdue alerts, payment score, recurring revenue projection, scheduled invoice forecast, and balance-sheet/accounts-receivable views.  
Boundary: Dawn should build these as reporting facts/projections from commercial documents, payments, events, and recurring schedules, with currency conversion provenance and no double-counting of subscription/recurring revenue.

## Horizontal Temptations To Avoid

- Do not create every PRD table in one migration before a working vertical behavior needs it.
- Do not build a generic EAV/object engine for built-in fields such as opportunity amount, document status, organization number, invoice totals, or stage history.
- Do not replace existing billing models in one broad rewrite; bridge through account-facing and document-facing use cases.
- Do not make backend-only, frontend-only, test-only, or cleanup-only tickets unless they leave behind standalone observable value.
- Do not let provider adapters, registry adapters, webhook handlers, workers, or AI tools write canonical CRM records directly.
- Do not let Better Auth organizations, teams, memberships, or roles become Dawn's CRM tenant, principal, record-access, field-security, workflow, export, or AI-tool authorization model.
- Do not put TIC.io or other provider IDs directly on `Organization` as canonical identity.
- Do not let registry or enrichment silently overwrite user-authored CRM values.
- Do not treat search, vector indexes, timeline, reports, metadata caches, or AI outputs as source of truth.
- Do not copy NextCRM schema, global roles, direct Prisma mutations, non-atomic audit writes, or MCP handlers as Dawn implementation patterns.
- Do not copy Midday's JSON-heavy invoice content model, offset pagination, RLS posture, or worker/database writes as Dawn implementation patterns.
- Do not consume invoice numbers by scanning existing invoice numbers or counting rows; legal document numbering must be a transactionally locked series.
- Do not adopt plugin/microservice/module-federation complexity unless a slice proves Dawn needs that boundary.

## Ordered Slices

### 0. CRM Boundary And Reference Contract

Status: done

## Goal

Make the migration contract explicit before schema or use-case work spreads.

## Scope

- Define `team` as Dawn's current tenant boundary and the CRM PRD's `tenant` equivalent.
- Define Better Auth as identity plane, not CRM tenant/authorization source of truth.
- Define registry providers as external data sources, not canonical CRM IDs.
- Define reference-repo mining rules and the avoid list.
- Document the first bounded object set for the tracer.

## Acceptance Criteria

- [x] Durable ADR covers Better Auth boundary and registry-provider boundary.
- [x] CRM PRD exists as the detailed end-state source of truth.
- [x] Reference repo map is available in this file.
- [x] Future slices can cite this file instead of reinterpreting every reference repo.

## Verification

- Read `docs/adr/0012-auth-and-registry-providers-are-boundary-layers.md`.
- Read this file's reference map and avoid list.

## Dependencies

- None.

### 1. Customer Graph Tracer

Status: done

## Goal

Prove the CRM backend path with one working flow: a permitted actor creates an organization, creates an account relationship to it, opens one opportunity, and reads the account summary.

## Scope

- Add minimal domain types for `Record`, `Organization`, `Account`, and `Opportunity`.
- Add persistence for the record envelope and typed CRM tracer tables.
- Add application use cases for create organization, create account, create opportunity, and query account summary.
- Enforce team/tenant scoping, actor attribution, idempotency, money validation, permissions, audit, domain events, and outbox writes.
- Expose typed API contracts for the tracer.

## Acceptance Criteria

- [x] A team-scoped organization can be created with legal/display identity fields.
- [x] A team-scoped account can link the organization to the team's commercial relationship.
- [x] A team-scoped opportunity can link to the account and store amount in minor units plus currency.
- [x] Cross-team links are rejected or hidden.
- [x] Replaying the same idempotency key returns the original result without duplicate records, audit events, or outbox events.
- [x] Account summary returns organization, account, open opportunities, and audit/outbox-visible identifiers.

## Verification

- `bun run check-types`
- `bun test packages/app/src/crm.test.ts`
- `bun test packages/api/src/router.test.ts`
- `bun test packages/domain/src/permissions.test.ts`

## Dependencies

- Slice 0.

### 2. CRM Permissions And Request Context

Status: done for current CRM tracer boundary

## Goal

Add CRM-aware authorization and request context beyond coarse team roles before more CRM surfaces depend on weak access semantics.

## Scope

- Add or deepen `Principal`, role capability, record grant, access policy, and field security concepts for CRM records.
- Add auth provider links for Better Auth users, organizations, and memberships where needed by request context resolution.
- Resolve Better Auth session/active organization into Dawn actor, user identity, tenant/team, principal, active membership, auth session, locale/timezone, idempotency key, and correlation ID.
- Implement policy evaluation for owner, same team, same business unit, record grant, participant access, and field-level read/write rules.
- Apply access checks to CRM create/read entrypoints now; future CRM update, search, export, worker, integration, automation, and assistant entrypoints must reuse the same policy path when they are added.

## Areas To Inspect

- `packages/domain/src/identity.ts`
- `packages/domain/src/permissions.test.ts`
- `packages/app/src/crm.ts`
- `packages/api/src/context.ts`
- `apps/server/src/worker-runtime.ts`
- `docs/adr/0012-auth-and-registry-providers-are-boundary-layers.md`
- `ref/twenty/packages/twenty-server/src/engine/metadata-modules/object-permission`
- `ref/twenty/packages/twenty-server/src/engine/metadata-modules/flat-row-level-permission-predicate`
- `ref/open-mercato/packages/core/src/modules/customers/acl.ts`

## Acceptance Criteria

- [x] Request context exposes actor, tenant/team, principal, membership, session, correlation ID, and idempotency key to app use cases.
- [x] CRM capabilities map to object-type actions.
- [x] Record grants allow access without widening full team access.
- [x] Field security can hide selected fields and reject selected writes.
- [x] Better Auth roles do not bypass CRM record access or field security on current CRM create/read use cases.
- [x] Unauthorized CRM records are not distinguishable from missing records where appropriate.
- [x] API-key and other non-user actors use explicit actor permissions and effective principal IDs.
- [ ] Future CRM worker, integration, automation, export, search, and assistant entrypoints reuse this request context and CRM access policy path when those surfaces are introduced.

## Verification

- `bun run check-types`
- `bun test packages/domain/src/crm-permissions.test.ts packages/domain/src/permissions.test.ts`
- `bun test packages/app/src/request-context.test.ts packages/app/src/crm.test.ts`
- `bun test packages/api/src/context.test.ts packages/api/src/router.test.ts`

## Dependencies

- Slices 0 and 1.

### 3. Legal Entities And Account Roles

## Goal

Support tenants with multiple own legal entities and multiple commercial relationships to the same external organization.

## Scope

- Add `LegalEntity` as a team/tenant-owned object.
- Add account fields for legal entity, account role/type, lifecycle stage, segment, territory, relationship status, customer since, churned at, and primary owner principal.
- Ensure one organization can have multiple accounts across legal entities or roles.
- Keep organization identity independent from account status.

## Areas To Inspect

- `packages/domain/src/crm.ts`
- `packages/domain/src/identity.ts`
- `packages/app/src/crm.ts`
- `packages/app/src/billing.ts`
- `packages/db/src/schema/crm.ts`
- `packages/db/src/dawn-repository.ts`
- `ref/open-mercato/packages/core/src/modules/customers/data/entities.ts`

## Acceptance Criteria

- [ ] A team can create multiple legal entities.
- [ ] The same organization can be prospect, customer, partner, supplier, or former customer through separate account records.
- [ ] Account queries can filter by legal entity and relationship status.
- [ ] Organization records do not carry a single canonical customer status.
- [ ] Audit and domain events identify the legal entity and account relationship affected.

## Verification

- Domain tests for multiple legal entities and account roles.
- App tests for duplicate organization/account role behavior.
- Database constraint tests for tenant-scoped references.
- API query tests for legal-entity filtering.

## Dependencies

- Slices 1 and 2.

### 4. Metadata Extensions Tracer

## Goal

Allow an administrator to add one typed custom field to an account and query by it without changing account schema.

## Scope

- Add `ObjectType`, `FieldDefinition`, `RecordFieldValue`, `OptionSet`, and `OptionValue`.
- Support a first set of typed values: text, integer, boolean, date, money, single option, and record reference.
- Add validation for required fields, option stable keys, cardinality, uniqueness, and allowed object type.
- Add app commands for create field definition and set custom field value.
- Add query support for filtering on the custom field.

## Areas To Inspect

- `packages/domain/src/crm.ts`
- `packages/domain/src/shared.ts`
- `packages/app/src/crm.ts`
- `packages/db/src/schema/crm.ts`
- `packages/db/src/dawn-repository.ts`
- `packages/api/src/routers/index.ts`
- `ref/twenty/packages/twenty-server/src/engine/metadata-modules/field-metadata`
- `ref/twenty/packages/twenty-server/src/engine/metadata-modules/flat-field-metadata`
- `ref/open-mercato/packages/core/src/modules/customers/README.md`

## Acceptance Criteria

- [ ] Built-in account fields stay in typed account tables.
- [ ] A custom account field stores typed value data, not arbitrary text blobs.
- [ ] Invalid typed values are rejected before persistence.
- [ ] Option value stable keys cannot be reused inside an option set.
- [ ] Account queries can filter by the new custom field.
- [ ] Custom field updates increment record version and write audit/outbox events.

## Verification

- Domain tests for field definition validation and typed values.
- Repository tests for option key uniqueness and query filtering.
- App tests for idempotency, version conflict, and audit/outbox writes.
- API tests for create/set/query behavior.

## Dependencies

- Slices 1 and 2.

### 5. Identity Keys, Duplicate Candidates, And Merge

## Goal

Detect duplicate parties and merge them without losing relations, audit history, external links, or GDPR behavior.

## Scope

- Add identity keys for organization number, VAT number, email, phone, domain, and external system ID.
- Add duplicate candidate detection for organizations and people.
- Add merge operation and record redirect behavior.
- Preserve source links, audit events, record history, related accounts, opportunities, engagements, documents, and custom fields.
- Add safeguards for shared email addresses and legally distinct organizations.

## Areas To Inspect

- `packages/domain/src/crm.ts`
- `packages/domain/src/integrations.ts`
- `packages/app/src/crm.ts`
- `packages/app/src/integrations.ts`
- `packages/db/src/dawn-repository.ts`
- `ref/atomic-crm/supabase/schemas/02_functions.sql`
- `ref/atomic-crm/src/components/atomic-crm/providers/commons/mergeContacts.ts`

## Acceptance Criteria

- [ ] Identity keys are team/tenant scoped and can be verified or time-bounded.
- [ ] Shared email addresses do not force person uniqueness.
- [ ] Duplicate candidates include confidence and matching reasons.
- [ ] Merge creates a surviving record and redirect from the merged record.
- [ ] Queries by old record ID resolve to the surviving record where appropriate.
- [ ] Merge is idempotent and does not duplicate activities, documents, external links, or field values.
- [ ] Merge writes audit/domain/outbox events and preserves GDPR tombstone behavior where relevant.

## Verification

- Domain tests for identity normalization.
- App tests for duplicate candidate creation and merge behavior.
- Repository tests for redirect resolution and relation rewrites.
- Permission tests for merge authority.

## Dependencies

- Slices 2 and 4.

### 6. Pipeline Versioning And Stage History

## Goal

Make opportunity stage changes historically correct and queryable.

## Scope

- Add pipeline, pipeline version, pipeline stage, outcome reason, opportunity participant, and opportunity stage history.
- Bind opportunities to a pipeline version.
- Add app command for stage change with expected record version.
- Enforce terminal won/lost status and one current stage.
- Support duration reporting and historical pipeline shape.

## Areas To Inspect

- `packages/domain/src/crm.ts`
- `packages/domain/src/events.ts`
- `packages/app/src/crm.ts`
- `packages/db/src/schema/crm.ts`
- `packages/api/src/routers/index.ts`
- `ref/atomic-crm/src/components/atomic-crm/deals`
- `ref/open-mercato/packages/core/src/modules/customers`

## Acceptance Criteria

- [ ] Pipeline changes create new versions instead of rewriting old stages.
- [ ] Stage changes write `OpportunityStageHistory`.
- [ ] Won/lost stages require terminal opportunity status.
- [ ] Reopened opportunities are visible through history.
- [ ] Queries can answer how long an opportunity spent in each stage.
- [ ] Stage changes write domain event, audit event, and outbox entry.

## Verification

- Domain tests for stage transition invariants.
- App tests for expected version conflicts and terminal stage rules.
- Query tests for stage duration and historical pipeline shape.
- API tests for stage changes and history reads.

## Dependencies

- Slices 1 and 2.

### 7. Products, Price Books, And Opportunity Line Items

## Goal

Quote opportunity value from versioned products and snapshot line items.

## Scope

- Add product version, price book, price book entry, and opportunity line item.
- Store quantities, unit price, discounts, tax basis points, recurring period, and service period.
- Snapshot product description and price on line item.
- Recalculate opportunity amount from line items where configured.

## Areas To Inspect

- `packages/domain/src/invoices.ts`
- `packages/domain/src/money.ts`
- `packages/domain/src/crm.ts`
- `packages/app/src/billing.ts`
- `packages/app/src/crm.ts`
- `packages/db/src/dawn-repository.ts`
- `ref/nextcrm-app/prisma/schema.prisma`

## Acceptance Criteria

- [ ] Product updates create new product versions without changing historical line items.
- [ ] Opportunity line totals use exact minor-unit money and basis-point math.
- [ ] A single opportunity uses one currency for its line items.
- [ ] Line item changes update opportunity version and emit audit/outbox events.
- [ ] Historical opportunity reports keep the old product snapshot.

## Verification

- Domain tests for line totals, discounts, tax, and recurring/service periods.
- App tests for product version snapshots and opportunity amount updates.
- Repository tests for historical snapshot preservation.

## Dependencies

- Slices 3 and 6.

### 8. Commercial Documents And Payments

## Goal

Model quotes, orders, invoices, credit notes, receipts, and payments as a traceable commercial document chain.

## Scope

- Add commercial document, document line, document relation, document status history, payment, and payment allocation.
- Bridge existing invoice draft/payment behavior to the commercial document model.
- Enforce document totals against lines and single-currency documents.
- Represent quote-to-order, order-to-invoice, invoice-to-credit-note, and invoice-to-payment relations.
- Add document number series, legal issue snapshots, draft duplication, void/cancel rules, and issued-document immutability.
- Add delivery/share token metadata, viewed-at tracking, PDF/XML artifact references, and delivery status without making generated files canonical business state.
- Represent provider payment intent/refund IDs as external links/provenance, not canonical payment identity.
- Queue PDF/XML generation as side effects after legal issuance.

## Areas To Inspect

- `packages/domain/src/invoices.ts`
- `packages/domain/src/money.ts`
- `packages/app/src/billing.ts`
- `packages/app/src/integrations.ts`
- `packages/db/src/dawn-repository.ts`
- `packages/api/src/routers/index.ts`
- `ref/nextcrm-app/actions/invoices`
- `ref/nextcrm-app/prisma/schema.prisma`
- `ref/nextcrm-app/lib/invoices/numbering.ts`
- `ref/nextcrm-app/lib/invoices/totals.ts`
- `ref/nextcrm-app/__tests__/invoices/lifecycle.test.ts`
- `ref/midday/packages/db/src/queries/invoices.ts`
- `ref/midday/packages/db/src/schema.ts`
- `ref/midday/packages/invoice/src/token/index.ts`
- `ref/midday/apps/worker/src/processors/invoices/generate-invoice.ts`
- `ref/midday/apps/worker/src/processors/invoices/send-invoice-email.ts`
- `ref/midday/apps/worker/src/processors/invoices/schedule-invoice.ts`
- `ref/erpjs/apps/api/src/model/lib/sales.invoice.service.ts`
- `ref/erpjs/apps/api/src/model/lib/document.numbering.service.ts`
- `ref/erpjs/docs/Factur-X`

## Acceptance Criteria

- [ ] A quote can be converted into an order or invoice by creating a linked document, not by changing type.
- [ ] Issued invoices cannot be edited arbitrarily.
- [ ] Draft documents can be duplicated into new drafts without reusing legal numbers, payment state, delivery state, or provider IDs.
- [ ] Legal document numbers are consumed from a transactionally locked team/legal-entity series and are unique within the configured series.
- [ ] Issuing a document snapshots customer, supplier/legal entity, tax, currency/FX, payment, and delivery-relevant fields.
- [ ] Payment allocations support one payment across many invoices and one invoice paid by many payments.
- [ ] Document status history records actor and external source link when applicable.
- [ ] Invoice issue consumes a number, snapshots billing/tax data, writes audit/domain/outbox, and is idempotent; PDF/XML/e-invoice generation is queued after commit and failure does not roll back issuance.
- [ ] Public document access uses scoped share/delivery tokens and records viewed-at/access events without bypassing CRM permissions for internal API reads.
- [ ] Provider payment-intent, refund, and delivery identifiers are stored as external object links/provenance.
- [ ] Existing invoice send/payment flows still work through app use cases.

## Verification

- Domain tests for document totals and status transitions.
- Domain tests for number series consumption and issued-document immutability.
- App tests for quote conversion, draft duplication, invoice issue, payment allocation, delivery-token view tracking, and idempotent provider event replay.
- Repository tests for document relation chains.
- API tests for issue/payment flows.

## Dependencies

- Slices 2, 3, 6, and 7.

### 9. Contracts, Signatures, And Subscriptions

## Goal

Represent contracts, immutable contract versions, signature processes, and recurring revenue.

## Scope

- Add contract, contract version, contract party, signature request, signatory, signature event, subscription, and subscription item.
- Connect contracts to account, opportunity, commercial document, and external signature provider connection.
- Enforce immutable signed contract versions.
- Derive MRR/ARR from active subscription items and contract periods.
- Add recurring commercial document schedule concepts where a contract/subscription should generate future invoices.
- Generate recurring invoices by sequence with idempotency and clear recovery when document creation succeeds but delivery jobs fail.

## Areas To Inspect

- `packages/domain/src/integrations.ts`
- `packages/domain/src/crm.ts`
- `packages/app/src/integrations.ts`
- `packages/app/src/billing.ts`
- `packages/jobs/src/index.ts`
- `ref/midday/docs/invoice-recurring.md`
- `ref/midday/packages/db/src/queries/invoice-recurring.ts`
- `ref/midday/packages/db/src/utils/invoice-recurring.ts`
- `ref/midday/apps/worker/src/processors/invoices/generate-recurring.ts`

## Acceptance Criteria

- [ ] A contract version becomes immutable after being sent or signed.
- [ ] Signature events are idempotent by external event ID.
- [ ] Subscription revenue is derived from active subscription items, not manual dashboard values.
- [ ] Recurring invoice generation uses a stable series ID plus sequence number and cannot create duplicate documents for the same sequence.
- [ ] Recurring schedules support active, paused, completed, and canceled states with explicit next scheduled time and failure handling.
- [ ] Queue/delivery failure after invoice creation leaves a recoverable pending-delivery state, not a duplicate-generation path.
- [ ] Contract, signature, and subscription events feed audit/outbox behavior.
- [ ] Scrive-like provider behavior can be added behind an integration adapter.

## Verification

- Domain tests for contract immutability and recurring revenue math.
- Domain tests for recurring schedule state transitions and sequence idempotency.
- App tests for signature webhook replay, subscription state, recurring invoice generation, and delivery-failure recovery.
- Integration contract tests for provider event normalization.

## Dependencies

- Slice 8. Slice 11 is related for provider provenance.

### 10. Engagements, Tasks, Notes, Assets, And Timeline

## Goal

Store communication and work activity as typed records while projecting a rebuildable account timeline.

## Scope

- Add engagement, engagement participant, engagement link, conversation, message, calendar event, call, task, task link, note, asset, asset version, and asset link.
- Keep message and file content references separate from metadata.
- Add timeline projection generation from typed sources and domain events.
- Support links from one activity to multiple records without duplication.

## Areas To Inspect

- `packages/app/src/documents-inbox.ts`
- `packages/app/src/email-inbox.ts`
- `packages/domain/src/inbox-matching.ts`
- `packages/domain/src/crm.ts`
- `packages/db/src/dawn-repository.ts`
- `packages/jobs/src/index.ts`
- `ref/atomic-crm/src/components/atomic-crm/activity`
- `ref/atomic-crm/src/components/atomic-crm/notes`
- `ref/nextcrm-app/prisma/schema.prisma`
- `ref/open-mercato/packages/core/src/modules/customers/api/activities/route.ts`

## Acceptance Criteria

- [ ] An email, meeting, call, task, or note can link to account and opportunity together.
- [ ] Content storage references are separate from searchable metadata.
- [ ] Timeline entries are rebuildable projections with source record/version.
- [ ] Access checks apply to timeline and linked asset reads.
- [ ] Timeline projection can be rebuilt without changing canonical activity records.

## Verification

- App tests for multi-record links and task completion events.
- Repository tests for timeline rebuild and access filtering.
- Job tests for projection generation from outbox events.

## Dependencies

- Slices 1, 2, and 8.

### 11. Integration Provenance And Sync Tracer

## Goal

Import an external accounting/customer event through a provider-agnostic integration model without losing provenance or creating duplicate effects.

## Scope

- Add integration application, connection, external object link, field mapping, field authority rule, field provenance, sync cursor, sync run, sync item, webhook receipt, sync conflict, and outbound operation concepts.
- Start with one Fortnox-like payment or invoice-status event using a mock adapter.
- Preserve external IDs as links, never canonical record IDs.
- Apply field authority rules before overwriting CRM values.
- Model payment provider intent/refund IDs, e-invoice delivery IDs, and bank transaction match candidates through external links/provenance.
- Treat automatic bank/payment reconciliation as an idempotent app command with audit, not a direct status update.

## Areas To Inspect

- `packages/domain/src/integrations.ts`
- `packages/app/src/integrations.ts`
- `packages/integrations/src/index.ts`
- `apps/server/src/public-api.test.ts`
- `apps/server/src/worker-runtime.ts`
- `packages/db/src/repositories/integrations.ts`
- `ref/open-mercato/packages/events`
- `ref/open-mercato/packages/core/src/modules/audit_logs`
- `ref/midday/packages/db/migrations/0008_add_invoice_payments.sql`
- `ref/midday/packages/jobs/src/tasks/invoice/operations/check-status.ts`
- `ref/midday/packages/app-store/src/e-invoice/config.ts`

## Acceptance Criteria

- [ ] Duplicate webhook receipts do not create duplicate payments, document status changes, workflow actions, or timeline entries.
- [ ] External object links are unique per connection, external object type, and external object ID.
- [ ] Stale external versions are ignored or routed to conflict handling.
- [ ] Manual values are not overwritten without an authority rule.
- [ ] Provider payment intents, refunds, Peppol/e-invoice delivery references, and bank transaction matches are stored as provenance-backed links.
- [ ] Reconciliation can propose or apply a payment allocation idempotently and records the evidence used.
- [ ] Sync runs can report partial failures.
- [ ] Outbound operations use stable idempotency keys.

## Verification

- App tests for webhook replay, stale event handling, and field authority.
- App tests for idempotent payment reconciliation and external payment/refund link handling.
- Integration adapter tests for normalization and raw payload preservation.
- Repository tests for external link uniqueness and sync run item status.

## Dependencies

- Slices 2 and 8.

### 12. Registry Provider And Prospecting Tracer

## Goal

Use TIC.io-style registry data for company search, enrichment, monitoring, and prospecting without making the registry provider the CRM database.

## Scope

- Add external registry provider, registry object, registry link, company snapshot, metric observation, role assignment, prospecting query, prospecting result, prospecting list, and prospecting list member concepts.
- Start with a mock TIC.io-like provider for Swedish company search and enrichment.
- Store external search results as candidates before user-selected import or enrichment.
- Match candidates against existing organizations and people.
- Promote selected fields only through field authority rules and field provenance.
- Add registry personal-data processing rules and source links for person data.

## Areas To Inspect

- `docs/product/CRM-BACKEND-DATA-MODEL-PRD.md`
- `docs/adr/0012-auth-and-registry-providers-are-boundary-layers.md`
- `packages/domain/src/integrations.ts`
- `packages/app/src/integrations.ts`
- `packages/integrations/src/index.ts`
- `packages/db/src/dawn-repository.ts`
- `packages/api/src/routers/index.ts`
- `ref/nextcrm-app/prisma/schema.prisma`
- `ref/nextcrm-app/inngest/functions/enrich-target.ts`

## Acceptance Criteria

- [ ] A registry provider can return company candidates without creating CRM organizations automatically.
- [ ] A user can import or enrich one selected candidate through an app use case.
- [ ] Imported registry data creates external registry link, field provenance, metric observations, and role assignments where relevant.
- [ ] Registry provider IDs remain external identities and are never used as canonical CRM record IDs.
- [ ] Manual CRM values are not overwritten unless an authority rule permits promotion.
- [ ] Prospecting results can be dismissed, imported, or attached to existing records.
- [ ] Registry person data requires legal basis, processing purpose, retention, and an import mode that can block or require user action.

## Verification

- Domain tests for registry identity normalization, authority promotion, and prospecting status transitions.
- App tests for candidate search, selected import, enrichment idempotency, and manual-value protection.
- Integration adapter tests for TIC-like search/enrichment normalization and raw payload preservation.
- Repository tests for registry link uniqueness and personal-data processing rules.

## Dependencies

- Slices 2, 4, 5, and 11.

### 13. Workflow Versioning And Action Ledger

## Goal

Run CRM automations from domain events with immutable workflow versions and idempotent external effects.

## Scope

- Add workflow definition, workflow version, workflow node, workflow edge, workflow run, workflow step run, and automation action ledger.
- Support trigger, condition, action, delay, wait-until-event, branch, bounded loop, human approval, completion, and failure nodes as data model concepts.
- Start with one `invoice.paid` workflow that creates a follow-up task.
- Enforce action idempotency and loop protection.
- Reuse commercial document outbox events for invoice delivery, reminder, overdue, recurring-upcoming, and recurring-generation workflows instead of direct worker database mutations.

## Areas To Inspect

- `packages/domain/src/automations.ts`
- `packages/app/src/automation.ts`
- `packages/app/src/outbox-dispatch.test.ts`
- `packages/jobs/src/index.ts`
- `apps/server/src/outbox-queue.ts`
- `ref/open-mercato/packages/events`
- `ref/open-mercato/packages/core/src/modules/workflows`
- `ref/erxes/backend/services/automations/src`
- `ref/midday/apps/worker/src/processors/invoices/upcoming-notification.ts`
- `ref/midday/packages/jobs/src/tasks/invoice/notifications/send-notifications.ts`

## Acceptance Criteria

- [ ] Activated workflow versions are immutable.
- [ ] Workflow runs bind to the version that started them.
- [ ] Retrying a workflow step does not duplicate a task, email, invoice, or external operation.
- [ ] Action ledger records idempotency key, subject record, external effect reference, status, and execution time.
- [ ] Workflow runs are traceable by correlation ID and source event.
- [ ] Invoice reminders, overdue notifications, recurring-upcoming notifications, and delivery retries are represented as workflow/action-ledger effects with dedupe keys.

## Verification

- Domain tests for workflow version immutability and loop limits.
- App tests for `invoice.paid` follow-up task workflow, invoice reminder/delivery retry dedupe, and recurring-upcoming notification behavior.
- Job tests for outbox-to-workflow dispatch.

## Dependencies

- Slices 8, 10, 11, and 12.

### 14. CRM Query, Search, And Reporting Facts

## Goal

Provide one authorized query model over built-in fields, custom fields, relations, search projections, and historical facts.

## Scope

- Add record query parsing for selected fields, filters, relationship filters, sort, cursor, page size, and `as_of`.
- Support AND, OR, NOT, equality, ranges, relative dates, exists, text matching, option membership, owner/team, relationship traversal, aggregates, and custom fields for the first CRM objects.
- Add search document projection with access scope version and source record version.
- Add first analytical facts for opportunity transitions, engagements, revenue, and subscriptions.
- Add metric definitions, metric observations, goals, and progress snapshots for a small first set.
- Add invoice/reporting facts for outstanding invoices, overdue amounts, payment timing, scheduled invoice forecast, and recurring revenue projection without double-counting.

## Areas To Inspect

- `packages/sync/src/index.ts`
- `packages/domain/src/reports.ts`
- `packages/app/src/projects-reporting.ts`
- `packages/app/src/reporting.test.ts`
- `packages/db/src/dawn-repository.ts`
- `ref/nextcrm-app/inngest/functions/embed-account.ts`
- `ref/open-mercato/packages/search`
- `ref/twenty/packages/twenty-shared/src/database-events`
- `ref/midday/packages/db/src/queries/reports.ts`
- `ref/midday/packages/db/src/queries/invoices.ts`
- `ref/midday/packages/db/src/queries/invoice-recurring.ts`

## Acceptance Criteria

- [ ] Cursor pagination is stable and includes sort values, record ID, and query version.
- [ ] Search results are filtered through current access permissions.
- [ ] Removed access invalidates or hides old search projections.
- [ ] Opportunity stage and revenue reports can be traced to source records or events.
- [ ] Goal progress can be shown for an earlier date without recalculating from only current state.
- [ ] Invoice and revenue reporting separates issued, sent, overdue, paid, refunded, scheduled, and recurring-projected amounts.
- [ ] Currency conversion in document/reporting facts records source currency, target currency, rate, and rate date.
- [ ] Recurring invoice/subscription forecasts avoid double-counting the same expected revenue source.

## Verification

- Query tests for built-in, custom field, and relationship filters.
- Repository tests for cursor stability.
- Projection tests for access filtering and rebuild behavior.
- Reporting tests against known historical fixtures, including invoices, payments, refunds, scheduled invoices, recurring projections, and mixed currencies.

## Dependencies

- Slices 2, 4, 6, 8, 9, 10, and 12.

### 15. AI Tools, Insights, And Approval Requests

## Goal

Generate CRM recommendations with evidence and keep risky AI actions behind explicit approval.

## Scope

- Add insight, insight evidence, generated artifact, agent run, agent step, and approval request.
- Generate one follow-up recommendation from quote/opportunity activity evidence.
- Expose a small AI tool pack as thin wrappers over app use cases.
- Invalidate AI results when source record versions change.
- Require approval for external communication, invoice creation, contract changes, deletion, permission changes, won-stage mutation, and external-system overwrite.

## Areas To Inspect

- `packages/domain/src/assistant.ts`
- `packages/app/src/assistant.ts`
- `packages/ai/src/insights.test.ts`
- `packages/ai/src/evals.ts`
- `packages/app/src/automation.ts`
- `ref/open-mercato/packages/core/src/modules/customers/ai-tools.ts`
- `ref/open-mercato/packages/ai-assistant`
- `ref/nextcrm-app/README.md`
- `ref/twenty/packages/twenty-server/src/engine/metadata-modules/ai`
- `ref/erxes/backend/plugins/erxes-agent_api`

## Acceptance Criteria

- [ ] An insight cites evidence records, events, fields, and timestamps.
- [ ] Insight source state hash changes when underlying record versions change.
- [ ] Generated artifacts remain drafts until approved.
- [ ] AI tools resolve actor, tenant, principal, permission, risk, correlation ID, and idempotency context.
- [ ] Risky AI tool calls create approval requests or are refused by policy.
- [ ] Approved AI actions call application use cases and write audit events.

## Verification

- AI/domain tests for insight evidence and invalidation.
- App tests for approval request lifecycle and tool permission checks.
- Tool contract tests for allowed/refused actions.
- AI eval fixture for a follow-up recommendation with source citations.

## Dependencies

- Slices 2, 8, 10, 12, 13, and 14.

### 16. GDPR Consent, Retention, Deletion, And Tombstones

## Goal

Make privacy lifecycle behavior executable across canonical CRM data, derived data, files, integrations, exports, and AI artifacts.

## Scope

- Add processing purpose, consent record, suppression entry, retention policy, data subject request, legal hold, deletion job, and deletion tombstone.
- Add external data processing rule and personal data source link behavior for registry providers.
- Implement one person deletion flow with legal hold check and tombstone creation.
- Delete or pseudonymize canonical person data, contact points, custom fields, message content references, files, search projections, AI artifacts, integration payloads, and exports where required.
- Prevent reimport from the same external source through tombstones.

## Areas To Inspect

- `packages/app/src/operations.ts`
- `packages/app/src/documents-inbox.ts`
- `packages/app/src/integrations.ts`
- `packages/app/src/assistant.ts`
- `packages/db/src/dawn-repository.ts`
- `apps/server/src/data-export.ts`
- `docs/product/CRM-BACKEND-DATA-MODEL-PRD.md`

## Acceptance Criteria

- [ ] Consent is tied to purpose and contact point, not only person.
- [ ] Suppression prevents future outbound communication on the suppressed channel.
- [ ] Legal hold blocks destructive deletion and records the reason.
- [ ] Deletion job removes or pseudonymizes all configured canonical and derived stores.
- [ ] Tombstone prevents automatic reimport from the same source connection.
- [ ] Registry person data requires legal basis, processing purpose, retention, and an import mode before it can become CRM data.
- [ ] Deletion is auditable without retaining forbidden personal values.

## Verification

- App tests for data subject deletion, legal hold, and tombstone reimport prevention.
- Repository tests for cascading derived-data cleanup.
- Integration tests for webhook/import behavior after tombstone creation.
- Operations tests for export/deletion audit payloads.

## Dependencies

- Slices 4, 5, 10, 11, 12, 14, and 15.

## Dependency Summary

- Slice 2 is landed for the current CRM tracer boundary; later CRM surfaces must reuse its request context and access policy path.
- Slice 3 can proceed after Slice 2 if commercial account modeling is the priority.
- Slice 4 should land before duplicate handling, query/reporting, field-level AI evidence, and registry field promotion.
- Slices 6 and 7 can proceed in parallel after Slice 3 if opportunity depth is the priority.
- Slice 8 depends on product/pricing depth and should not copy NextCRM's or Midday's invoice table shape directly.
- Slice 10 should land before workflow and AI slices that need timeline/task side effects.
- Slice 11 should land before registry provider imports or real provider webhooks.
- Slice 16 should be late enough to cover real derived stores, but early enough that new CRM surfaces must integrate with privacy lifecycle behavior.

## Suggested Next Slice

Start with **Slice 3: Legal Entities And Account Roles**.

Reason: the customer graph tracer and permission/request-context foundation now exist. Legal entities and account roles are the smallest next slice that deepens the core commercial account model before metadata, search, integrations, registry enrichment, or AI tools depend on it.
