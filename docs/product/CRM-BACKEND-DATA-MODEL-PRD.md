# End-state PRD: backend och datamodell för ett svenskt B2B-CRM

**Omfattning:** datamodell, domänlogik, integrationer, behörigheter, historik, automationer, rapportering, AI och GDPR.

**Utanför omfattningen:** frontend, visuell design, programmeringsspråk, databasmotor och infrastrukturleverantörer.

## 1. Övergripande arkitekturbeslut

Den optimala modellen är en hybrid:

1. **Starkt typade kärnobjekt** för organisationer, personer, affärer, fakturor, avtal och aktiviteter.
2. **Ett metadata-drivet extensionsystem** för custom fields, custom objects och kundspecifika relationer.
3. **Current-state-data** för snabba operativa operationer.
4. **Append-only events och historik** för audit, automationer, integrationer och historisk rapportering.
5. **Härledda read models** för sök, timeline, rapportering och AI.

Bygg inte hela systemet som en generell EAV-modell och bygg inte heller allt som ostrukturerade dokument. Kärnan måste ha riktiga relationer, constraints och tydliga domänregler.

## 2. Produktmål

Backendplattformen ska:

- fungera för företag med en eller flera juridiska enheter
- stödja allt från små säljteam till organisationer med hundratals användare
- hantera miljontals aktiviteter per kund utan en ny datamodell
- erbjuda full historik över affärer, aktiviteter, dokument och integrationer
- kunna anpassas med custom fields, custom objects och pipelines
- synka tillförlitligt med Fortnox, Scrive, e-post, kalender och framtida system
- automatisera processer utan duplicerade effekter
- ge AI tillräcklig kontext utan att AI-data blir source of truth
- tillämpa GDPR-radering, retention och samtycken korrekt
- förhindra dataläckage mellan tenants genom design

## 3. Viktiga avgränsningar

CRM:et ska inte vara:

- ett komplett bokföringssystem
- ett eget digitalt signeringssystem
- en generell databasbyggare
- en fullständig ERP-plattform
- en ostrukturerad samling kundspecifika objekt utan gemensam semantik

Fortnox eller ett annat ekonomisystem kan vara auktoritativ källa för fakturor, betalningar och bokföringsrelaterade statusar. CRM:et ska sammanföra denna information med säljprocessen.

---

# 4. Universella dataprimitiver

## 4.1 Tenant

En tenant representerar ett kundkonto i plattformen.

```text
Tenant
  id
  name
  status
  default_currency
  default_timezone
  default_locale
  data_region
  created_at
  updated_at
```

Varje tenant-ägd rad ska bära `tenant_id`, även join-tabeller, event, loggar och projections.

Ingen relation får skapas mellan poster från olika tenants, förutom genom en uttryckligt definierad delningsmekanism.

En tenant är CRM:ets interna domän- och datagräns. Om Better Auths organization-plugin används för organisationer, medlemmar och team ska dess organization-ID mappas till `Tenant` genom ett explicit auth mapping-lager. Better Auths organization får inte bli CRM:ets kanoniska tenantmodell.

## 4.2 Juridisk enhet

En tenant kan ha flera egna bolag och därmed flera Fortnox-konton.

```text
LegalEntity
  id
  tenant_id
  legal_name
  organization_number
  vat_number
  country_code
  base_currency
  fiscal_year_start
  status
  created_at
  updated_at
```

Detta objekt ska inte förväxlas med kundföretag som finns i CRM:et.

## 4.3 Record

Alla CRM-objekt bör ha en gemensam record-identitet.

```text
Record
  id
  tenant_id
  object_type_id
  owner_principal_id
  business_unit_id
  lifecycle_state
  version
  created_by_actor_id
  updated_by_actor_id
  created_at
  updated_at
  archived_at
  deleted_at
```

Domäntabeller som `Organization`, `Person` och `Opportunity` använder `record_id` som sin identitet.

Detta ger ett enhetligt sätt att hantera:

- ägarskap
- custom fields
- tags
- anteckningar
- filer
- behörighet
- relationer
- audit
- sökning
- automationer

`version` används för optimistic concurrency. En uppdatering ska kunna kräva att klienten fortfarande arbetar mot rätt record-version.

## 4.4 Actor

Alla förändringar måste kunna kopplas till en actor.

```text
Actor
  id
  tenant_id
  actor_type
  user_id
  integration_connection_id
  workflow_definition_id
  service_account_id
```

`actor_type` kan vara:

- user
- integration
- automation
- system
- API client

Det ska alltid gå att svara på vem eller vad som skapade en förändring.

## 4.5 Pengar

Pengar lagras som:

```text
Money
  amount_minor
  currency_code
```

Exempel: 1 250,50 SEK lagras som 125050 minor units.

Flyttal får inte användas för pengar. Rabatter, skattesatser och sannolikheter bör representeras med fasta skalor eller basis points.

## 4.6 Tid

Systemet ska skilja mellan:

- `occurred_at`: när något faktiskt hände
- `received_at`: när systemet tog emot informationen
- `created_at`: när posten skapades internt
- `effective_from`: när ett tillstånd började gälla
- `effective_to`: när tillståndet slutade gälla

Alla exakta tidpunkter lagras i en gemensam tidsreferens. Ursprunglig tidszon och lokal affärsdag ska bevaras när det är relevant.

---

# 5. Identitet, användare och behörighet

Better Auth används som identity plane för autentisering, sessioner, invitations, aktiv organization och grundläggande membership. CRM:et behåller ett eget domänlager för tenants, principals, accounts, opportunities, record access, field security, integration actors, workflow actors, exportbehörighet och AI-agentbehörighet.

Modellen ska därför ha ett explicit mapping-lager mellan Better Auth och CRM-domänen:

```text
AuthProviderLink
  id
  provider
  external_user_id
  user_identity_id
  created_at
```

```text
AuthOrganizationLink
  id
  tenant_id
  provider
  external_organization_id
  created_at
```

```text
AuthMembershipLink
  id
  tenant_membership_id
  provider
  external_membership_id
  created_at
```

Better Auth svarar på vem som är inloggad, vilken auth-organization som är aktiv och vilken session som gäller. Application authorization svarar på vilka CRM-records och fält en principal får läsa eller ändra, vilka actions den får utföra, vilka integrationer den får påverka och vilka AI- eller workflow-actions som kräver godkännande.

## 5.1 Användaridentitet och medlemskap

En användaridentitet kan tillhöra flera tenants.

```text
UserIdentity
  id
  email
  name
  status
  created_at
```

```text
TenantMembership
  id
  tenant_id
  user_identity_id
  principal_id
  status
  locale
  timezone
  joined_at
  disabled_at
```

## 5.2 Principal

Användare, team och servicekonton ska kunna vara ägare eller mottagare av behörigheter.

```text
Principal
  id
  tenant_id
  principal_type
  status
```

```text
Team
  principal_id
  name
  parent_team_id
  business_unit_id
```

```text
TeamMembership
  team_principal_id
  member_principal_id
  valid_from
  valid_to
```

