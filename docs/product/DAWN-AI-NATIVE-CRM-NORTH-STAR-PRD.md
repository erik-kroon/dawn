# Dawn AI-Native CRM North-Star PRD

**Product:** Dawn  
**Status:** End-state product definition  
**Date:** 2026-06-20  
**Primary market:** Sweden  
**Initial product language:** Swedish  
**Category:** AI-native CRM and autonomous revenue engine  
**Core platforms:** TIC LENS and TIC Identity, Flue agent runtime, accounting providers, communication providers  

## Document Contract

This document defines the optimal end-state product and system design for Dawn. It is intentionally independent of the current repository, current implementation order and current MVP constraints.

It should be used to derive narrower release PRDs, architecture decisions, vertical slices and evaluation plans. It is not itself a promise that every capability ships in one release.

## Executive Definition

Dawn is an AI-native CRM for Swedish B2B companies.

It starts before a traditional CRM with the Swedish company universe and ends after a traditional CRM with signed agreements, accounting-provider invoices and paid revenue.

Dawn continuously understands the market, learns each workspace's ideal customer profiles, discovers and prioritises companies, resolves likely buyers, runs outreach, maintains CRM state, advances deals, creates commercial documents, coordinates BankID signing, hands revenue into accounting and learns from every commercial outcome.

The core loop is:

```text
Understand the business and revenue goal
  -> map the addressable Swedish company market
    -> discover and refine ICPs
      -> identify and prioritise target companies
        -> resolve people and buying roles
          -> execute and adapt outreach
            -> qualify and create pipeline
              -> prepare proposal, quote and contract
                -> identify, verify and sign through TIC
                  -> create accounting-provider invoice
                    -> observe payment and commercial outcome
                      -> improve the market model, ICP and next run
```

Dawn is not a CRM with an AI chat panel. AI is a first-class operator of the product, a first-class author of product state and a first-class participant in commercial workflows.

## Product Thesis

Traditional CRM begins after a seller already knows which company to pursue. Lead databases stop after returning rows and contact details. Outreach platforms optimise sending but rarely understand the company deeply or observe the eventual financial outcome. Accounting systems begin after the commercial decision has already been made.

Dawn connects the entire commercial loop.

The product thesis is based on five beliefs:

1. Frontier models can perform high-value semantic sales work such as understanding a business model, discovering market segments, judging ICP fit, identifying likely pain, selecting personas, writing account strategies and operating a pipeline.
2. Swedish registry, company, role, financial and trust data create an unusually strong substrate for an AI-native commercial product.
3. A CRM becomes far more valuable when it starts with the company universe instead of an empty database.
4. The strongest learning signal is not a user's manual score. It is whether a prospect replied, met, bought, signed, was invoiced and paid.
5. High agent autonomy requires a durable execution environment, typed tools, observability, idempotent external actions and configurable blast-radius controls. It does not require reducing the model to a suggestion engine.

## Category And Positioning

### Category

Dawn creates a category between CRM, market intelligence, autonomous sales execution and quote-to-cash:

> **AI-native CRM and autonomous revenue engine for the Swedish company market.**

### Positioning

Primary positioning:

> **Dawn understands Sweden's companies, builds the right pipeline and turns opportunities into signed and paid revenue.**

Alternative concise positioning:

> **The CRM that already knows the Swedish market.**

### Strategic Wedge

The initial wedge is Swedish B2B sales where company intelligence, Fortnox or Spiris, commercial documents and BankID create a differentiated end-to-end workflow.

The end-state product is broader than a Fortnox plug-in and broader than electronic signing. Fortnox and Spiris are accounting backends. TIC is the primary company and trust substrate. Flue is the agent runtime. Dawn owns the commercial graph, intelligence, execution and outcome learning.

## End-State Product Outcomes

A successful Dawn workspace can:

- describe what it sells and what revenue it wants
- connect accounting, email, calendar and other commercial systems
- infer ICPs from the business, products and best paid customers
- ask Dawn to build pipeline for a period, region, vertical or revenue target
- continuously process the Swedish company market for suitable accounts
- discover new market clusters that the user did not explicitly define
- create and maintain prospects, accounts, people, deals and strategies without manual data entry
- execute personalised outreach across approved channels
- classify replies and advance the next action
- create opportunities and keep pipeline state current from real interactions
- generate proposals, quotes and agreements from deal context
- verify identity and company context through TIC
- collect BankID signatures with durable evidence
- create invoices or orders in the connected accounting provider
- observe payment and link it back to the originating market thesis
- improve targeting, messaging and execution based on outcomes

## Goals

### G1. Build High-Quality Pipeline From The Market

Dawn must turn an ICP, revenue goal, territory or set of exemplar customers into a ranked and actionable pipeline.

### G2. Make AI The Primary Commercial Operator

Dawn agents must be able to create and mutate product state, run long-lived workflows, communicate externally and execute commercial actions within workspace policy.

### G3. Maintain A Unified Commercial Memory

The product must retain market context, company understanding, relationship history, communications, decisions, documents, provider state and financial outcomes in one coherent graph.

### G4. Close The Revenue Learning Loop

Every prospecting thesis should be traceable through outreach, deal, quote, signature, invoice and payment. Dawn should learn from actual commercial success and failure.

### G5. Be Swedish By Construction

Organisation numbers, legal entities, workplaces, SNI, company roles, firmateckning, Swedish accounting providers, BankID and Swedish business language must be native concepts rather than localisation patches.

### G6. Support High Autonomy Without Losing Operational Control

Users must be able to delegate meaningful goals to Dawn. The system must support budgets, policies, rate limits, sender protections, action logs, recovery and rollback where possible.

### G7. Remain Provider-Native

TIC is the preferred company and identity substrate and Fortnox is the first accounting motion. Dawn-owned concepts must remain independent from provider-specific IDs, payloads and limitations.

## Non-Goals

Dawn is not intended to become:

- a general ledger or bookkeeping replacement
- a payroll system
- a generic project-management or time-tracking suite
- a generic helpdesk platform
- a horizontal marketing suite for every channel and every market
- a raw data-reselling portal with no commercial workflow
- an email-blasting utility optimised for volume without account understanding
- a general-purpose agent development platform for unrelated business tasks
- a chat interface over disconnected SaaS tools
- a fully unstructured no-code database where core commercial semantics disappear into custom objects

Dawn may expose APIs, MCP tools, custom fields and extension points. These exist to extend the commercial system, not to turn Dawn into a generic platform before the core product is excellent.

## Target Market

### Initial And Core Market

Swedish B2B companies with approximately 2 to 250 employees that have a repeatable sales motion, a definable customer profile and meaningful value per customer.

Strong early segments include:

- consultancies and professional services
- agencies
- software and technology companies
- staffing and recruitment firms
- specialised B2B service companies
- wholesalers and distributors
- accounting and advisory firms
- property, energy and industrial service companies
- vertical SaaS and subscription businesses

### Expansion Market

The architecture should support Nordic company graphs, identities and accounting providers when the Swedish product has proven repeatability.

## Personas

### Founder Or Owner-Manager

Wants Dawn to create growth capacity without hiring a full revenue operations and SDR organisation. Sets business goals, approves strategic direction and reviews high-value exceptions.

### Sales Leader

Defines market strategy, ICPs, territories, positioning, revenue targets and autonomy. Reviews pipeline quality and agent performance.

### Seller Or Account Executive

Uses Dawn's company intelligence, account strategies, conversations, next actions, proposals and deal execution. Spends time on relationships and judgement rather than CRM administration.

### Revenue Operations

Configures pipelines, policies, data sources, integrations, metrics, experiment design, model evaluation and routing.

### Marketing Or Growth Operator

Creates market segments, campaign goals, messages, experiments and account-based motions with agents that operate against the same commercial graph as sales.

### Finance Or Operations

Owns accounting integration, quote-to-cash policy, invoice exceptions, payment visibility and commercial reconciliation.

