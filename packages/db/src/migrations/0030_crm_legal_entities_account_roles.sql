CREATE TABLE "crm_legal_entity" (
  "record_id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL,
  "legal_name" text NOT NULL,
  "organization_number" text,
  "vat_number" text,
  "country_code" text DEFAULT 'SE' NOT NULL,
  "base_currency" text DEFAULT 'SEK' NOT NULL,
  "fiscal_year_start_month" integer DEFAULT 1 NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_account" ADD COLUMN "lifecycle_stage" text;
--> statement-breakpoint
ALTER TABLE "crm_account" ADD COLUMN "segment" text;
--> statement-breakpoint
ALTER TABLE "crm_account" ADD COLUMN "territory" text;
--> statement-breakpoint
ALTER TABLE "crm_legal_entity"
  ADD CONSTRAINT "crm_legal_entity_record_id_crm_record_id_fk"
  FOREIGN KEY ("record_id") REFERENCES "public"."crm_record"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "crm_legal_entity"
  ADD CONSTRAINT "crm_legal_entity_team_id_team_id_fk"
  FOREIGN KEY ("team_id") REFERENCES "public"."team"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "crm_account"
  ADD CONSTRAINT "crm_account_legal_entity_id_crm_legal_entity_record_id_fk"
  FOREIGN KEY ("legal_entity_id") REFERENCES "public"."crm_legal_entity"("record_id")
  ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "crm_legal_entity_team_status_idx"
  ON "crm_legal_entity" USING btree ("team_id", "status");
--> statement-breakpoint
CREATE UNIQUE INDEX "crm_legal_entity_team_organization_number_idx"
  ON "crm_legal_entity" USING btree ("team_id", "organization_number");
--> statement-breakpoint
CREATE INDEX "crm_account_team_legal_entity_idx"
  ON "crm_account" USING btree ("team_id", "legal_entity_id");
--> statement-breakpoint
CREATE INDEX "crm_account_team_relationship_status_idx"
  ON "crm_account" USING btree ("team_id", "relationship_status");