## 5.3 Behörighetsmodell

Behörighet ska ha tre separata lager:

1. **Capabilities:** vad en principal får göra med en objekttyp.
2. **Record scope:** vilka records principalen får läsa eller ändra.
3. **Field security:** vilka fält principalen får läsa eller ändra.

```text
Role
  id
  tenant_id
  name
  status
```

```text
Capability
  id
  object_type_id
  action
```

```text
RoleCapability
  role_id
  capability_id
```

```text
RoleBinding
  role_id
  principal_id
  business_unit_id
  valid_from
  valid_to
```

```text
AccessPolicy
  id
  tenant_id
  object_type_id
  policy_type
  condition
  allowed_actions
  priority
  status
```

```text
RecordGrant
  record_id
  principal_id
  permission_level
  granted_by
  valid_to
```

```text
FieldSecurityPolicy
  field_definition_id
  principal_or_role_id
  read_allowed
  write_allowed
```

Access policies ska kunna uttrycka regler som:

- användaren äger recordet
- recordet ägs av användarens team
- recordet tillhör samma business unit
- användaren är deltagare i affären
- recordet är delat till alla säljare
- endast ekonomi får se betalningsinformation

Bakgrundsjobb, integrationer och automationer måste också arbeta med en explicit actor och ett behörighetskontext.

## 5.4 Request context

Varje backend-request ska resolvea både auth-session och CRM-kontext innan applikationslagret anropas.

```text
RequestContext
  actor_id
  user_identity_id
  tenant_id
  principal_id
  active_membership_id
  auth_session_id
  correlation_id
```

Request context får inte användas som ersättning för behörighetskontroll. Det är input till application authorization, inte ett bevis på att en action är tillåten.

---

# 6. Metadata och utbyggbarhet

## 6.1 Object definitions

```text
ObjectType
  id
  tenant_id
  stable_key
  name
  object_kind
  is_builtin
  status
  schema_version
```

`object_kind` kan vara:

- core
- custom
- system
- derived

Built-in-objekt har typade domäntabeller. Custom objects använder den generiska record- och fältmodellen.

## 6.2 Field definitions

```text
FieldDefinition
  id
  tenant_id
  object_type_id
  stable_key
  name
  data_type
  cardinality
  storage_mode
  required
  unique_scope
  searchable
  filterable
  sortable
  sensitive_classification
  default_value
  validation_rule_id
  option_set_id
  status
  schema_version
```

Datatyper bör minst stödja:

- text
- rich text
- integer
- decimal
- boolean
- date
- datetime
- money
- percentage
- email
- phone
- URL
- single option
- multiple options
- record reference
- file reference
- user reference
- computed value

`storage_mode` skiljer mellan:

- core
- custom
- computed
- externally derived
- AI derived

## 6.3 Custom field values

```text
RecordFieldValue
  id
  tenant_id
  record_id
  field_definition_id
  ordinal
  typed_value
  source_link_id
  confidence
  valid_from
  valid_to
  version
  created_at
  updated_at
```

Värden måste lagras typat. Ett numeriskt fält får inte lagras som en godtycklig textsträng.

Built-in-fält som affärsbelopp, organisationsnummer och fakturastatus ska inte flyttas till custom fields.

## 6.4 Option sets

```text
OptionSet
  id
  tenant_id
  name
  status
```

```text
OptionValue
  id
  option_set_id
  stable_key
  label
  sequence
  status
```

Optionvärdens `stable_key` får inte återanvändas. Ändrade etiketter ska inte skriva om historisk semantik.

## 6.5 Custom relationships

```text
RelationshipDefinition
  id
  tenant_id
  source_object_type_id
  target_object_type_id
  stable_key
  cardinality
  inverse_stable_key
  cascade_policy
  status
```

```text
RelationshipEdge
  id
  tenant_id
  relationship_definition_id
  source_record_id
  target_record_id
  role_key
  valid_from
  valid_to
  attributes
  version
```

Kärnrelationer som affär till kund och person till organisation ska ha egna typade tabeller. Den generiska relationsmodellen används för kundspecifika eller mindre centrala relationer.

## 6.6 Computed fields

```text
ComputedFieldDefinition
  field_definition_id
  expression
  evaluation_mode
  invalidation_policy
  version
```

```text
ComputedFieldDependency
  computed_field_definition_id
  dependency_object_type_id
  dependency_field_definition_id
```

Systemet måste kunna avgöra vilka beräknade värden som blivit stale när underliggande data förändras.

---

# 7. Customer graph

## 7.1 Party

`Party` är ett gemensamt lager för personer och organisationer.

```text
Party
  record_id
  party_type
```

## 7.2 Organisation

En organisation representerar ett verkligt externt företag, inte CRM-relationen till företaget.

```text
Organization
  record_id
  legal_name
  display_name
  organization_number
  country_code
  vat_number
  organization_kind
  parent_organization_id
  website_domain
  registry_status
  founded_date
```

## 7.3 Person

```text
Person
  record_id
  first_name
  last_name
  preferred_name
  language
  birth_date
```

Personnummer ska inte lagras utan ett tydligt affärsbehov och rättslig grund.

## 7.4 Account

Ett account representerar tenantens kommersiella relation till en organisation.

Detta ska vara ett separat objekt från organisationen.

```text
Account
  record_id
  legal_entity_id
  organization_id
  account_type
  lifecycle_stage_id
  segment_id
  territory_id
  score
  relationship_status
  customer_since
  churned_at
  primary_owner_principal_id
```

Samma organisation kan vara:

- prospekt för en juridisk enhet
- kund till en annan
- partner
- leverantör
- tidigare kund

Att lägga en enda `customer_status` direkt på organisationen skapar problem när tenantens verksamhet blir mer komplex.

## 7.5 Person affiliation

```text
PersonAffiliation
  id
  tenant_id
  person_id
  organization_id
  job_title
  department
  employment_type
  is_primary
  valid_from
  valid_to
  source_link_id
```

Kontaktuppgifter kan knytas till personens affiliation så att samma person kan ha olika arbetsmejl i olika organisationer.

## 7.6 Contact point

```text
ContactPoint
  id
  tenant_id
  party_id
  affiliation_id
  contact_point_type
  original_value
  normalized_value
  label
  is_primary
  is_verified
  verified_at
  valid_from
  valid_to
  source_link_id
```

Exempel:

- e-post
- telefon
- webbplats
- LinkedIn-liknande profil
- annan meddelandeadress

## 7.7 Address

```text
Address
  id
  tenant_id
  party_id
  address_type
  street
  postal_code
  city
  region
  country_code
  is_primary
  valid_from
  valid_to
  source_link_id
```

## 7.8 Externa företagsroller

För styrelsemedlemmar, firmatecknare, revisorer och moderbolag behövs tidsbegränsade relationer.

```text
PartyRoleAssignment
  id
  tenant_id
  subject_party_id
  organization_id
  role_type
  valid_from
  valid_to
  source_link_id
```

## 7.9 Bolagsdata över tid