### External Buyer And Signer

Receives relevant outreach, reviews proposals and agreements, verifies identity and signs through a trusted mobile experience.

## Jobs To Be Done

### Market And ICP

- Tell me how large my actual market is.
- Show me which segments are most likely to buy.
- Learn what my best customers have in common.
- Find adjacent ICPs I have not considered.
- Tell me which territories are underworked.

### Pipeline Creation

- Build enough qualified pipeline to reach a revenue target.
- Find the best companies in a region or vertical.
- Identify why each company is relevant.
- Find the right person and the right reason to contact them.
- Keep finding new companies as the market changes.

### Sales Execution

- Contact the right accounts with a credible point of view.
- Adapt outreach based on replies and new information.
- Keep CRM state current without manual updates.
- Tell me the next best move and execute it when allowed.
- Prepare me for every meeting and follow up afterward.

### Commercial Completion

- Turn a qualified deal into a correct proposal or agreement.
- Get the right person through BankID signing.
- Understand the signer and company context.
- Create the right invoice or order in accounting.
- Show whether the commercial outcome became paid revenue.

## Product Principles

### 1. AI Is An Operator, Not A Feature

AI can create prospects, accounts, contacts, strategies, deals, tasks, messages, documents and actions. It can change its plan and continue working. Human approval is a configurable policy, not a universal architectural requirement.

### 2. The Company Graph Comes Before The CRM

The CRM begins with companies that already exist in the market. Workspace-specific relationships and activity sit on top of a reusable company graph.

### 3. Goals Are More Important Than Screens

Users should be able to state outcomes such as “build 2 million SEK of qualified pipeline in western Sweden” and let Dawn plan and execute the work.

### 4. AI-Authored State Is First-Class State

Business model, ICP fit, account strategy, likely pain, buyer hypothesis, timing, deal risk and next move are real product fields. They are directly queryable, editable and actionable. Their generation history is retained without treating them as second-class annotations.

### 5. The Product Is Continuous

Dawn does not only respond to user queries. It monitors companies, communication, pipeline and revenue state and acts when goals or triggers require work.

### 6. Autonomy Is Configurable

The workspace decides what Dawn can execute, at what volume, with which identities and under which budgets. Blast-radius controls enable high autonomy rather than replacing it.

### 7. One Commercial Graph, Many Providers

TIC, accounting systems, communication systems and contact-data providers enrich the graph. Provider IDs and payloads never become the core data model.

### 8. Outcome Learning Beats Manual Scoring

The system optimises against replies, meetings, qualified opportunities, signed agreements, invoices and payments. User feedback improves the model but does not replace commercial outcomes.

### 9. Structured Product Surfaces Beat Chat-Only UX

Natural language is a command surface. Runs, markets, companies, deals, conversations, documents, goals and agent work remain structured and navigable.

### 10. Every External Action Is Traceable

High autonomy requires a durable history of what the agent saw, decided, changed and sent. This is an execution requirement, not a restriction on reasoning.

## Canonical Product Loop

```text
Business model and connected systems
  -> revenue goal
    -> ICP hypotheses and exemplars
      -> market query and territory plan
        -> company discovery and deep analysis
          -> account prioritisation and contact resolution
            -> channel strategy and outreach execution
              -> response and meeting intelligence
                -> opportunity creation and deal operation
                  -> proposal and commercial negotiation
                    -> identity, trust and signature
                      -> accounting handoff and payment
                        -> outcome attribution and learning
```

Every object and module in Dawn should support this loop.

# Product Architecture

## Architecture Overview

Dawn consists of six logical planes:

```text
1. Market Data Plane
   Global Swedish company, person, role, workplace and event graph

2. Workspace Commercial Plane
   Workspace relationships, prospects, accounts, contacts, deals and revenue state

3. Intelligence Plane
   AI-authored company understanding, ICPs, strategies, messages and predictions

4. Agent Execution Plane
   Flue goals, runs, plans, tasks, memory, tools, checkpoints and evaluations

5. Integration And Evidence Plane
   TIC, accounting, email, calendar, telephony, documents, signing and provider events

6. Experience Plane
   Command Center, Market, Prospects, Companies, Pipeline, Conversations, Revenue and Agents
```

## State Classes

Dawn stores three equally important classes of product state.

### External Facts

Examples:

- organisation number
- registered legal name
- company status
- SNI codes
- financial period data
- company roles
- accounting customer number
- invoice status
- payment status
- signature evidence

These retain source, retrieval time, validity and raw provider lineage.

### Dawn-Owned Commercial State

Examples:

- prospect status
- account relationship
- deal stage
- outreach sequence
- commercial document
- workspace goal
- owner
- next action
- invoice handoff state

### AI-Authored Commercial State

Examples:

- business model
- sales motion
- ICP fit
- market segment
- account thesis
- likely pain
- likely buying committee
- recommended persona
- timing assessment
- outreach angle
- next best move
- opportunity quality
- deal risk
- forecast narrative

AI-authored state is stored as current state with a revision history. The product reads it exactly as it reads human-authored commercial state. Generation metadata is retained separately for replay, evaluation and debugging.

## Global Graph And Workspace Overlay

Dawn should separate shared market entities from private workspace relationships.

```text
GlobalCompany
  registry identity and market facts

GlobalPerson
  public or provider-derived person identity where permitted

CompanyRole
  person-to-company role assignment

CompanyRelationship
  ownership, group, workplace or other company edge

WorkspaceCompany
  a team's private relationship to a GlobalCompany

Prospect / Account
  commercial lifecycle state inside one workspace

WorkspaceIntelligence
  team-specific interpretation based on its products, ICP and outcomes
```

This separation enables multiple workspaces to understand the same legal company differently without duplicating core registry identity or leaking private CRM state.

# Information Architecture

## Primary Navigation

```text
Home
Market
Prospects
Companies
People
Pipeline
Conversations
Documents
Revenue
Goals
Agents
Settings
```

Small workspaces may use a reduced navigation. The underlying capabilities remain available through command search and agent actions.

## Home: Command Center

Home is not a passive dashboard. It is a live operating surface.

It shows:

- progress against commercial goals
- what Dawn completed since the user's last visit
- high-value decisions and exceptions
- accounts to contact now
- replies that require human judgement
- meetings and preparation
- deals at risk
- documents awaiting action
- signing and trust exceptions
- invoice and payment exceptions
- active agent runs and current capacity

The universal command bar accepts instructions such as:

```text
Build pipeline for Q4 in Västra Götaland.
Find companies similar to our five fastest-closing customers.
Work the accounting-firm segment until we have ten qualified meetings.
Prepare me for tomorrow's customer calls.
Turn this opportunity into a proposal and start signing when accepted.
```

## Market

The Market module exposes the Swedish company universe as an actionable map.

Capabilities:

- natural-language and structured company search
- region, municipality, workplace and address analysis
- SNI and AI-derived segment exploration
- company size, financial and growth filters
- ownership and group navigation
- market sizing
- coverage analysis against the current CRM
- whitespace and saturation analysis
- trigger and company-event exploration
- discovered segment clusters
- save as territory, segment or ICP seed

Views:

```text
Market map
Company table
Segment explorer
Territory coverage
Trigger feed
Saved universes
```

## Prospects

Prospects is the working surface between the company universe and active CRM relationships.

Capabilities:

- ICP profiles
- prospecting runs
- ranked companies
- account theses
- likely buyer roles
- contact candidates
- model-authored reasons to pursue or skip
- campaign or territory assignment
- agent progress
- promotion to account and deal
- rejection, suppression and feedback
- continuous monitoring

Views:

```text
Runs
Lead review
Target accounts
Contact queue
Outreach-ready
Monitoring
Rejected and suppressed
```

## Companies

The company page is Dawn's core object view.

It combines:

### Identity And Registry

- legal name
- organisation number
- legal entity type
- company status
- addresses and workplaces
- SNI codes
- registration information
- ownership and group graph
- beneficial owners where available
- representatives and signatories

