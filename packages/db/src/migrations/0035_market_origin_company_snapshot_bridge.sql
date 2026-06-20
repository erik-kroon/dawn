CREATE TABLE "market_company" (
  "id" text PRIMARY KEY NOT NULL,
  "country_code" text NOT NULL,
  "organization_number" text NOT NULL,
  "legal_name" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "market_company_snapshot" (
  "id" text PRIMARY KEY NOT NULL,
  "company_id" text NOT NULL,
  "provider" text NOT NULL,
  "provider_capability" text NOT NULL,
  "provider_company_id" text,
  "retrieved_at" timestamp NOT NULL,
  "normalized_fields" jsonb NOT NULL,
  "raw_payload" jsonb NOT NULL,
  "raw_payload_reference" text,
  "content_hash" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "market_prospect" (
  "id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL,
  "company_id" text NOT NULL,
  "company_snapshot_id" text NOT NULL,
  "status" text DEFAULT 'created' NOT NULL,
  "source_goal_id" text,
  "source_run_id" text,
  "icp_id" text,
  "segment_id" text,
  "source_provider" text NOT NULL,
  "source_provider_capability" text NOT NULL,
  "source_decision_summary" text NOT NULL,
  "created_by_actor_id" text NOT NULL,
  "promoted_account_id" text,
  "promoted_opportunity_id" text,
  "promoted_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "commercial_document"
  ADD COLUMN "market_origin" jsonb;

ALTER TABLE "market_company_snapshot"
  ADD CONSTRAINT "market_company_snapshot_company_id_market_company_id_fk"
  FOREIGN KEY ("company_id") REFERENCES "market_company"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "market_prospect"
  ADD CONSTRAINT "market_prospect_team_id_team_id_fk"
  FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "market_prospect"
  ADD CONSTRAINT "market_prospect_company_id_market_company_id_fk"
  FOREIGN KEY ("company_id") REFERENCES "market_company"("id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "market_prospect"
  ADD CONSTRAINT "market_prospect_company_snapshot_id_market_company_snapshot_id_fk"
  FOREIGN KEY ("company_snapshot_id") REFERENCES "market_company_snapshot"("id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "market_prospect"
  ADD CONSTRAINT "market_prospect_promoted_account_id_crm_account_record_id_fk"
  FOREIGN KEY ("promoted_account_id") REFERENCES "crm_account"("record_id") ON DELETE set null ON UPDATE no action;

ALTER TABLE "market_prospect"
  ADD CONSTRAINT "market_prospect_promoted_opportunity_id_crm_opportunity_record_id_fk"
  FOREIGN KEY ("promoted_opportunity_id") REFERENCES "crm_opportunity"("record_id") ON DELETE set null ON UPDATE no action;

CREATE UNIQUE INDEX "market_company_country_org_active_idx"
  ON "market_company" USING btree ("country_code", "organization_number", "status");

CREATE INDEX "market_company_legal_name_idx"
  ON "market_company" USING btree ("legal_name");

CREATE UNIQUE INDEX "market_company_snapshot_content_idx"
  ON "market_company_snapshot" USING btree ("company_id", "provider", "provider_capability", "content_hash");

CREATE INDEX "market_company_snapshot_company_idx"
  ON "market_company_snapshot" USING btree ("company_id", "retrieved_at");

CREATE INDEX "market_company_snapshot_provider_object_idx"
  ON "market_company_snapshot" USING btree ("provider", "provider_company_id");

CREATE INDEX "market_prospect_team_status_idx"
  ON "market_prospect" USING btree ("team_id", "status");

CREATE INDEX "market_prospect_team_company_idx"
  ON "market_prospect" USING btree ("team_id", "company_id");

CREATE INDEX "market_prospect_team_account_idx"
  ON "market_prospect" USING btree ("team_id", "promoted_account_id");

CREATE INDEX "market_prospect_team_opportunity_idx"
  ON "market_prospect" USING btree ("team_id", "promoted_opportunity_id");