Omsättning, resultat och antal anställda ska lagras som observationer över perioder.

```text
OrganizationMetricObservation
  id
  tenant_id
  organization_id
  metric_type
  period_start
  period_end
  amount_minor
  currency_code
  numeric_value
  source_link_id
  reported_at
```

Historisk bolagsdata ska inte skrivas över av nästa års värde.

---

# 8. Identitetsmatchning, dubletter och merge

## 8.1 Identity keys

```text
IdentityKey
  id
  tenant_id
  record_id
  identity_type
  normalized_value
  country_code
  source_link_id
  is_verified
  valid_from
  valid_to
```

Exempel på identity keys:

- organisationsnummer
- momsregistreringsnummer
- e-postadress
- telefonnummer
- domän
- externt system-ID

E-post ska inte vara absolut unik för personer eftersom gemensamma inboxar och återanvända adresser förekommer.

## 8.2 Duplicate candidate

```text
DuplicateCandidate
  id
  tenant_id
  left_record_id
  right_record_id
  confidence
  matching_reasons
  status
  detected_at
  reviewed_by
```

## 8.3 Merge

```text
MergeOperation
  id
  tenant_id
  surviving_record_id
  merged_record_id
  field_resolution
  performed_by
  performed_at
  reversible_until
```

```text
RecordRedirect
  old_record_id
  surviving_record_id
  created_at
```

En merge ska:

- flytta eller ompeka relationer
- bevara externa source links
- bevara audit och events
- spara vilka fält som vann
- skapa en redirect från det gamla ID:t
- vara reversibel under en begränsad period
- inte skapa duplicerade aktiviteter eller dokument

---

# 9. Leads och konvertering

Ett lead är en ännu inte kvalificerad datapunkt som inte nödvändigtvis bör skapa fullständiga person- och organisationsrecords.

```text
Lead
  record_id
  owner_principal_id
  status
  source
  source_campaign_id
  raw_person_data
  raw_organization_data
  qualification_score
  qualified_at
  disqualified_at
  disqualification_reason_id
```

```text
LeadConversion
  id
  tenant_id
  lead_id
  organization_id
  person_id
  account_id
  opportunity_id
  converted_by
  converted_at
```

Konvertering ska matcha mot befintliga records innan nya skapas.

Efter konvertering ska leadets ursprungliga information bevaras och leadet ska vara historiskt låst.

---

# 10. Sales domain

## 10.1 Pipeline

Pipelines måste vara versionerade.

```text
Pipeline
  id
  tenant_id
  name
  object_type_id
  current_version_id
  status
```

```text
PipelineVersion
  id
  pipeline_id
  version_number
  active_from
  retired_at
```

```text
PipelineStage
  id
  pipeline_version_id
  stable_key
  name
  sequence
  category
  default_probability_bps
  is_terminal
```

`category` bör minst vara:

- open
- won
- lost

Ändring av pipeline får inte skriva om historiken för gamla affärer.

## 10.2 Affär

```text
Opportunity
  record_id
  legal_entity_id
  account_id
  pipeline_id
  current_stage_id
  name
  amount_minor
  currency_code
  probability_bps
  forecast_category
  expected_close_date
  source
  status
  primary_owner_principal_id
  next_task_id
  won_at
  lost_at
  loss_reason_id
```

`next_task_id` är den kanoniska representationen av nästa steg. Ett fritt textfält kan finnas som sammanfattning men ska inte ersätta en riktig planerad aktivitet.

## 10.3 Deltagare i affären

```text
OpportunityParticipant
  id
  tenant_id
  opportunity_id
  party_id
  affiliation_id
  participant_role
  is_primary
```

En affär kan ha flera organisationer och personer med roller som:

- köpare
- beslutsfattare
- användare
- ekonomisk godkännare
- partner
- intern sponsor

## 10.4 Stage history

```text
OpportunityStageHistory
  id
  tenant_id
  opportunity_id
  from_stage_id
  to_stage_id
  entered_at
  exited_at
  changed_by_actor_id
  reason
  correlation_id
```

Det ska gå att svara på:

- hur länge affären låg i varje steg
- vilken pipeline den följde
- vad pipeline såg ut som ett historiskt datum
- vilka affärer som återöppnades
- vem som ändrade status

## 10.5 Loss reasons

```text
OutcomeReason
  id
  tenant_id
  outcome_type
  stable_key
  label
  status
```

## 10.6 Produkter och prislistor

```text
Product
  record_id
  sku
  status
  current_version_id
```

```text
ProductVersion
  id
  product_id
  version_number
  name
  description
  unit
  tax_code
  active_from
  active_to
```

```text
PriceBook
  id
  tenant_id
  legal_entity_id
  name
  currency_code
  status
```

```text
PriceBookEntry
  id
  price_book_id
  product_version_id
  unit_price_minor
  valid_from
  valid_to
```

```text
OpportunityLineItem
  id
  tenant_id
  opportunity_id
  product_version_id
  description_snapshot
  quantity
  unit
  unit_price_minor
  discount_minor
  discount_bps
  tax_rate_bps
  net_amount_minor
  tax_amount_minor
  gross_amount_minor
  recurring_period
  service_period_start
  service_period_end
```

Produktbeskrivningar och priser måste snapshotas på line item. Historiska affärer får inte förändras när produktkatalogen uppdateras.

## 10.7 Forecast

```text
ForecastSubmission
  id
  tenant_id
  period_start
  period_end
  submitted_by_principal_id
  business_unit_id
  forecast_category
  amount_minor
  currency_code
  submitted_at
```

```text
OpportunitySnapshot
  id
  tenant_id
  opportunity_id
  captured_at
  stage_id
  owner_principal_id
  amount_minor
  probability_bps
  forecast_category
  expected_close_date
  status
```

Historiska prognoser får inte räknas enbart från dagens affärsstatus.

---

# 11. Offerter, ordrar, fakturor och betalningar

## 11.1 Commercial document

```text
CommercialDocument
  record_id
  document_type
  legal_entity_id
  account_id
  opportunity_id
  contract_id
  document_series_id
  revision_number
  document_number
  external_number
  status
  authority_mode
  issue_date
  valid_until
  due_date
  currency_code
  subtotal_minor
  discount_minor
  tax_minor
  total_minor
  balance_minor
  supersedes_document_id
  created_from_document_id
```

`document_type`:

- quote
- order
- invoice
- credit note
- receipt
- pro forma invoice

`authority_mode`:

- CRM authoritative
- external system authoritative
- shared with explicit field rules

En offert ska inte byta typ till order. En ny order skapas och länkas till offerten.

## 11.2 Document line

```text
CommercialDocumentLine
  id
  tenant_id
  document_id
  sequence
  product_version_id
  sku_snapshot
  description_snapshot
  quantity
  unit
  unit_price_minor
  discount_minor
  discount_bps
  tax_code
  tax_rate_bps
  net_amount_minor
  tax_amount_minor
  gross_amount_minor
  service_period_start
  service_period_end
```

Dokumentets totalsummor måste kunna verifieras mot raderna.