### Financial And Risk Context

- financial summaries and periods
- revenue, result and employee indicators
- credit and debtor signals where licensed
- company changes and events
- risk and trust context

### AI Company Intelligence

- concise description of what the company does
- business model
- customer model
- likely sales motion
- maturity and complexity
- ICP fit by active profile
- pain hypotheses
- timing thesis
- likely buying committee
- recommended persona
- recommended commercial angle
- next best move

### Workspace Relationship

- prospect or account state
- owner and team
- contacts
- communications
- meetings
- deals
- proposals and contracts
- signatures
- accounting customer mapping
- invoices and payment history
- agent memory and active plans
- complete timeline

## People

People unifies known contacts, registry roles, buying-role hypotheses and communication identity.

Capabilities:

- person profile and company relationships
- current and historical company roles
- likely buyer-role assessment
- contact details and verification state
- interaction history
- active sequences
- relationship strength
- consent, suppression and channel status where required
- identity verification and signer evidence where applicable

## Pipeline

Pipeline contains opportunities but does not depend on manual stage upkeep.

Capabilities:

- multiple pipelines and views
- AI-maintained deal stage and next move
- opportunity thesis
- value, probability and timing
- buying committee
- competition and objections
- activity and conversation summary
- product or service configuration
- proposal, signature, invoice and payment state
- agent plan and completed actions
- forecast and risk

## Conversations

Conversations unifies outbound and inbound commercial communication.

Capabilities:

- email threads
- calendar and meeting state
- call records and transcripts where connected
- reply classification
- intent and objection extraction
- action and commitment extraction
- automatic CRM updates
- agent-generated and human-generated messages
- sequence state
- brand and sender voice
- next reply generation and execution

## Documents

Documents owns Dawn commercial documents and evidence.

Document types:

- proposal
- quote
- contract
- amendment
- order request
- supporting attachment
- signed evidence package

Capabilities:

- AI drafting from deal and conversation context
- product and price configuration
- reusable content and terms
- collaboration and negotiation
- immutable issued versions
- secure recipient experience
- BankID signing through TIC
- multiple signers and signing order
- signer and company context
- evidence verification
- renewal and obligation extraction

## Revenue

Revenue connects commercial outcomes to accounting systems.

Capabilities:

- accounting-provider connections
- customer and article mappings
- order and invoice handoff
- invoice projections
- payment state
- reconciliation
- revenue attribution to source run, ICP, message and agent plan
- renewals and expansion opportunities
- exception recovery

## Goals

Goals are executable product objects.

Examples:

- create 2 million SEK in qualified pipeline this quarter
- book 20 meetings in one vertical
- win 15 new logos in a region
- expand ten existing customers
- reduce average quote-to-sign time
- collect overdue invoices

A goal contains:

- metric and target
- time horizon
- scope and constraints
- target segments
- execution budget
- assigned agents
- current plan
- required pipeline model
- progress
- forecast
- blockers
- generated subgoals and runs

## Agents

Agents exposes the active commercial workforce.

Views:

- agent catalogue
- active runs
- scheduled and continuous agents
- work queue
- action log
- model and prompt versions
- tool usage
- budgets and capacity
- evaluation results
- policy and autonomy settings
- failures and recovery

# TIC-Powered Company And Trust Platform

## TIC As A Core Substrate

TIC should be treated as a core data and trust platform rather than a late signing integration.

The ideal product uses relevant TIC capabilities across the lifecycle:

```text
Company search
Company summary and status
Addresses and workplaces
SNI codes
Domains, email and phone
Parties, representatives and signatories
Ownership and beneficial owners
Company and person graphs
Financial summaries and reports
Credit and debtor signals where licensed
Company intelligence records
Watchlists and triggers
BankID authentication and signing
CompanyRoles enrichment
Signature evidence and webhooks
```

The available capability set depends on the commercial TIC plan and data rights. Dawn's provider contract must expose capabilities explicitly.

## Company Search And Market Compilation

Dawn compiles a user's market instruction into one or more TIC search strategies.

Example:

```text
User goal:
Find Swedish B2B consultancies with 8-80 employees in western Sweden
that sell project-based services and are likely to have fragmented
quote, contract and accounting workflows.

Compiled plan:
1. Registry and geography constraints
2. SNI and workplace candidate retrieval
3. Company status and size constraints
4. Financial and domain enrichment
5. Frontier-model business analysis
6. Segment clustering
7. ICP fit and timing ranking
8. Contact and buyer-role resolution
```

The model may revise the search strategy after inspecting early results. It may discover that the original SNI boundaries are too narrow or that a stronger adjacent cluster exists.

## Company Snapshots

Dawn stores versioned provider snapshots according to licensing and retention policy.

Each snapshot includes:

- provider
- provider entity ID
- canonical Dawn entity ID
- retrieval time
- provider update time where available
- capability and endpoint
- normalised fields
- raw payload reference
- validity or refresh policy
- content hash

Current product reads use the latest eligible snapshot. Historical snapshots support event detection, agent reasoning and outcome analysis.

## Watchlists And Continuous Signals

Dawn can use TIC watchlists or equivalent internal monitoring to maintain continuous market awareness.

Signals can trigger:

- new prospect evaluation
- account reprioritisation
- outreach timing changes
- new executive or company-role strategy
- credit or risk review
- renewal or expansion opportunity
- suppression or manual review

Examples include:

```text
new executive or representative
company status change
new workplace
address change
financial report update
revenue or employee growth
ownership change
signatory change
credit or debtor change
new registry or intelligence event
```

## TIC Identity And Signing

TIC Identity supports BankID signing with visible signed text, hidden signed data, XML-DSig signature data and OCSP evidence. Dawn binds the exact commercial document version and hash into the signed context.

Dawn stores:

- signature request
- signer identity
- visible signed text
- deterministic hidden signed context
- document version and hash
- signature value
- OCSP response
- provider completion time
- verification result
- evidence package

TIC webhooks are verified and deduplicated before business state changes.

## Signer And Company Context

After identity is established, Dawn may retrieve CompanyRoles or other licensed context and compare the signer with the customer company.

The model can interpret the company and role evidence and write a clear commercial assessment. Workspace policy decides whether a given assessment allows automatic continuation, requires review or blocks the workflow.

The user experience should present:

- who signed
- which company relationship was found
- relevant role and signatory descriptions
- what Dawn concludes
- what remains uncertain
- the policy decision

# AI-Native Company Intelligence

## Company Understanding

For every relevant company, Dawn can maintain a living semantic model:

```ts
type CompanyIntelligence = {
  summary: string;
  businessModel: string;
  offerings: string[];
  customerTypes: string[];
  salesMotion: string;
  revenueModel: string;
  operatingComplexity: string;
  digitalMaturity: string;
  likelySystems: string[];
  likelyPains: string[];
  likelyBuyingRoles: BuyingRole[];
  marketSegments: string[];
  timingSignals: string[];
  risks: string[];
  opportunities: string[];
  recommendedNextMove: string;
};
```

These fields are directly stored as current product state. A separate revision record retains:

- model and model configuration
- prompt and rubric version
- context snapshot ID
- tool observations
- generation time
- previous state
- evaluation results

## Workspace-Specific Interpretation

The same company can fit one workspace and be irrelevant to another. Dawn therefore separates general company understanding from workspace-specific commercial intelligence.

```ts
type WorkspaceCompanyIntelligence = {
  icpMatches: IcpMatch[];
  bestFitIcpId: string | null;
  fitScore: number;
  fitNarrative: string;
  painHypothesis: string[];
  valueHypothesis: string;
  recommendedPersona: string;
  accountStrategy: string;
  outreachAngle: string;
  timing: string;
  priority: string;
  nextBestMove: string;
};
```

The frontier model can write and refresh this state directly.

## Intelligence Refresh

Refresh can be triggered by:

