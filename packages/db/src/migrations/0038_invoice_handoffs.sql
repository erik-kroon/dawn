CREATE TABLE IF NOT EXISTS "invoice_handoff_policy" (
  "team_id" text PRIMARY KEY NOT NULL REFERENCES "team"("id") ON DELETE cascade,
  "mode" text DEFAULT 'manual' NOT NULL,
  "updated_by_actor_id" text,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "invoice_handoff" (
  "id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL REFERENCES "team"("id") ON DELETE cascade,
  "account_id" text NOT NULL REFERENCES "crm_account"("record_id") ON DELETE cascade,
  "opportunity_id" text NOT NULL REFERENCES "crm_opportunity"("record_id") ON DELETE cascade,
  "document_id" text NOT NULL REFERENCES "commercial_document"("id") ON DELETE cascade,
  "document_version_id" text NOT NULL REFERENCES "commercial_document_version"("id") ON DELETE restrict,
  "signature_request_id" text NOT NULL REFERENCES "signature_request"("id") ON DELETE cascade,
  "provider" text NOT NULL,
  "connection_id" text NOT NULL REFERENCES "integration_connection"("id") ON DELETE restrict,
  "status" text DEFAULT 'waiting_manual_approval' NOT NULL,
  "requested_by_actor_id" text NOT NULL,
  "requested_at" timestamp NOT NULL,
  "approved_by_actor_id" text,
  "approved_at" timestamp,
  "provider_object_record_id" text REFERENCES "provider_object"("id") ON DELETE set null,
  "provider_invoice_id" text,
  "provider_invoice_number" text,
  "provider_invoice_url" text,
  "provider_status" text,
  "failure_code" text,
  "failure_message" text,
  "request_payload" jsonb NOT NULL,
  "raw_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "last_attempt_at" timestamp,
  "completed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "invoice_handoff_active_document_version_idx"
  ON "invoice_handoff" ("team_id", "provider", "document_version_id")
  WHERE "status" <> 'failed';

CREATE INDEX IF NOT EXISTS "invoice_handoff_team_document_idx"
  ON "invoice_handoff" ("team_id", "document_id");

CREATE INDEX IF NOT EXISTS "invoice_handoff_team_status_idx"
  ON "invoice_handoff" ("team_id", "status");

CREATE INDEX IF NOT EXISTS "invoice_handoff_team_connection_idx"
  ON "invoice_handoff" ("team_id", "connection_id");

CREATE INDEX IF NOT EXISTS "invoice_handoff_provider_invoice_idx"
  ON "invoice_handoff" ("provider", "provider_invoice_id");