## 11.3 Document relations

```text
DocumentRelation
  id
  tenant_id
  source_document_id
  target_document_id
  relationship_type
```

Exempel:

- quote converted to order
- order invoiced by invoice
- invoice credited by credit note
- contract generated from quote

## 11.4 Status history

```text
DocumentStatusHistory
  id
  tenant_id
  document_id
  from_status
  to_status
  changed_at
  changed_by_actor_id
  external_source_link_id
```

## 11.5 Payment

```text
Payment
  record_id
  legal_entity_id
  account_id
  external_payment_id
  payment_date
  amount_minor
  currency_code
  status
  source_link_id
```

```text
PaymentAllocation
  id
  tenant_id
  payment_id
  invoice_id
  allocated_amount_minor
  allocated_at
```

En betalning kan allokeras till flera fakturor och en faktura kan betalas genom flera betalningar.

---

# 12. Avtal, signering och recurring revenue

## 12.1 Contract

```text
Contract
  record_id
  legal_entity_id
  account_id
  opportunity_id
  status
  start_date
  end_date
  renewal_type
  renewal_interval
  notice_period_days
  auto_renews
  currency_code
  contract_value_minor
  mrr_minor
  arr_minor
  current_version_id
```

## 12.2 Contract version

```text
ContractVersion
  id
  contract_id
  version_number
  effective_from
  effective_to
  terms_reference
  source_document_id
  created_at
```

Skickade och signerade kontraktsversioner är immutabla.

## 12.3 Contract parties

```text
ContractParty
  id
  tenant_id
  contract_id
  party_id
  party_role
```

## 12.4 Signature process

```text
SignatureRequest
  record_id
  contract_version_id
  provider_connection_id
  external_document_id
  status
  sent_at
  completed_at
  expired_at
```

```text
Signatory
  id
  signature_request_id
  person_id
  email
  signing_order
  role
  status
```

```text
SignatureEvent
  id
  tenant_id
  signature_request_id
  signatory_id
  event_type
  occurred_at
  received_at
  external_event_id
```

## 12.5 Subscription

```text
Subscription
  record_id
  contract_id
  account_id
  status
  start_date
  end_date
  billing_interval
  currency_code
```

```text
SubscriptionItem
  id
  subscription_id
  product_version_id
  quantity
  unit_price_minor
  discount_minor
  start_date
  end_date
```

Recurring revenue ska härledas från aktiva subscription items och kontraktsperioder, inte från manuellt angivna dashboardvärden.

---

# 13. Kommunikation, aktiviteter och timeline

En stor generell `Activity`-tabell med ogenomskinliga payloads bör inte vara source of truth.

Använd typade domänobjekt och bygg en härledd timeline ovanpå dem.

## 13.1 Engagement

```text
Engagement
  record_id
  engagement_type
  direction
  subject
  occurred_at
  started_at
  ended_at
  owner_principal_id
  source_link_id
  visibility
  confidentiality_level
```

Typer kan vara:

- email
- meeting
- call
- SMS
- form submission
- chat
- manual interaction

## 13.2 Engagement participants

```text
EngagementParticipant
  id
  tenant_id
  engagement_id
  party_id
  affiliation_id
  contact_point_id
  participant_role
  response_status
```

## 13.3 Engagement links

```text
EngagementLink
  id
  tenant_id
  engagement_id
  related_record_id
  relationship_type
```

En aktivitet kan vara kopplad till ett account, en affär, ett case och ett kontrakt samtidigt.

## 13.4 Conversations och meddelanden

```text
Conversation
  record_id
  channel
  external_thread_id
  subject
  opened_at
  closed_at
```

```text
Message
  record_id
  conversation_id
  engagement_id
  external_message_id
  direction
  subject
  sent_at
  received_at
  delivery_status
  content_reference
```

```text
MessageParticipant
  id
  message_id
  party_id
  contact_point_id
  participant_role
```

Meddelandeinnehåll bör hållas separat från metadata för att möjliggöra separat behörighet, retention och radering.

## 13.5 Kalenderhändelse

```text
CalendarEvent
  record_id
  engagement_id
  external_event_id
  organizer_party_id
  recurrence_series_id
  location
  meeting_reference
  status
```

## 13.6 Samtal

```text
Call
  record_id
  engagement_id
  call_status
  duration_seconds
  recording_asset_id
  transcript_asset_id
```

## 13.7 Task

```text
Task
  record_id
  title
  description
  status
  priority
  assignee_principal_id
  due_at
  completed_at
  recurrence_rule
  source_type
  workflow_run_id
```

```text
TaskLink
  id
  tenant_id
  task_id
  related_record_id
  relationship_type
```

## 13.8 Timeline projection

```text
TimelineEntry
  id
  tenant_id
  primary_record_id
  source_object_type
  source_record_id
  event_type
  occurred_at
  actor_id
  summary
  visibility
  source_version
```

TimelineEntry är en rebuildable projection, inte kanonisk lagring.

Den ska kunna genereras från:

- meddelanden
- möten
- samtal
- tasks
- stage changes
- dokumenthändelser
- signeringar
- betalningar
- anteckningar
- systemevents

---

# 14. Anteckningar, filer och innehåll

## 14.1 Note

```text
Note
  record_id
  author_principal_id
  content_reference
  visibility
  pinned
```

```text
NoteLink
  note_id
  related_record_id
```

## 14.2 Asset

```text
Asset
  record_id
  filename
  media_type
  size_bytes
  checksum
  status
  sensitivity_classification
  current_version_id
```

```text
AssetVersion
  id
  asset_id
  version_number
  storage_reference
  checksum
  created_by
  created_at
```

```text
AssetLink
  id
  tenant_id
  asset_id
  related_record_id
  relationship_type
```

Filer måste omfattas av samma accessregler, retention och GDPR-radering som recordet de är kopplade till.

---

# 15. Marketing domain

För att kunna konkurrera bredare ska kärnan stödja marketing attribution och outbound utan att blanda ihop detta med CRM-masterdata.

## 15.1 Campaign

```text
Campaign
  record_id
  name
  campaign_type
  status
  start_date
  end_date
  budget_minor
  currency_code
  parent_campaign_id
```

## 15.2 Campaign member

```text
CampaignMember
  id
  tenant_id
  campaign_id
  party_id
  account_id
  status
  joined_at
  responded_at
```

## 15.3 Touchpoint

```text
MarketingTouchpoint
  id
  tenant_id
  party_id
  account_id
  campaign_id
  channel
  touchpoint_type
  occurred_at
  source
  attribution_data
```

## 15.4 Sequences

```text
SequenceDefinition
  id
  tenant_id
  name
  status
  current_version_id
```

```text
SequenceVersion
  id
  sequence_definition_id
  version_number
  active_from
```

```text
SequenceStep
  id
  sequence_version_id
  sequence_number
  step_type
  delay
  action_definition
```

```text
SequenceEnrollment
  id
  tenant_id
  sequence_version_id
  party_id
  account_id
  owner_principal_id
  status
  enrolled_at
  stopped_at
```