- new TIC snapshot
- website or external-context change
- new CRM interaction
- new accounting outcome
- ICP change
- explicit user request
- scheduled freshness policy
- agent judgement that current understanding is insufficient

Refresh is incremental. The agent should preserve useful state and update conclusions that changed.

# ICP And Market System

## ICP Profile

An ICP is a living strategic object, not only a set of database filters.

```ts
type IcpProfile = {
  name: string;
  objective: string;
  targetMarket: string;
  positiveExemplars: CompanyRef[];
  negativeExemplars: CompanyRef[];
  hardConstraints: IcpConstraint[];
  softPreferences: IcpPreference[];
  antiPatterns: string[];
  buyingRoles: string[];
  painModel: string[];
  economicModel: string;
  salesMotion: string;
  geographicScope: Geography;
  timingSignals: string[];
  qualificationRubric: string;
  activeLearningState: IcpLearningState;
};
```

Users can define an ICP in natural language, structured form or by selecting exemplar customers. Dawn can infer and propose ICPs from paid-customer cohorts.

## ICP Scientist

The ICP Scientist agent:

- analyses closed-won, closed-lost and paid-customer cohorts
- separates correlation from commercially useful patterns
- identifies high-conversion and high-value clusters
- finds anti-ICP patterns
- proposes new segments
- compares performance by region, company type, size, sales motion and trigger
- updates qualification rubrics
- creates controlled experiments

It may create a new ICP version automatically when autonomy policy allows it.

## Market Segments

A segment is a model-discovered or user-defined cluster of companies with a shared commercial thesis.

A segment includes:

- definition
- company universe
- common traits
- pain and buying thesis
- recommended channels
- historical performance
- saturation
- market size
- current coverage
- active goals and runs

## Prospecting Run

A prospecting run is a durable Flue workflow.

Inputs:

- workspace
- goal
- ICP or exploration objective
- territory or market universe
- target volume or outcome
- execution budget
- allowed tools and channels
- previous run context

Outputs:

- market analysis
- discovered segments
- ranked prospects
- company intelligence
- buyer-role hypotheses
- contact candidates
- account strategies
- outreach-ready artifacts
- updated CRM state
- run evaluation

## Processing Strategy

Dawn should support both deep single-account work and high-volume territory processing.

A large run uses staged depth:

```text
Universe retrieval
  -> duplicate and eligibility handling
    -> broad frontier-model triage
      -> segment discovery and search revision
        -> deep company analysis
          -> contact and persona resolution
            -> account strategy
              -> autonomous action
```

Staged depth is an economic and latency optimisation, not a semantic restriction. Frontier models remain responsible for the high-value interpretation and can request deeper context for any candidate.

## Lead Package

A high-quality prospect package includes:

```text
Company and market context
Why this company fits
Which ICP and segment it belongs to
Why the timing may be good
Likely business pain
Likely buying roles and people
Recommended commercial thesis
Recommended channel and next action
Relevant source context
Agent plan and current status
```

The package should be sufficient for Dawn to act without requiring a seller to re-research the company.

# Flue Agent Execution System

## Role Of Flue

Flue is the agent execution framework for Dawn.

This PRD does not assume a specific current Flue API. It defines the runtime contract Flue must provide or be extended to provide.

Flue is responsible for:

- durable goals and agent runs
- plan creation and revision
- tool selection and invocation
- dynamic task creation
- fan-out and fan-in execution
- durable checkpoints
- long-running and scheduled work
- continuous event-triggered agents
- context construction and retrieval
- memory access and compaction
- model routing
- budgets and capacity
- action policies
- trajectory recording
- evaluation hooks
- failure handling and resumption

Dawn domain services remain the canonical tool and state surface. Flue never needs direct database access.

## Core Runtime Objects

```ts
type AgentDefinition = {
  id: string;
  name: string;
  purpose: string;
  defaultModelPolicy: ModelPolicy;
  toolSet: string[];
  contextPolicy: ContextPolicy;
  memoryPolicy: MemoryPolicy;
  autonomyPolicyId: string;
  evaluationProfileId: string;
};

type AgentRun = {
  id: string;
  workspaceId: string;
  agentDefinitionId: string;
  goalId: string | null;
  objective: string;
  plan: AgentPlan;
  state: AgentRunState;
  budget: ExecutionBudget;
  startedAt: string;
  nextWakeAt: string | null;
  status: string;
};

type AgentTask = {
  id: string;
  runId: string;
  parentTaskId: string | null;
  objective: string;
  inputArtifactIds: string[];
  assignedAgentId: string;
  status: string;
  checkpointId: string | null;
};

type AgentAction = {
  id: string;
  runId: string;
  taskId: string;
  tool: string;
  inputSnapshotId: string;
  idempotencyKey: string;
  policyDecisionId: string;
  status: string;
  resultArtifactId: string | null;
};
```

Additional runtime objects:

- `AgentThread`
- `AgentPlanRevision`
- `Observation`
- `Decision`
- `Artifact`
- `Checkpoint`
- `MemoryEntry`
- `ContextSnapshot`
- `PolicyDecision`
- `EvaluationResult`
- `RunEvent`

## Agent Lifecycle

```text
Receive goal or trigger
  -> assemble context
    -> plan
      -> create tasks and choose tools
        -> execute
          -> observe results
            -> update Dawn state
              -> evaluate progress
                -> revise plan or finish
```

The model can:

- create new subgoals
- spawn specialist agents
- abandon a weak segment
- expand a promising segment
- request new context
- modify its own search strategy
- change channel strategy
- update CRM and intelligence state
- continue until the goal, budget or blocked condition is reached

## Agent Catalogue

### Revenue Director Agent

Translates business goals into market, pipeline and execution plans. Coordinates specialist agents and maintains the top-level forecast.

### Market Mapper Agent

Explores the company universe, sizes markets, finds clusters and identifies whitespace.

### ICP Scientist Agent

Learns ICPs from exemplars and outcomes, proposes experiments and updates qualification rubrics.

### Prospecting Agent

Processes a territory or universe, creates target accounts and prioritises them.

### Company Analyst Agent

Builds deep company understanding and account theses.

### People And Buying Committee Agent

Resolves likely people, roles and relationship paths.

### Outreach Agent

Creates and executes personalised outreach, adapts sequences and handles common replies.

### Meeting And Conversation Agent

Prepares meetings, captures commitments, updates CRM and drives follow-up.

### Deal Agent

Maintains opportunity strategy, next actions, forecast and risks.

### Proposal Agent

Builds and revises proposals, quotes and contracts from deal context.

### Trust And Signing Agent

Coordinates identity, signer context, BankID signing and evidence.

### Revenue Operations Agent

Coordinates accounting handoff, payment status, reconciliation and exceptions.

### Expansion Agent

Monitors customers for renewal, cross-sell, upsell and risk opportunities.

The system may create temporary specialist agents for a vertical, region, campaign or high-value account.

## Autonomy Model

Dawn supports high-autonomy operation.

A workspace policy may allow an agent to:

- create prospects
- create accounts and contacts
- create or advance deals
- enrich and refresh intelligence
- send email
- schedule meetings
- create tasks
- generate proposals and quotes
- issue commercial documents
- start signing
- create accounting customers, orders or invoices
- monitor and follow up continuously

Policies can be scoped by:

- agent
- user identity
- channel
- sender mailbox
- segment
- territory
- account value
- action type
- daily or monthly volume
- monetary value
- model quality gate
- new versus proven strategy

The recommended mental model is:

```text
The model decides what good work is.
The autonomy policy defines the operating envelope.
The tool and action ledger make execution durable.
```

Preview and approval are available modes, not mandatory defaults.

## Agent Identity And Delegation

Every agent acts as an explicit principal.

An agent principal has:

- workspace identity
- delegated capabilities
- acting user or system sponsor
- tool permissions
- communication identity
- budget
- policy version
- audit identity

A user can see exactly which agent created or changed an object and which goal caused the action.

