CREATE TABLE "commercial_document" (
  "id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL,
  "account_id" text NOT NULL,
  "opportunity_id" text NOT NULL,
  "document_type" text DEFAULT 'quote' NOT NULL,
  "title" text NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "currency" text NOT NULL,
  "valid_until" timestamp,
  "payment_terms" text,
  "terms_version" text NOT NULL,
  "template_id" text,
  "recipient_email" text,
  "scope" text,
  "active_version_id" text,
  "recipient_access_token_hash" text,
  "recipient_access_token_expires_at" timestamp,
  "sent_at" timestamp,
  "viewed_at" timestamp,
  "declined_at" timestamp,
  "decline_reason" text,
  "created_by_actor_id" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "commercial_document_line" (
  "id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL,
  "document_id" text NOT NULL,
  "source" text NOT NULL,
  "provider" text,
  "provider_connection_id" text,
  "provider_object_id" text,
  "provider_object_record_id" text,
  "article_number" text,
  "description" text NOT NULL,
  "unit" text,
  "quantity_milli" integer NOT NULL,
  "unit_price_minor" integer NOT NULL,
  "currency" text NOT NULL,
  "discount_basis_points" integer DEFAULT 0 NOT NULL,
  "vat_rate_basis_points" integer DEFAULT 0 NOT NULL,
  "subtotal_minor" integer NOT NULL,
  "discount_minor" integer NOT NULL,
  "vat_minor" integer NOT NULL,
  "total_minor" integer NOT NULL,
  "snapshot" jsonb,
  "sort_order" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "commercial_document_version" (
  "id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL,
  "document_id" text NOT NULL,
  "version_number" integer NOT NULL,
  "status" text DEFAULT 'finalised' NOT NULL,
  "snapshot" jsonb NOT NULL,
  "pdf_object_key" text NOT NULL,
  "pdf_body_base64" text NOT NULL,
  "pdf_sha256" text NOT NULL,
  "byte_size" integer NOT NULL,
  "finalized_by_actor_id" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "commercial_document"
  ADD CONSTRAINT "commercial_document_team_id_team_id_fk"
  FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "commercial_document"
  ADD CONSTRAINT "commercial_document_account_id_crm_account_record_id_fk"
  FOREIGN KEY ("account_id") REFERENCES "crm_account"("record_id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "commercial_document"
  ADD CONSTRAINT "commercial_document_opportunity_id_crm_opportunity_record_id_fk"
  FOREIGN KEY ("opportunity_id") REFERENCES "crm_opportunity"("record_id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "commercial_document_line"
  ADD CONSTRAINT "commercial_document_line_team_id_team_id_fk"
  FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "commercial_document_line"
  ADD CONSTRAINT "commercial_document_line_document_id_commercial_document_id_fk"
  FOREIGN KEY ("document_id") REFERENCES "commercial_document"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "commercial_document_line"
  ADD CONSTRAINT "commercial_document_line_provider_object_record_id_provider_object_id_fk"
  FOREIGN KEY ("provider_object_record_id") REFERENCES "provider_object"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE "commercial_document_version"
  ADD CONSTRAINT "commercial_document_version_team_id_team_id_fk"
  FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "commercial_document_version"
  ADD CONSTRAINT "commercial_document_version_document_id_commercial_document_id_fk"
  FOREIGN KEY ("document_id") REFERENCES "commercial_document"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX "commercial_document_team_status_idx"
  ON "commercial_document" USING btree ("team_id", "status");

CREATE INDEX "commercial_document_team_account_idx"
  ON "commercial_document" USING btree ("team_id", "account_id");

CREATE INDEX "commercial_document_team_opportunity_idx"
  ON "commercial_document" USING btree ("team_id", "opportunity_id");

CREATE UNIQUE INDEX "commercial_document_recipient_token_idx"
  ON "commercial_document" USING btree ("recipient_access_token_hash");

CREATE INDEX "commercial_document_line_document_idx"
  ON "commercial_document_line" USING btree ("document_id", "sort_order");

CREATE INDEX "commercial_document_line_provider_object_idx"
  ON "commercial_document_line" USING btree ("provider_object_record_id");

CREATE UNIQUE INDEX "commercial_document_version_number_idx"
  ON "commercial_document_version" USING btree ("document_id", "version_number");

CREATE UNIQUE INDEX "commercial_document_version_pdf_object_key_idx"
  ON "commercial_document_version" USING btree ("pdf_object_key");

CREATE INDEX "commercial_document_version_team_document_idx"
  ON "commercial_document_version" USING btree ("team_id", "document_id");