```text
SequenceStepExecution
  id
  enrollment_id
  sequence_step_id
  scheduled_at
  executed_at
  status
  idempotency_key
```

---

# 16. Service och ärendehantering

## 16.1 Case

```text
Case
  record_id
  legal_entity_id
  account_id
  contact_person_id
  subject
  description
  status
  priority
  channel
  queue_id
  owner_principal_id
  sla_policy_id
  first_response_due_at
  resolution_due_at
  resolved_at
  closed_at
```

## 16.2 Case history

```text
CaseStatusHistory
  id
  tenant_id
  case_id
  from_status
  to_status
  changed_at
  changed_by_actor_id
```

## 16.3 SLA

```text
SlaPolicy
  id
  tenant_id
  name
  business_calendar_id
  response_target
  resolution_target
  status
```

```text
SlaClock
  id
  tenant_id
  case_id
  metric_type
  started_at
  paused_at
  completed_at
  breached_at
```

---

# 17. Eventmodell, historik och audit

CRM:et behöver events men bör inte göras helt event-sourcat utan ett mycket tydligt behov.

Current-state-tabeller är source of truth för nuvarande tillstånd. Append-only events används för semantik, automation, integrationsleverans och rapportering.

## 17.1 Domain event

```text
DomainEvent
  id
  tenant_id
  aggregate_type
  aggregate_id
  aggregate_version
  event_type
  event_schema_version
  occurred_at
  recorded_at
  actor_id
  correlation_id
  causation_id
  payload
  sensitivity_classification
```

Exempel:

```text
opportunity.created
opportunity.stage_changed
opportunity.won
quote.sent
invoice.issued
invoice.paid
contract.signed
task.completed
account.lifecycle_changed
person.consent_revoked
```

En eventtyp ska ha en stabil versionerad semantik.

## 17.2 Audit event

```text
AuditEvent
  id
  tenant_id
  actor_id
  action
  target_record_id
  target_object_type
  occurred_at
  request_id
  correlation_id
  outcome
  before_change
  after_change
  changed_fields
  access_context
```

Audit events används för säkerhet och spårbarhet. Domain events används för affärssemantik.

Auditdata ska redigeras eller pseudonymiseras när fullständiga värden inte får bevaras.

## 17.3 Reliable event publication

```text
EventOutboxEntry
  id
  tenant_id
  domain_event_id
  destination_type
  status
  available_at
  attempt_count
  delivered_at
```

En förändring och dess event måste sparas atomiskt. Systemet får inte lyckas uppdatera en faktura men tappa eventet som skulle trigga en automation.

## 17.4 Projection checkpoint

```text
ProjectionCheckpoint
  id
  projection_name
  tenant_id
  last_processed_event_id
  last_processed_at
  status
```

Sökindex, timeline och analysdata ska kunna byggas om från kanonisk data och events.

---

# 18. Workflow- och automationsmotor

## 18.1 Workflow definition

```text
WorkflowDefinition
  id
  tenant_id
  name
  object_type_id
  status
  current_version_id
```

## 18.2 Workflow version

```text
WorkflowVersion
  id
  workflow_definition_id
  version_number
  trigger_definition
  active_from
  retired_at
```

Aktiverade workflowversioner är immutabla. Pågående körningar fortsätter med den version som startade dem.

## 18.3 Workflow graph

```text
WorkflowNode
  id
  workflow_version_id
  node_type
  node_configuration
  timeout_policy
  retry_policy
```

```text
WorkflowEdge
  id
  workflow_version_id
  source_node_id
  target_node_id
  condition
  sequence
```

Nodtyper:

- trigger
- condition
- action
- delay
- wait until event
- branch
- loop with explicit limit
- human approval
- completion
- failure handling

## 18.4 Workflow run

```text
WorkflowRun
  id
  tenant_id
  workflow_version_id
  trigger_event_id
  subject_record_id
  actor_id
  status
  started_at
  completed_at
  correlation_id
```

```text
WorkflowStepRun
  id
  workflow_run_id
  workflow_node_id
  status
  input_snapshot
  output_snapshot
  attempt_count
  scheduled_at
  started_at
  completed_at
  error_code
```

## 18.5 Action ledger

```text
AutomationActionLedger
  id
  tenant_id
  workflow_run_id
  workflow_node_id
  subject_record_id
  action_type
  idempotency_key
  external_effect_reference
  status
  executed_at
```

Varje extern effekt ska ha en stabil idempotency key.

En retry får inte:

- skicka samma avtal två gånger
- skapa samma faktura två gånger
- skicka samma mejl två gånger
- skapa samma task två gånger

Workflowmotorn ska ha loop protection och ett maximalt antal automatiska förändringar per korrelationskedja.

---

# 19. Integrationsmodell

Integrationsarkitekturen ska vara provider-agnostisk. Fortnox, Scrive och Microsoft-liknande system implementeras som adaptrar till samma modell.

## 19.1 Integration application

```text
IntegrationApplication
  id
  provider_key
  name
  supported_object_types
  supported_capabilities
  status
```

## 19.2 Connection

```text
IntegrationConnection
  id
  tenant_id
  integration_application_id
  legal_entity_id
  connection_name
  external_tenant_id
  status
  credential_reference
  connected_at
  disconnected_at
```

Credentials ska inte lagras som vanliga affärsfält.

## 19.3 External object link

```text
ExternalObjectLink
  id
  tenant_id
  connection_id
  external_object_type
  external_object_id
  local_record_id
  external_version
  source_updated_at
  last_synced_at
  sync_hash
  status
```

Unik constraint:

```text
connection_id + external_object_type + external_object_id
```

Provider-ID får aldrig användas som CRM:ets kanoniska record-ID.

## 19.4 Field mapping

```text
IntegrationFieldMapping
  id
  tenant_id
  connection_id
  external_object_type
  external_field_key
  object_type_id
  field_definition_id
  direction
  transformation_rule
  status
```

## 19.5 Source authority

```text
FieldAuthorityRule
  id
  tenant_id
  connection_id
  object_type_id
  field_definition_id
  authority_mode
  conflict_strategy
  priority
```

Exempel på authority modes:

- user authoritative
- CRM authoritative
- external authoritative
- most recently updated
- require manual resolution

Manuella förändringar får inte skrivas över tyst av nästa sync.

## 19.6 Field provenance

```text
FieldProvenance
  id
  tenant_id
  record_id
  field_definition_id
  source_link_id
  source_type
  source_updated_at
  confidence
  authority_priority
  value_hash
```

Det ska gå att svara på varifrån ett fältvärde kom och varför det valdes.

## 19.7 Sync state

```text
SyncCursor
  id
  connection_id
  object_type
  cursor_value
  last_successful_sync_at
```

```text
SyncRun
  id
  tenant_id
  connection_id
  sync_type
  status
  started_at
  completed_at
  records_read
  records_created
  records_updated
  records_failed
```

```text
SyncItem
  id
  sync_run_id
  external_object_type
  external_object_id
  local_record_id
  operation
  status
  error_code
  retry_count
```