## Memory

Dawn uses several memory layers.

### Workspace Memory

Products, positioning, strategy, brand voice, commercial rules, exclusions and preferred ways of working.

### ICP Memory

Exemplars, anti-exemplars, segment findings, qualification patterns and historical performance.

### Company And Account Memory

Research, intelligence, relationships, conversations, objections, commitments, strategy and prior agent work.

### Execution Memory

Run plans, successful approaches, failed searches, tool observations and recovery state.

### Outcome Memory

Reply, meeting, deal, signature, invoice, payment and retention results tied to the originating decisions.

Raw history is retained in events and artifacts. Compacted memory is generated for fast context assembly. Important facts remain linked to their source objects.

## Context Builder

Before a high-value model call, Dawn constructs a task-specific context snapshot.

Potential inputs:

- goal and plan
- workspace strategy
- ICP and segment
- company graph
- TIC snapshots
- website and public context
- contact and relationship state
- prior messages and meetings
- deal and document state
- accounting outcomes
- prior agent decisions
- relevant successful and failed examples
- tool availability and policy

Every context snapshot is content-addressed and replayable.

## Model Policy

Dawn is quality-first.

A frontier model is the default for work where semantic quality materially affects revenue. Smaller or specialised models may be used only where evaluations prove equal or better performance for the task.

Model routing can consider:

- task type
- account value
- ambiguity
- context size
- required tool use
- latency target
- historical eval performance
- cost budget

Cost optimisation must not silently reduce lead or messaging quality.

# Tool System

## Tool Principles

Agent tools are business capabilities, not raw database access.

Every tool has:

- typed input and output
- explicit workspace and principal context
- capability and policy check
- idempotency semantics for mutations
- correlation and run identity
- source references
- structured error classes
- observability
- optional preview and commit modes

## Core Tool Groups

### Market And TIC

```text
searchCompanies
multiSearchCompanies
getCompanySummary
getCompanyFinancials
getCompanyRoles
getCompanySignatories
getCompanyOwnershipGraph
getCompanyWorkplaces
getCompanyDomainsAndContacts
getCompanyCreditContext
createWatchlist
addWatchlistMembers
configureWatchlistTriggers
refreshCompanySnapshot
```

### Web And External Context

```text
fetchCompanyWebsite
searchPublicWeb
extractOfferingsAndCustomers
resolveCompanyDomain
retrieveRelevantDocuments
```

### CRM And Commercial Graph

```text
createProspect
promoteProspectToAccount
upsertContact
createDeal
updateDeal
recordRelationship
writeCompanyIntelligence
writeAccountStrategy
setNextBestMove
appendTimelineEvent
```

### Communication

```text
createMessage
sendEmail
scheduleSequence
stopSequence
classifyReply
draftReply
sendReply
scheduleMeeting
createCallTask
```

### Documents And Signing

```text
createProposal
createQuote
reviseCommercialDocument
finaliseDocument
sendDocument
startTicSigning
collectSignatureEvidence
requestSignerCompanyContext
```

### Accounting And Revenue

```text
findAccountingCustomer
createAccountingCustomer
getArticlesAndPrices
createOrder
createInvoice
refreshInvoice
getPaymentState
reconcileCommercialOutcome
```

### Agent And Goal Management

```text
createGoal
createSubgoal
createRun
spawnAgentTask
scheduleWakeup
recordEvaluation
finishRun
```

# Outreach And Conversation System

## Outreach Strategy

Dawn outreach is account-thesis-driven rather than template-row-driven.

For each target, the agent chooses:

- whether to contact now
- the likely buyer role
- the best person or relationship path
- the strongest relevant reason
- channel and sender
- message depth
- sequence structure
- follow-up timing
- stop conditions

## Personalisation

Messages can use:

- company business model
- actual offering and customer context
- relevant company event
- role-specific problem
- workspace value thesis
- credible comparison or observation
- prior interaction
- segment-specific insight

The product must not generate unsupported false claims. It may make reasonable commercial hypotheses and phrase them as such.

## Sequence Execution

An outreach sequence is dynamic.

The agent can:

- select or generate the sequence
- adapt later steps based on opens, clicks, replies and new company context
- stop immediately on a reply or suppression signal
- change persona when the original path is weak
- create a new strategy for a high-value account
- move a promising account into a human-led motion

## Reply Handling

Replies are classified into commercial states such as:

```text
positive interest
referral to another person
question
objection
not now
not relevant
unsubscribe or suppression
out of office
bounce
```

The agent can reply automatically where policy allows, schedule a meeting, update CRM and continue the account plan.

## Sender And Deliverability Operations

High-autonomy outreach must include:

- mailbox and domain health
- volume and pacing policy
- bounce and complaint handling
- suppression lists
- duplicate contact prevention
- thread awareness
- sender identity and brand voice
- per-segment performance
- immediate stop on negative channel signals

These capabilities protect the user's ability to operate at scale.

# CRM And Commercial Graph

## Core CRM Objects

Dawn uses a strong fixed commercial graph with extension points.

```text
Workspace
Company
WorkspaceCompany
Prospect
Account
Person
Contact
Relationship
Deal
Pipeline
Activity
Conversation
Meeting
Task
Goal
AgentRun
CommercialDocument
SignatureRequest
AccountingObject
Outcome
```

Custom fields, views and selected custom record types can extend this graph. Core relationships and outcome semantics remain first-class.

## Prospect To Account Lifecycle

```text
Market candidate
  -> analysed prospect
    -> target account
      -> active account relationship
        -> qualified opportunity
```

Promotion retains complete lineage. A user can see which run, ICP, segment, model decision and signal created an account.

## Deal Intelligence

A deal contains both operational fields and a living opportunity model:

```ts
type DealIntelligence = {
  opportunityThesis: string;
  customerProblem: string;
  desiredOutcome: string;
  buyingCommittee: BuyingRole[];
  decisionProcess: string;
  competition: string[];
  objections: string[];
  commitments: string[];
  risks: string[];
  nextBestMove: string;
  forecastNarrative: string;
  expectedValue: number;
  expectedCloseWindow: string;
};
```

Dawn agents update this from conversations and actions.

## Timeline

The timeline is an event-backed projection, not a collection of UI-specific queries.

It includes:

- registry and market signals
- intelligence revisions
- prospecting decisions
- outreach and replies
- meetings and commitments
- CRM changes
- document and negotiation events
- identity and signing events
- accounting and payment events
- agent decisions and actions

# Quote-To-Cash And Trust

## Commercial Documents

A commercial document is Dawn-owned and versioned independently from the accounting provider.

Types:

```text
proposal
quote
contract
amendment
order_request
```

Each issued version includes:

- immutable content snapshot
- exact rendered bytes
- content hash
- commercial line snapshot
- price, currency, VAT and discount
- terms version
- recipient and signer roles
- source deal and account
- generation and approval history

## AI Document Generation

The Proposal Agent can generate a document from:

- meeting and email context
- agreed scope and outcome
- product catalogue
- accounting articles and price lists
- prior successful documents
- commercial policy
- customer-specific terms

The agent can revise a proposal during negotiation and update the deal model.

## BankID Signing

The Trust And Signing Agent:

1. finalises the exact document version
2. creates deterministic visible and hidden signed context
3. starts TIC signing
4. monitors completion
5. verifies webhook and session state
6. stores XML-DSig and OCSP evidence
7. verifies the bound document hash
8. evaluates signer and company context
9. continues the workflow according to policy

## Accounting Handoff

After signing or another configured acceptance condition, the Revenue Operations Agent can:

- find or create the accounting customer
- resolve articles, prices and payment terms
- create an order or invoice
- attach or link commercial evidence where supported
- store provider mapping
- monitor status and payment
- recover from provider errors

The provider capability model decides what is possible for Fortnox, Spiris or later providers.

## Revenue Attribution

Every commercial outcome should be traceable to:

