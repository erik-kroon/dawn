CREATE TABLE "signature_request" (
  "id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL,
  "document_id" text NOT NULL,
  "document_version_id" text NOT NULL,
  "provider" text NOT NULL,
  "provider_session_id" text NOT NULL,
  "status" text DEFAULT 'requested' NOT NULL,
  "signing_url" text,
  "expires_at" timestamp,
  "signing_text" text NOT NULL,
  "hidden_signed_data" jsonb NOT NULL,
  "hidden_signed_data_hash" text NOT NULL,
  "provider_raw_payload" jsonb NOT NULL,
  "created_by_actor_id" text NOT NULL,
  "completed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "signature_party" (
  "id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL,
  "signature_request_id" text NOT NULL,
  "role" text NOT NULL,
  "signing_order" integer DEFAULT 1 NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "provider_party_id" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "signed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "signature_evidence" (
  "id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL,
  "signature_request_id" text NOT NULL,
  "signature_party_id" text,
  "provider" text NOT NULL,
  "provider_event_id" text NOT NULL,
  "provider_session_id" text NOT NULL,
  "signed_at" timestamp NOT NULL,
  "collected_at" timestamp NOT NULL,
  "signer_name" text NOT NULL,
  "signer_email" text,
  "signer_personal_number_masked" text,
  "document_pdf_sha256" text NOT NULL,
  "verification_status" text NOT NULL,
  "signature_value" text,
  "xml_dsig" text,
  "ocsp_response" text,
  "evidence_object_key" text,
  "raw_payload" jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "signature_request"
  ADD CONSTRAINT "signature_request_team_id_team_id_fk"
  FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "signature_request"
  ADD CONSTRAINT "signature_request_document_id_commercial_document_id_fk"
  FOREIGN KEY ("document_id") REFERENCES "commercial_document"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "signature_request"
  ADD CONSTRAINT "signature_request_document_version_id_commercial_document_version_id_fk"
  FOREIGN KEY ("document_version_id") REFERENCES "commercial_document_version"("id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "signature_party"
  ADD CONSTRAINT "signature_party_team_id_team_id_fk"
  FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "signature_party"
  ADD CONSTRAINT "signature_party_signature_request_id_signature_request_id_fk"
  FOREIGN KEY ("signature_request_id") REFERENCES "signature_request"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "signature_evidence"
  ADD CONSTRAINT "signature_evidence_team_id_team_id_fk"
  FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "signature_evidence"
  ADD CONSTRAINT "signature_evidence_signature_request_id_signature_request_id_fk"
  FOREIGN KEY ("signature_request_id") REFERENCES "signature_request"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "signature_evidence"
  ADD CONSTRAINT "signature_evidence_signature_party_id_signature_party_id_fk"
  FOREIGN KEY ("signature_party_id") REFERENCES "signature_party"("id") ON DELETE set null ON UPDATE no action;

CREATE INDEX "signature_request_team_document_idx"
  ON "signature_request" USING btree ("team_id", "document_id");

CREATE INDEX "signature_request_team_version_idx"
  ON "signature_request" USING btree ("team_id", "document_version_id");

CREATE UNIQUE INDEX "signature_request_provider_session_idx"
  ON "signature_request" USING btree ("provider", "provider_session_id");

CREATE INDEX "signature_party_request_order_idx"
  ON "signature_party" USING btree ("signature_request_id", "signing_order");

CREATE INDEX "signature_party_team_status_idx"
  ON "signature_party" USING btree ("team_id", "status");

CREATE UNIQUE INDEX "signature_evidence_provider_event_idx"
  ON "signature_evidence" USING btree ("provider", "provider_event_id");

CREATE INDEX "signature_evidence_request_idx"
  ON "signature_evidence" USING btree ("team_id", "signature_request_id");

CREATE INDEX "signature_evidence_session_idx"
  ON "signature_evidence" USING btree ("provider", "provider_session_id");