## 19.8 Webhook receipt

```text
WebhookReceipt
  id
  tenant_id
  connection_id
  external_event_id
  event_type
  payload_checksum
  source_occurred_at
  received_at
  processing_status
```

Samma externa event ska kunna tas emot flera gånger utan att skapa flera interna effekter.

## 19.9 Sync conflict

```text
SyncConflict
  id
  tenant_id
  connection_id
  record_id
  field_definition_id
  local_value
  external_value
  local_updated_at
  external_updated_at
  status
  resolution
  resolved_by
  resolved_at
```

## 19.10 Outbound operation

```text
OutboundIntegrationOperation
  id
  tenant_id
  connection_id
  operation_type
  local_record_id
  expected_external_version
  idempotency_key
  status
  attempt_count
  created_at
  completed_at
```

## 19.11 Integrationsregler

Integrationssystemet måste:

- hantera events som kommer i fel ordning
- ignorera stale versioner
- kunna fortsätta efter avbrott
- förhindra sync-loopar
- stödja backfill
- stödja full resync
- rapportera delvis misslyckade körningar
- bevara externa dokumentnummer
- skilja externa raderingar från lokala arkiveringar
- respektera GDPR-tombstones så raderade personer inte återimporteras

## 19.12 Registry providers och TIC.io

TIC.io ska modelleras som en extern registry provider för bolagsdata, persondata, arbetsställen, årsredovisningar, konkurser, risk/status-signaler, prospektering och enrichment. TIC.io får inte bli CRM:ets source of truth och provider-ID får inte lagras direkt på `Organization` som kanonisk identitet.

Registry providers ska ligga bakom ett generiskt lager:

```text
ExternalRegistryProvider
  id
  provider_key
  name
  status
```

```text
ExternalRegistryObject
  id
  tenant_id
  provider_id
  external_object_type
  external_object_id
  normalized_identifier
  country_code
  raw_payload_reference
  payload_hash
  source_updated_at
  fetched_at
```

```text
ExternalRegistryLink
  id
  tenant_id
  provider_id
  external_object_type
  external_object_id
  local_record_id
  local_object_type
  confidence
  status
  created_at
```

TIC.io kan vara första provider, men samma modell ska kunna stödja Roaring, Creditsafe, Bolagsverket-data, egna importer eller andra datakällor.

## 19.13 Registry snapshots och observations

Extern registry-data ska först lagras som källbelagda snapshots, observations och relationer. CRM-fält får bara uppdateras genom definierade authority rules.

```text
RegistryCompanySnapshot
  id
  tenant_id
  provider_id
  external_company_id
  organization_number
  legal_name
  status
  industry_code
  fetched_at
  source_updated_at
  raw_payload_reference
```

```text
RegistryMetricObservation
  id
  tenant_id
  provider_id
  organization_id
  metric_type
  period_start
  period_end
  amount_minor
  currency_code
  numeric_value
  source_link_id
  reported_at
```

```text
RegistryRoleAssignment
  id
  tenant_id
  provider_id
  person_id
  organization_id
  role_type
  valid_from
  valid_to
  source_link_id
```

Exempel på authority rules:

- `organization_number`: external authoritative
- `legal_name`: external authoritative unless user overrides display name
- `display_name`: user authoritative
- `address`: external authoritative with manual override
- `industry_code`: external authoritative
- `revenue_history`: external observation only
- `board_roles`: external observation only
- `risk_status`: external authoritative with timestamp
- `notes`: user authoritative only

## 19.14 Registry import och enrichment flow

Ett TIC.io-liknande importflöde ska vara kontrollerat:

1. User söker bolag eller person via registry provider.
2. Systemet sparar sökresultat som external candidate.
3. Systemet matchar mot befintliga `Organization` och `Person`.
4. User väljer importera eller enrich.
5. Backend skapar eller uppdaterar CRM-record genom application use case.
6. Backend skapar `ExternalRegistryLink`.
7. Backend skapar `FieldProvenance` per promotat fält.
8. Backend skapar metric observations.
9. Backend skapar role assignments.
10. Backend skriver domain event, exempelvis `organization.enriched`.
11. Workflows och AI kan reagera på ny data.

Importera inte allt okontrollerat. Registry-sök ska visa, matcha, låta användaren välja och sedan importera eller enrich:a med tydlig provenance.

## 19.15 Prospecting

Registry providers ska kunna användas som prospecting engine utan att blanda ihop prospekteringsresultat med CRM-masterdata.

```text
ProspectingQuery
  id
  tenant_id
  provider_id
  name
  query_definition
  created_by
  created_at
```

```text
ProspectingResult
  id
  tenant_id
  prospecting_query_id
  external_object_id
  normalized_identifier
  score
  matching_reasons
  status
  imported_record_id
  dismissed_at
  created_at
```

```text
ProspectingList
  record_id
  name
  source
  owner_principal_id
  status
```

```text
ProspectingListMember
  id
  tenant_id
  prospecting_list_id
  external_object_id
  local_record_id
  score
  status
  added_at
```

Prospecting ska kunna uttrycka urval som svenska bolag i en bransch, storleksintervall, växande omsättning, riskstatus, saknad aktiv affär och inte redan kund. Resultat är candidates tills de importeras, avvisas eller kopplas till befintliga records.

---

# 20. Query-, sök- och filtermodell

Backend ska erbjuda en gemensam querymodell över built-in-fält, custom fields och relationer.

## 20.1 Query definition

```text
RecordQuery
  tenant_id
  object_type_id
  selected_fields
  filter_expression
  relationship_filters
  sort_specification
  cursor
  page_size
  as_of
```

Filteruttryck måste stödja:

- AND
- OR
- NOT
- equality
- ranges
- relative dates
- exists
- text matching
- option membership
- owner and team
- relationship traversal
- aggregate conditions
- custom fields

Relationsdjup måste begränsas för att undvika oavsiktligt extrema frågor.

## 20.2 Pagination

Cursor-baserad pagination ska användas för stabila resultat.

En cursor ska bära:

- sort values
- record ID
- query version

Offset-baserad pagination ska inte vara den primära modellen för stora datamängder.

## 20.3 Search projection

```text
SearchDocument
  id
  tenant_id
  record_id
  object_type_id
  display_text
  exact_identifiers
  normalized_tokens
  searchable_content
  access_scope_version
  source_record_version
  indexed_at
```

SearchDocument är härledd och rebuildable.

Sökresultat måste alltid filtreras genom aktuell behörighet. En gammal search projection får inte exponera data efter att användarens access tagits bort.

---

# 21. Rapportering, mål och historiska metrics

## 21.1 Analytiska facts

Skapa härledda facts från domain events och kanoniska records.

```text
OpportunityTransitionFact
  tenant_id
  opportunity_id
  from_stage_id
  to_stage_id
  occurred_at
  owner_principal_id
  amount_minor
  currency_code
```

```text
EngagementFact
  tenant_id
  engagement_id
  engagement_type
  occurred_at
  owner_principal_id
  account_id
  opportunity_id
```