- originating goal
- ICP version
- market segment
- prospecting run
- company thesis
- contact and persona strategy
- outreach sequence and messages
- meetings
- deal strategy
- proposal and signature
- invoice and payment

This is the central learning dataset.

# Goals And Autonomous Commercial Planning

## Goal Compiler

The Revenue Director Agent converts a business goal into an execution model.

Example:

```text
Goal: 1.5 million SEK in new signed revenue during Q4.

Dawn plan:
- required signed deals: 12
- required qualified opportunities: 34
- required meetings: 90
- required positive conversations: 180
- target accounts: 720
- prioritised segments: 3
- territory runs: 6
- weekly review and model recalibration: enabled
```

The calculation uses workspace conversion history, segment performance and uncertainty.

## Continuous Goal Operation

Dawn continuously compares actual state with the plan.

When a gap appears it may:

- expand or change a segment
- increase or decrease outreach volume
- change the buyer persona
- revise messaging
- create a new experiment
- reallocate agent capacity
- involve a human seller in high-value accounts
- revise the forecast

# Conceptual Data Model

## Market And Registry

### Company

Canonical Dawn company identity.

Key fields:

- ID
- jurisdiction
- organisation number
- current legal name
- legal entity type
- current status
- canonical domain
- created and updated timestamps

### CompanySnapshot

Versioned provider or source snapshot.

### Workplace

Operational workplace linked to a company and geography.

### Person

Person identity used for public roles, CRM relationships and verified signers according to data rights.

### CompanyRole

Current or historical person-to-company role.

### CompanyEdge

Ownership, group, beneficial-owner, workplace or other graph relationship.

### CompanyEvent

Normalised change or trigger event.

### FinancialPeriod

Normalised financial summary with source lineage.

## Workspace And CRM

### WorkspaceCompany

Private team overlay on one Company.

### Prospect

Pre-account commercial state with run and ICP lineage.

### Account

Active workspace relationship with a company.

### Contact

Workspace relationship to a person or communication identity.

### Deal

Commercial opportunity linked to an account.

### Relationship

Person, company and team relationship graph.

### Activity

Human or agent commercial action.

### Conversation

Threaded communication across channels.

### Meeting

Scheduled or completed meeting with preparation, transcript and commitments.

## Intelligence

### CompanyIntelligenceCurrent

Current general company understanding.

### WorkspaceCompanyIntelligenceCurrent

Current workspace-specific fit and strategy.

### IntelligenceRevision

Historical generation, context and evaluation record.

### IcpProfile

Versioned ICP object.

### Segment

Market cluster and strategy.

### OpportunityThesis

Current account or deal commercial thesis.

## Agent System

### Goal

Business target and execution scope.

### AgentDefinition

Agent capability and behaviour configuration.

### AgentRun

Durable execution instance.

### AgentTask

Hierarchical work unit.

### AgentAction

Typed external or internal action with idempotency.

### ContextSnapshot

Replayable input context.

### Artifact

Structured or unstructured output.

### MemoryEntry

Retrieved or compacted long-term memory.

### EvaluationResult

Quality and outcome evaluation.

## Outreach

### SenderIdentity

Mailbox, user or channel identity.

### Sequence

Dynamic outreach plan.

### SequenceEnrollment

Company and person participation.

### Message

Drafted, scheduled, sent or received communication.

### ReplyClassification

Current reply interpretation.

### Suppression

Workspace or global channel suppression.

## Commercial And Revenue

### ProductAndPriceReference

Dawn or provider-backed commercial catalogue reference.

### CommercialDocument

Proposal, quote, contract or amendment.

### CommercialDocumentVersion

Immutable issued version.

### SignatureRequest

Signing workflow.

### SignatureParty

Signer and role.

### SignatureEvidence

TIC signature and verification package.

### TrustAssessment

Signer, company and policy interpretation.

### AccountingConnection

Provider-qualified connection.

### AccountingObject

Customer, article, order, invoice or payment projection.

### ExternalOperation

Idempotent provider mutation ledger.

### Outcome

Meeting, qualification, win, signature, invoice, payment, renewal or churn outcome linked to its origin.

## Critical Invariants

- A Swedish organisation number maps to one canonical active Company identity per legal continuity rule.
- Provider entity IDs never become Dawn canonical IDs.
- Private workspace state never leaks through the global company graph.
- A Prospect retains run, ICP, segment and decision lineage after promotion.
- AI-authored current state always has at least one revision record.
- Commercial document versions are immutable after issue.
- A signing request binds one exact document version and hash.
- One accepted commercial workflow cannot create duplicate active provider invoices through replay.
- Every external action has a stable idempotency identity.
- Every agent action is attributable to a workspace, principal, run, task and policy decision.
- Suppression and reply stop conditions apply before further outreach sends.

# Technical System Design

## Logical Services

Dawn can begin as a modular system and deploy logical services independently as scale requires.

### Application API

Owns authenticated commands, reads, permissions and product semantics.

### Market Data Service

Owns TIC integration, company entity resolution, snapshots, search compilation, market graph and refresh.

### Intelligence Service

Owns model gateway, context construction, prompt and rubric registry, intelligence writes and evaluation hooks.

### Flue Runtime

Owns durable agent execution, planning, scheduling, tasks, checkpoints and trajectories.

### Tool Gateway

Exposes typed Dawn business tools to Flue and external MCP/API consumers.

### Communication Service

Owns email, calendar, meeting, call, sequence, reply and sender operations.

### Document And Trust Service

Owns commercial documents, rendering, recipient access, TIC signing and evidence.

### Accounting Integration Service

Owns provider connections, projections, operations and reconciliation.

### Event And Workflow Service

Owns outbox publication, queues, provider receipts, retries and scheduled triggers.

### Analytics And Evaluation Service

Owns product analytics, trajectory analysis, attribution, model evaluation and experimentation.

## Storage Architecture

### Transactional Database

PostgreSQL is authoritative for:

- workspace and identity
- commercial graph
- current intelligence
- agent runs and actions
- documents and workflow state
- provider mappings
- policies and permissions

### Object Storage

Object storage holds:

- raw provider snapshots
- websites and retrieved documents
- model context and output artifacts
- rendered commercial documents
- signed evidence packages
- large transcripts and exports

### Search Index

A dedicated search index supports:

- company-universe search
- fast faceting
- geographic and SNI filters
- hybrid lexical and semantic company discovery
- workspace search
- market coverage queries

TIC search remains the primary external retrieval layer. Dawn's index and cache behaviour must follow TIC licensing rights.

### Analytics Store

A columnar analytics store or warehouse supports:

- high-volume event analysis
- market and cohort analysis
- agent trajectory analysis
- outreach performance
- revenue attribution
- model and prompt experiments

### Cache

A distributed cache supports:

- provider response caching
- context fragments
- session state
- rate limits
- short-lived locks
- search result reuse

## Core Runtime Flow

```text
Web or API command
  -> application command
    -> transactional state change
      -> outbox event
        -> event bus or durable queue
          -> Flue run or integration worker
            -> typed tool call
              -> application command or provider adapter
                -> observation and state update
                  -> run checkpoint and next plan
```

## Provider Webhook Flow

```text
Provider webhook
  -> capture raw bytes
    -> verify signature and timestamp
      -> persist provider receipt
        -> deduplicate
          -> acknowledge quickly
            -> enqueue normalisation
              -> application command
                -> domain event
                  -> agent wake-up or workflow continuation
```

## Agent Run At Scale

A large territory run is sharded by candidate, segment or geography.

Requirements:

- incremental results
- durable pagination and cursors
- resumable candidate shards
- fan-out analysis workers
- fan-in segment and ranking synthesis
- per-provider rate control
- shared context cache
- deduplication across concurrent runs
- priority escalation for promising candidates
- ability to revise the universe query mid-run
- cost and token accounting by run, account and outcome

## Event Model

Representative events:

