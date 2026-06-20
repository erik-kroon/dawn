# 0012: Auth And Registry Providers Are Boundary Layers

Status: Accepted
Date: 2026-06-20

## Context

Dawn uses Better Auth today and may enable its organization plugin for organizations, invitations, memberships, active organization, and teams. Better Auth is useful identity infrastructure, but Dawn's CRM end-state needs its own tenant, principal, record access, field security, workflow, integration, export, and AI-agent permission model.

Dawn also needs Swedish company and person data for enrichment, risk/status signals, annual-report observations, role graphs, and prospecting. TIC.io is a strong first candidate, but registry data is external source material. It must not become canonical CRM identity or silently overwrite user-authored CRM values.

## Decision

Better Auth is the identity plane. Dawn will map Better Auth users, organizations, and memberships into Dawn `UserIdentity`, `Tenant`, `TenantMembership`, `Principal`, and request context records through explicit auth-provider links. Better Auth roles can inform base membership posture, but application authorization remains responsible for object capabilities, record scope, field security, workflow permissions, integration actor permissions, export permissions, and AI-agent permissions.

Registry providers such as TIC.io are external data providers behind adapter and application-use-case boundaries. Dawn stores provider records as external registry objects, snapshots, source links, provenance, observations, candidates, and prospecting results. Provider IDs are external identifiers, not canonical CRM record IDs. Selected registry values can be promoted into CRM records only through field authority rules, provenance, audit, and idempotent application use cases.

Registry person data requires explicit legal basis, processing purpose, retention, and deletion behavior before it can become CRM data.

## Consequences

- Better Auth can be upgraded, replaced, or reconfigured without rewriting CRM tenancy and authorization.
- CRM authorization can express record-level, field-level, workflow, integration, export, and AI-agent rules beyond base organization roles.
- TIC.io can be the first Swedish registry/enrichment provider without locking Dawn's data model to TIC identifiers or payload shape.
- Prospecting and enrichment flows must show, match, and require selected import or enrichment before external data becomes CRM state.
- Provider adapters and webhooks must call application use cases instead of writing canonical CRM records directly.
- GDPR deletion and tombstones must cover registry-source person data and prevent automatic reimport where required.

## Alternatives Considered

- Use Better Auth organization as Dawn tenant: simpler initially, but couples CRM tenancy and permissions to an auth-provider schema.
- Use Better Auth roles as CRM permissions: useful for base membership, but insufficient for record access, field security, integration actors, workflow actions, exports, and AI tools.
- Store TIC.io IDs directly on `Organization`: convenient for one provider, but makes the provider an implicit source of truth and blocks future providers.
- Automatically overwrite CRM fields from registry enrichment: fast enrichment, but unsafe for user-authored values, provenance, audit, and GDPR requirements.