```text
RevenueFact
  tenant_id
  legal_entity_id
  account_id
  invoice_id
  payment_id
  fact_type
  occurred_on
  amount_minor
  currency_code
```

```text
SubscriptionFact
  tenant_id
  account_id
  subscription_id
  period_start
  period_end
  mrr_minor
  arr_minor
  currency_code
```

Alla facts ska kunna spåras till källrecord eller källevent.

## 21.2 Metric definitions

```text
MetricDefinition
  id
  tenant_id
  stable_key
  name
  subject_type
  aggregation_type
  measure_definition
  dimension_definitions
  status
  version
```

## 21.3 Metric observation

```text
MetricObservation
  id
  tenant_id
  metric_definition_id
  subject_record_id
  period_start
  period_end
  measured_at
  numeric_value
  amount_minor
  currency_code
  dimensions
  source_version
```

## 21.4 Goals

```text
GoalDefinition
  record_id
  metric_definition_id
  target_subject_principal_id
  target_business_unit_id
  target_value
  period_type
  start_date
  end_date
  status
```

```text
GoalProgressSnapshot
  id
  tenant_id
  goal_definition_id
  captured_at
  current_value
  target_value
  source_metric_version
```

Det ska vara möjligt att visa vad ett mål låg på vid ett tidigare datum utan att dagens data skriver om historiken.

---

# 22. AI, agents och rekommendationer

AI-data ska alltid betraktas som härledd data. Den får inte automatiskt bli affärsmässig sanning.

## 22.1 Insight

```text
Insight
  record_id
  insight_type
  subject_record_id
  title
  summary
  priority_score
  confidence
  status
  source_state_hash
  generated_at
  expires_at
  generator_version
```

## 22.2 Evidence

```text
InsightEvidence
  id
  tenant_id
  insight_id
  evidence_record_id
  domain_event_id
  field_definition_id
  source_timestamp
  relevance_score
```

Varje rekommendation ska kunna förklaras med evidens.

Exempel:

```text
"Följ upp kunden"
```

Evidens:

- offert på 150 000 kr skickades för nio dagar sedan
- ingen aktivitet har skett efter utskicket
- offerten förfaller om tre dagar

## 22.3 Generated artifact

```text
GeneratedArtifact
  record_id
  artifact_type
  subject_record_id
  content_reference
  status
  generated_by_agent_run_id
  approved_by
  approved_at
```

Exempel:

- e-postutkast
- kundsammanfattning
- mötessammanfattning
- offertutkast
- account brief

## 22.4 Agent run

```text
AgentRun
  id
  tenant_id
  agent_definition_id
  actor_id
  subject_record_id
  status
  started_at
  completed_at
  source_state_hash
  correlation_id
```

```text
AgentStep
  id
  agent_run_id
  step_type
  input_reference
  output_reference
  status
  started_at
  completed_at
```

## 22.5 Approval

```text
ApprovalRequest
  record_id
  requested_action_type
  subject_record_id
  requested_by_actor_id
  approver_principal_id
  status
  expires_at
  approved_at
  rejected_at
```

AI eller agents får inte utföra riskfyllda handlingar utan uttrycklig policy eller godkännande.

Riskfyllda handlingar inkluderar:

- skicka extern kommunikation
- skapa faktura
- ändra kontrakt
- radera data
- ändra behörighet
- markera affär som vunnen
- skriva över extern systemdata

AI-resultat ska invalidieras när underliggande record-versioner förändras.

---

# 23. GDPR, samtycke och datalivscykel

## 23.1 Processing purpose

```text
ProcessingPurpose
  id
  tenant_id
  stable_key
  name
  description
  status
```

## 23.2 Consent

```text
ConsentRecord
  id
  tenant_id
  person_id
  contact_point_id
  processing_purpose_id
  legal_basis
  status
  captured_at
  expires_at
  source
  evidence_reference
```

Samtycke ska knytas till syfte och kanal, inte bara till personen generellt.

## 23.3 Suppression

```text
SuppressionEntry
  id
  tenant_id
  contact_point_id
  suppression_type
  reason
  effective_from
  effective_to
```

## 23.4 Retention

```text
RetentionPolicy
  id
  tenant_id
  object_type_id
  source_type
  retention_period
  deletion_mode
  status
```

## 23.5 Data subject request

```text
DataSubjectRequest
  id
  tenant_id
  person_id
  request_type
  status
  received_at
  due_at
  completed_at
  verification_status
```

Typer:

- access
- export
- correction
- restriction
- deletion
- objection

## 23.6 Legal hold

```text
LegalHold
  id
  tenant_id
  subject_record_id
  reason
  valid_from
  valid_to
  created_by
```

## 23.7 Deletion job

```text
DeletionJob
  id
  tenant_id
  subject_record_id
  deletion_scope
  status
  scheduled_at
  completed_at
  failure_reason
```

## 23.8 Tombstone

```text
DeletionTombstone
  id
  tenant_id
  identity_type
  identity_hash
  source_connection_id
  deleted_at
  expires_at
```

Tombstones ska förhindra att en raderad person automatiskt återimporteras från samma externa källa.

## 23.9 Extern persondata från registry providers

Registry providers som TIC.io kan innehålla persondata och ska behandlas som högre risk än ren bolagsdata. Bolagsdata kan cacheas bredare enligt retention policy, men persondata ska importeras restriktivt och alltid ha syfte, källa, retention och raderingsväg.

```text
ExternalDataProcessingRule
  id
  tenant_id
  provider_id
  object_type
  allowed_purposes
  retention_period
  import_mode
  requires_user_action
  status
```

```text
PersonalDataSourceLink
  id
  tenant_id
  person_id
  provider_id
  external_object_id
  legal_basis
  processing_purpose
  fetched_at
  expires_at
```

`import_mode` ska kunna skilja mellan cache-only, user-selected import, enrichment och blocked. Persondata från registry providers får inte automatiskt bli CRM-masterdata utan legal basis och processing purpose.

Soft delete är inte samma sak som GDPR-radering. Den faktiska raderingen måste omfatta:

- meddelandeinnehåll
- filer
- AI-sammanfattningar
- search projections
- custom fields
- integrationspayloads
- exports
- härledda data där individen kan identifieras

---

# 24. Backendoperationer och kommandosemantik

## 24.1 Mutations

Alla mutations ska stödja:

```text
CommandContext
  tenant_id
  actor_id
  idempotency_key
  expected_record_version
  correlation_id
  causation_id
  request_timestamp
```

Ett kommando ska:

1. verifiera tenant
2. verifiera behörighet
3. verifiera record-version
4. validera domänregler
5. uppdatera current state
6. skriva domain event
7. skriva audit event
8. köa event publication
9. returnera ny record-version

## 24.2 Idempotency

```text
IdempotencyRecord
  tenant_id
  actor_id
  idempotency_key
  command_type
  request_hash
  response_reference
  status
  created_at
  expires_at
```

Samma idempotency key med annan request payload ska nekas.

## 24.3 Bulk jobs