```text
company.discovered
company.snapshot_refreshed
company.event_detected
company.intelligence_updated
workspace_company.intelligence_updated
icp.created
icp.revised
segment.discovered
prospecting_run.started
prospecting_run.replanned
prospect.created
prospect.prioritised
prospect.promoted
contact.resolved
outreach.sequence_started
outreach.message_sent
outreach.reply_received
outreach.reply_classified
meeting.booked
meeting.completed
deal.created
deal.strategy_updated
deal.stage_changed
commercial_document.created
commercial_document.issued
commercial_document.accepted
signature.requested
signature.completed
trust.assessed
accounting.invoice_requested
accounting.invoice_created
accounting.payment_updated
outcome.recorded
goal.progress_updated
agent_run.started
agent_run.replanned
agent_action.completed
agent_run.blocked
agent_run.completed
evaluation.completed
```

Events carry:

- event ID
- workspace ID where applicable
- entity references
- actor and agent principal
- run and task ID
- correlation and causation ID
- idempotency identity
- occurrence and ingestion time
- schema version

# AI Quality And Evaluation System

## Quality Standard

Dawn's competitive advantage depends on lead and execution quality. The model layer requires a product-grade evaluation system from the beginning.

## Evaluation Layers

### Component Evals

Evaluate specific outputs:

- company business understanding
- ICP fit
- segment assignment
- pain hypothesis
- buyer-role selection
- account strategy
- message quality
- reply classification
- deal state extraction
- document generation

### Trajectory Evals

Evaluate an entire agent run:

- whether the plan was coherent
- whether tools were used well
- whether the search strategy improved
- whether the right candidates received deep work
- whether the run reached its goal efficiently
- whether actions matched policy
- whether recovery was effective

### Outcome Evals

Evaluate against real business outcomes:

- prospect accepted or rejected
- positive reply
- meeting booked
- qualified opportunity
- proposal sent
- agreement signed
- invoice created
- payment received
- expansion or renewal

## Evaluation Datasets

Each vertical should maintain:

- known strong-fit companies
- known bad-fit companies
- ambiguous companies
- good and poor contact choices
- good and poor account strategies
- successful and unsuccessful messages
- closed-won and closed-lost trajectories
- signed and paid commercial workflows

## Model And Prompt Release Gates

A model, prompt, rubric or context-policy change can be tested through:

- historical replay
- shadow runs
- side-by-side scoring
- canary workspaces
- segment-specific experiment
- online outcome comparison

A change should not become default when it materially reduces high-value quality even if it lowers cost.

## Core Quality Metrics

- precision among top-ranked prospects
- user acceptance of created target accounts
- qualified-meeting rate
- positive-reply rate
- correct persona rate
- account-strategy usefulness
- AI-created pipeline conversion
- correction rate on AI-authored state
- autonomous run completion rate
- tool and action failure rate
- cost per qualified opportunity
- signed and paid revenue per agent run

## Learning Loop

```text
Agent decision
  -> commercial action
    -> response or pipeline outcome
      -> signature, invoice and payment outcome
        -> attribution
          -> eval dataset
            -> ICP, prompt, model and strategy improvement
```

# Permissions, Security And Autonomy Controls

## Authorization

Permissions apply to humans and agents.

Core dimensions:

- workspace role
- object access
- field access
- agent capability
- tool capability
- provider connection
- sender identity
- monetary threshold
- autonomy policy

## Secrets And Sensitive Data

Encrypt and isolate:

- provider tokens
- TIC and webhook secrets
- email credentials
- personal identity numbers
- signature evidence
- sensitive enrichment payloads

Logs must redact secrets and high-risk personal data.

## Action Ledger

Every external mutation records:

- requested action
- agent or user principal
- policy decision
- idempotency key
- provider request and response references
- current status
- retry state
- resulting business entity
- compensating or rollback option where possible

## Blast-Radius Controls

Controls can include:

- send-volume budgets
- mailbox and domain budgets
- new-segment canaries
- monetary limits
- account-value thresholds
- action sampling
- model-quality gates
- circuit breakers
- automatic pause on bounce, complaint or provider anomalies

These controls exist so agents can operate at meaningful scale.

## Privacy And Compliance

The end-state product requires clear data rights, retention, purpose, export, correction, deletion and audit policies for each source and workflow. These requirements should be designed into source lineage and permissions without turning the model into a passive assistant.

# Reliability And Operations

## Reliability Principles

- external mutations are idempotent
- agent runs are resumable from checkpoints
- provider events may be duplicated or delayed
- older provider state cannot overwrite newer state
- partial run results remain usable
- provider failure does not corrupt Dawn state
- model failure can be retried or rerouted
- every blocked run exposes a user-visible reason and recovery path
- signed evidence can be rebuilt and verified from immutable inputs

## Observability

Every cross-system workflow is traceable by:

- workspace
- user or agent principal
- goal
- run and task
- company, account and deal
- provider connection and provider entity
- action and idempotency key
- model, prompt and context snapshot
- event and job
- cost and latency

## User-Facing Agent Trace

Users should see a useful commercial narrative rather than raw chain-of-thought.

Example:

```text
Dawn analysed 4,280 companies.
It found three strong segments and prioritised 84 accounts.
It changed the original search because SNI 62020 excluded several
high-fit technical consultancies.
It contacted 26 accounts, received six positive replies and booked two meetings.
The next run will expand the strongest segment and stop the weakest message angle.
```

## Operational Targets

End-state targets:

- interactive company and CRM pages p95 under 2 seconds
- company search and faceting p95 under 1.5 seconds
- first useful results from a new prospecting run within 60 seconds
- incremental results throughout large runs
- webhook acknowledgement under 2 seconds
- outbound action scheduling within 30 seconds under normal operation
- no duplicate accounting mutation from replay
- no unexplained document-hash mismatch
- complete run and action trace for support

# Integrations

## Primary Company And Trust Provider

TIC LENS and TIC Identity.

## Accounting Providers

- Fortnox
- Spiris/eAccounting
- later Nordic providers through capability-based adapters

## Communication Providers

- Google Workspace and Gmail
- Microsoft 365 and Outlook
- calendar providers
- telephony and meeting providers
- transactional email

## Contact And Channel Providers

Dawn can integrate licensed contact-data, verification and professional-network providers through explicit adapters. The company graph and CRM remain provider-independent.

## Extension Surface

End-state extension options:

- public API
- webhooks
- MCP server exposing Dawn tools
- customer-defined tools
- custom fields and views
- agent templates
- vertical solution packs

# Pricing And Commercial Model

Dawn should avoid a purely seat-based model because autonomous work creates value beyond human logins.

A possible end-state model:

```text
Base workspace subscription
  + included users and connected systems
  + company-intelligence and monitoring capacity
  + agent execution capacity
  + communication volume
  + signing and premium data usage
```

Higher tiers can include:

- larger company-universe access
- continuous monitoring
- more autonomous concurrent agents
- premium TIC data
- advanced evaluation and experiments
- multiple accounting entities
- governance and audit controls
- API and MCP access

Pricing should map to commercial value and capacity rather than arbitrary AI token resale.

# Success Metrics

## North-Star Metric

> **Paid revenue from Dawn-originated or Dawn-operated opportunities per active workspace.**

The metric ties market intelligence and agent work to actual business value.

## Primary Funnel Metrics

- time from onboarding to first qualified prospect
- time from goal creation to first booked meeting
- qualified pipeline created per month
- prospect-to-positive-reply conversion
- positive-reply-to-meeting conversion
- meeting-to-qualified-opportunity conversion
- opportunity-to-proposal conversion
- proposal-to-signature conversion
- signature-to-invoice conversion
- invoice-to-payment conversion

## Agent Metrics

- autonomous goals completed
- percentage of commercial actions executed by agents
- human correction and takeover rate
- run success and recovery rate
- cost per accepted target account
- cost per qualified meeting
- cost per signed and paid deal
- action-policy violations, target zero

## Intelligence Metrics

