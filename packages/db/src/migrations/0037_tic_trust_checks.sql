CREATE TABLE "trust_policy" (
  "team_id" text PRIMARY KEY NOT NULL,
  "mode" text DEFAULT 'advisory' NOT NULL,
  "updated_by_actor_id" text,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "trust_check" (
  "id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL,
  "account_id" text NOT NULL,
  "opportunity_id" text NOT NULL,
  "document_id" text NOT NULL,
  "document_version_id" text NOT NULL,
  "signature_request_id" text NOT NULL,
  "signature_evidence_id" text NOT NULL,
  "signature_party_id" text,
  "provider" text NOT NULL,
  "provider_session_id" text NOT NULL,
  "provider_request_id" text,
  "provider_event_id" text,
  "source_organization_number" text,
  "signer_name" text NOT NULL,
  "signer_email" text,
  "signer_personal_number_masked" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "result_reason" text DEFAULT 'pending' NOT NULL,
  "company_registration_number" text,
  "company_legal_name" text,
  "company_status" text,
  "role_evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "signature_description" text,
  "advisory_analysis" jsonb,
  "original_source_descriptions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "raw_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "raw_payload_reference" text,
  "legal_basis" text NOT NULL,
  "purpose" text NOT NULL,
  "retention_until" timestamp,
  "requested_at" timestamp NOT NULL,
  "completed_at" timestamp,
  "reviewed_at" timestamp,
  "reviewer_actor_id" text,
  "review_decision" text,
  "review_rationale" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "trust_policy"
  ADD CONSTRAINT "trust_policy_team_id_team_id_fk"
  FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "trust_check"
  ADD CONSTRAINT "trust_check_team_id_team_id_fk"
  FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "trust_check"
  ADD CONSTRAINT "trust_check_account_id_crm_account_record_id_fk"
  FOREIGN KEY ("account_id") REFERENCES "crm_account"("record_id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "trust_check"
  ADD CONSTRAINT "trust_check_opportunity_id_crm_opportunity_record_id_fk"
  FOREIGN KEY ("opportunity_id") REFERENCES "crm_opportunity"("record_id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "trust_check"
  ADD CONSTRAINT "trust_check_document_id_commercial_document_id_fk"
  FOREIGN KEY ("document_id") REFERENCES "commercial_document"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "trust_check"
  ADD CONSTRAINT "trust_check_document_version_id_commercial_document_version_id_fk"
  FOREIGN KEY ("document_version_id") REFERENCES "commercial_document_version"("id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "trust_check"
  ADD CONSTRAINT "trust_check_signature_request_id_signature_request_id_fk"
  FOREIGN KEY ("signature_request_id") REFERENCES "signature_request"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "trust_check"
  ADD CONSTRAINT "trust_check_signature_evidence_id_signature_evidence_id_fk"
  FOREIGN KEY ("signature_evidence_id") REFERENCES "signature_evidence"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "trust_check"
  ADD CONSTRAINT "trust_check_signature_party_id_signature_party_id_fk"
  FOREIGN KEY ("signature_party_id") REFERENCES "signature_party"("id") ON DELETE set null ON UPDATE no action;

CREATE INDEX "trust_check_team_account_idx"
  ON "trust_check" USING btree ("team_id", "account_id");

CREATE INDEX "trust_check_team_document_idx"
  ON "trust_check" USING btree ("team_id", "document_id");

CREATE INDEX "trust_check_team_signature_idx"
  ON "trust_check" USING btree ("team_id", "signature_request_id");

CREATE INDEX "trust_check_team_evidence_idx"
  ON "trust_check" USING btree ("team_id", "signature_evidence_id");

CREATE INDEX "trust_check_team_status_idx"
  ON "trust_check" USING btree ("team_id", "status");