```text
BulkJob
  id
  tenant_id
  job_type
  actor_id
  status
  total_items
  processed_items
  succeeded_items
  failed_items
  created_at
  completed_at
```

```text
BulkJobItem
  id
  bulk_job_id
  source_reference
  target_record_id
  status
  error_code
```

Bulkimporter ska stödja delvis misslyckande utan att dölja vilka rader som misslyckades.

## 24.4 Externa API-klienter

```text
ApiClient
  id
  tenant_id
  name
  principal_id
  status
```

```text
ApiScope
  api_client_id
  capability_id
```

## 24.5 Webhook subscriptions

```text
WebhookSubscription
  id
  tenant_id
  target_reference
  event_type_filter
  object_type_filter
  status
  secret_reference
```

```text
WebhookDelivery
  id
  subscription_id
  domain_event_id
  idempotency_key
  status
  attempt_count
  next_attempt_at
  delivered_at
```

Eventformat måste vara versionerat.

---

# 25. Centrala domäninvarianter

Följande regler ska upprätthållas centralt:

1. Alla relaterade records måste tillhöra samma tenant.
2. Ett record måste matcha sin object type och sin typade domäntabell.
3. En extern object link måste vara unik inom sin connection.
4. Ett opportunity stage måste tillhöra rätt pipelineversion.
5. En affär i won- eller lost-stage måste ha terminal status.
6. En affär kan endast ha ett aktuellt stage.
7. Alla stage changes måste skapa stage history.
8. Dokumentets totaler måste stämma med dess rader.
9. Ett dokument får endast innehålla en valuta.
10. En utfärdad faktura får inte ändras godtyckligt.
11. En signerad kontraktsversion är immutable.
12. En workflow run ska vara bunden till en specifik workflowversion.
13. Externa effekter måste vara idempotenta.
14. Manuella värden får inte skrivas över utan authority rule.
15. Optionvärden får inte återanvända gamla stable keys.
16. Raderade identity keys måste respektera tombstones.
17. AI-data får inte betraktas som kanonisk utan explicit godkännande.
18. Härledda projections får aldrig vara enda kopian av affärskritisk data.
19. Behörighet måste tillämpas på queries, exports, search och bakgrundsjobb.
20. Money calculations får aldrig använda binära flyttal.
21. Better Auth-organization och membership får inte användas som kanoniska CRM-tenant- eller permission-records utan mapping via auth-länkar.
22. Registry provider-data får inte skriva över CRM-fält utan `FieldAuthorityRule` och `FieldProvenance`.
23. Persondata från registry providers måste ha legal basis, processing purpose, retention och raderingsväg.

---

# 26. Exempel på komplett backendflöde

En kund betalar en faktura i Fortnox:

1. Integrationen tar emot ett externt event.
2. `WebhookReceipt` skapas med det externa event-ID:t.
3. Systemet verifierar att eventet inte redan behandlats.
4. `ExternalObjectLink` används för att hitta den lokala fakturan.
5. Eventets externa version jämförs med senast behandlade version.
6. Fakturans balans och status uppdateras.
7. `DocumentStatusHistory` uppdateras.
8. Ett `invoice.paid` domain event skrivs.
9. Ett audit event registrerar att integrationen gjorde ändringen.
10. En `RevenueFact` skapas eller uppdateras.
11. En timeline projection skapas på accountet.
12. Workflows med triggern `invoice.paid` utvärderas.
13. Ett workflow kan skapa en uppföljningstask.
14. AI-lagret kan skapa en expansion-rekommendation.
15. Alla externa effekter använder egna idempotency keys.

Om samma Fortnox-event kommer igen ska steg 4 till 15 inte skapa duplicerade effekter.

---

# 27. End-state acceptance criteria

Backendmodellen är redo som end-state när följande fungerar:

- En tenant kan ha flera egna juridiska enheter och flera ekonomiintegrationer.
- Samma externa företag kan ha olika accountrelationer till olika juridiska enheter.
- En administratör kan skapa ett custom object, typade custom fields och relationer utan att kärnmodellen ändras.
- Custom fields kan filtreras, sorteras, valideras och historiseras.
- Affärens fulla stage history kan rekonstrueras.
- Pipeline och forecast kan visas korrekt för ett historiskt datum.
- Två duplicerade organisationer kan mergas utan att aktiviteter, dokument eller integration mappings förloras.
- Ett externt event kan tas emot flera gånger utan dubbla actions.
- Manuella fält skrivs inte över av integrationer utan en definierad authority rule.
- Offerter, ordrar, fakturor och betalningar kan spåras genom hela dokumentkedjan.
- Ett kontrakt kan ha flera immutable versioner och flera signatärer.
- Kommunikation kan länkas till flera records utan att dupliceras.
- Timeline kan byggas om från kanoniska records och events.
- Workflows är versionerade och varje action är idempotent.
- En användare utan access kan inte hitta ett record genom search, exports eller rapporter.
- GDPR-radering tar bort kanonisk data, härledd data, filer och AI-artifacts.
- AI-rekommendationer innehåller evidens och source-state-version.
- Alla förändringar kan spåras till en actor, correlation ID och audit event.
- Systemet kan återuppta en avbruten integration sync utan fullständig omstart.
- Stora aktivitetsvolymer kräver inte att kärnobjektens schema byggs om.
- Better Auth kan bytas eller uppgraderas utan att CRM:ets tenant-, principal- eller permissionmodell skrivs om.
- TIC.io eller annan registry provider kan användas för sök, enrichment och prospecting utan att provider-ID blir CRM:ets kanoniska identitet.
- Registry-importer visar, matchar och kräver användarvald import eller enrichment innan extern data promootas till CRM-records.

# 28. Antimönster att undvika

Undvik särskilt:

- en gigantisk tabell där alla CRM-objekt är ostrukturerade dokument
- EAV för alla built-in-fält
- ett enda generiskt activity-objekt som lagrar all domänlogik i en payload
- provider-ID som primär identitet
- pipelines som hårdkodade strängar
- labels som används som stabila nycklar
- historisk rapportering från endast current-state-data
- integrationer som skriver direkt utan provenance
- automationer utan versionshantering och idempotency
- soft delete som enda GDPR-lösning
- ett enda customer-statusfält på själva organisationen
- AI-genererade värden som tyst skriver över användarens data
- Better Auth-organization som direkt ersätter CRM `Tenant`
- Better Auth-roller som direkt ersätter CRM record-, field- och workflow-permissions
- TIC.io-ID eller annat provider-ID direkt på `Organization` som kanoniskt ID
- registry enrichment som tyst skriver över manuella CRM-värden
- brett importerad registry-persondata utan syfte, legal basis och retention

Den viktigaste designprincipen är att skilja på **verkliga parter**, **tenantens kommersiella relationer**, **transaktionella affärsobjekt**, **extern systemdata** och **härledd data**. Det gör att modellen kan växa från ett enkelt Fortnox-CRM till en plattform som faktiskt kan konkurrera med Lime, Upsales och större internationella CRM-system.