- top-K prospect precision
- ICP lift over baseline search
- segment discovery value
- contact and persona accuracy
- account-strategy acceptance
- freshness of company intelligence
- outcome calibration by ICP and segment

## Product Metrics

- active workspaces with continuous agents
- connected systems per workspace
- weekly goals operated
- retained paid workspaces
- expansion in agent capacity and intelligence usage

# Golden End-State Journeys

## 1. Build Pipeline From A Revenue Goal

A user writes:

```text
Build 2 million SEK in qualified Q4 pipeline among B2B service companies
with 10-100 employees in western Sweden.
```

Dawn:

1. evaluates the target against historical conversion
2. proposes required pipeline and activity
3. maps the market through TIC
4. discovers and compares segments
5. creates a territory plan
6. analyses and ranks companies
7. resolves likely buyers
8. creates accounts and deals where appropriate
9. executes outreach within policy
10. adapts based on responses
11. reports progress against the goal

## 2. Learn An ICP From Paid Customers

The user selects its best paid customers or asks Dawn to infer them from accounting.

Dawn:

1. constructs a cohort
2. analyses company and commercial patterns
3. identifies strong and weak correlations
4. proposes ICPs and anti-ICPs
5. sizes each market
6. runs a controlled prospecting experiment
7. compares commercial outcomes
8. updates the ICP

## 3. Continuous Territory Agent

The user delegates a region and target outcome.

Dawn continuously:

- monitors the company universe
- reacts to company events
- evaluates new candidates
- maintains target accounts
- works outreach
- pauses weak strategies
- expands strong strategies
- keeps pipeline current

## 4. Deep Account Strategy

A high-value company opens in Dawn.

The company page already contains:

- market and registry context
- company and financial understanding
- likely buying committee
- contact routes
- account thesis
- recent signals
- recommended message
- next best move

The seller can delegate the account fully or collaborate with the agent.

## 5. Reply To Qualified Deal

A prospect replies positively.

Dawn:

- classifies the reply
- updates the relationship
- creates or updates the opportunity
- proposes or sends the next reply
- books a meeting
- prepares the seller
- captures the meeting outcome
- advances the deal and next action

## 6. Deal To Paid Revenue

Dawn:

- creates a proposal from the deal
- collaborates on changes
- finalises exact commercial terms
- starts TIC BankID signing
- verifies signature and company context
- creates accounting customer and invoice or order
- monitors payment
- records the outcome against the originating ICP and agent run

## 7. Expansion And Renewal

For an existing paid customer, Dawn monitors:

- contract dates
- usage and commercial context
- company growth and events
- new decision-makers
- payment history
- new products or service fit

It creates an expansion or renewal plan and operates it under policy.

## 8. Full Replay And Audit

An operator can trace a paid deal back through:

```text
payment
  -> invoice
    -> signed agreement
      -> deal
        -> meetings and messages
          -> account strategy
            -> prospecting run
              -> ICP version
                -> company snapshots and model context
```

# End-State Acceptance Criteria

Dawn reaches the intended end-state when:

- a workspace can start from an empty CRM and build qualified pipeline from the Swedish company market
- frontier-model agents create and maintain company intelligence and CRM state as first-class product data
- agents can operate continuously and execute external actions under workspace policy
- users can delegate revenue goals rather than micromanage tasks
- every prospect retains lineage from market thesis to commercial outcome
- TIC company, role, trust and signing capabilities are integrated across the lifecycle
- Fortnox and Spiris can serve as accounting backends without changing Dawn's commercial model
- outbound and inbound conversations update CRM and agent plans automatically
- quote, signing, invoice and payment form one traceable workflow
- real revenue outcomes improve ICP, ranking, messaging and agent execution
- model, prompt and agent changes are governed by repeatable evaluations
- large market runs are durable, incremental and resumable
- external side effects are idempotent and observable
- the product feels like an autonomous commercial system rather than a database with AI assistance

# Principal Risks

## Product Breadth

The vision spans market intelligence, CRM, outreach and revenue operations. The remedy is one coherent commercial loop and shared graph, not disconnected modules.

## Data Economics And Rights

TIC capability, licensing, caching rights and premium data economics may shape search depth and storage. Provider capabilities must be explicit and commercial assumptions validated early.

## Outreach Reputation

Poor autonomous messaging can damage sender reputation. Quality evaluation, sender operations and policy-based volume expansion are core product requirements.

## Optimising Activity Instead Of Revenue

Agents may maximise sends, replies or meetings without producing good business. Goal models and evaluations must prefer qualified, signed and paid outcomes.

## Agent Quality Drift

Model, prompt, data and market changes can alter quality. Replay, shadow runs, outcome attribution and release gates are required.

## Provider Dependency

TIC, accounting and communication providers can change. Dawn maintains provider ports, raw lineage, capability metadata and recovery paths.

## UX Complexity

A powerful agent system can become opaque. Dawn must translate agent work into structured market, account, pipeline, goal and outcome views.

# Open Strategic Decisions

1. Exact TIC commercial plan, licensed capabilities, caching rights and watchlist economics.
2. Whether Dawn maintains a broad internal Swedish company index or primarily queries TIC on demand.
3. The first narrow customer segment that produces the best outcome-learning loop.
4. Default autonomy level for new workspaces.
5. Communication providers and sender-infrastructure strategy.
6. Contact-data and verification providers beyond TIC company contact fields.
7. Flue's durable runtime implementation and which capabilities require extension.
8. Model-provider and model-routing strategy.
9. How goals, agent capacity and premium data map to pricing.
10. When Spiris reaches product parity with Fortnox.
11. Which company and person facts can be shared globally versus retained per workspace.
12. The minimum evaluation set required before an agent can send autonomously in a new vertical.

# Verified Provider Capability Basis

This PRD relies on provider capabilities documented as of 2026-06-20. Exact commercial access must be validated before implementation.

## TIC

TIC's documentation index describes company search, company summaries, SNI codes, parties, signatories, beneficial owners, company graphs, financial data, credit context, domains, email, phone, workplaces, intelligence records and watchlists with members and triggers.

- https://docs.tic.io/llms.txt

TIC Identity documents BankID signing with `userVisibleData`, `userNonVisibleData`, XML-DSig and OCSP evidence.

- https://id.tic.io/docs/api/signing

TIC Identity enrichment documents CompanyRoles, SPAR and other tenant-enabled enrichment types.

- https://id.tic.io/docs/api/enrichment

TIC Identity webhooks document HMAC-SHA256 verification, signature completion and duplicate-delivery handling.

- https://id.tic.io/docs/webhooks

## Fortnox

Fortnox documents OAuth scopes for accounting resources and notes that scopes provide both read and write access for the endpoint. Its websocket system uses ordered topics with at-least-once delivery and duplicate events.

- https://www.fortnox.se/developer/guides-and-good-to-know/scopes
- https://www.fortnox.se/developer/guides-and-good-to-know/websockets

## Spiris

Spiris documents OAuth2 APIs with sales and accounting scopes, including read-only variants. Its MCP beta exposes AI tools for customers, orders, invoices, articles, accounting and related resources.

- https://developer.vismaonline.com/docs/authentication
- https://developer.vismaonline.com/docs/spiris-mcp-server

# Final Product Definition

Dawn is the AI-native CRM and autonomous revenue engine for the Swedish company market.

It understands companies before they enter the CRM. It learns who a business should sell to. It continuously builds and operates pipeline. It maintains the commercial graph. It turns qualified opportunities into proposals, BankID-signed agreements, accounting-provider invoices and paid revenue. It learns from the complete outcome and improves the next commercial decision.

```text
TIC provides the Swedish company and trust substrate.
Flue provides the agent execution runtime.
Dawn owns commercial intelligence, CRM state and revenue operation.
Fortnox, Spiris and later providers provide accounting execution and financial truth.
```

The product is successful when users stop thinking of CRM as a database they must maintain and start treating Dawn as a commercial system they can give goals to.
