CREATE TABLE "crm_record" (
  "id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL,
  "object_type_id" text NOT NULL,
  "owner_principal_id" text,
  "lifecycle_state" text DEFAULT 'active' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_by_actor_id" text NOT NULL,
  "updated_by_actor_id" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "archived_at" timestamp,
  "deleted_at" timestamp
);--> statement-breakpoint

CREATE TABLE "crm_party" (
  "record_id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL,
  "party_type" text NOT NULL
);--> statement-breakpoint

CREATE TABLE "crm_organization" (
  "record_id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL,
  "legal_name" text NOT NULL,
  "display_name" text,
  "organization_number" text,
  "country_code" text,
  "vat_number" text,
  "website_domain" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "crm_account" (
  "record_id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL,
  "legal_entity_id" text,
  "organization_id" text NOT NULL,
  "account_type" text DEFAULT 'prospect' NOT NULL,
  "relationship_status" text DEFAULT 'active' NOT NULL,
  "primary_owner_principal_id" text,
  "customer_since" timestamp,
  "churned_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "crm_opportunity" (
  "record_id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL,
  "account_id" text NOT NULL,
  "name" text NOT NULL,
  "amount_minor" integer NOT NULL,
  "currency_code" text NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "expected_close_date" timestamp,
  "primary_owner_principal_id" text,
  "won_at" timestamp,
  "lost_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "crm_record"
  ADD CONSTRAINT "crm_record_team_id_team_id_fk"
  FOREIGN KEY ("team_id") REFERENCES "public"."team"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "crm_party"
  ADD CONSTRAINT "crm_party_record_id_crm_record_id_fk"
  FOREIGN KEY ("record_id") REFERENCES "public"."crm_record"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "crm_party"
  ADD CONSTRAINT "crm_party_team_id_team_id_fk"
  FOREIGN KEY ("team_id") REFERENCES "public"."team"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "crm_organization"
  ADD CONSTRAINT "crm_organization_record_id_crm_record_id_fk"
  FOREIGN KEY ("record_id") REFERENCES "public"."crm_record"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "crm_organization"
  ADD CONSTRAINT "crm_organization_team_id_team_id_fk"
  FOREIGN KEY ("team_id") REFERENCES "public"."team"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "crm_account"
  ADD CONSTRAINT "crm_account_record_id_crm_record_id_fk"
  FOREIGN KEY ("record_id") REFERENCES "public"."crm_record"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "crm_account"
  ADD CONSTRAINT "crm_account_team_id_team_id_fk"
  FOREIGN KEY ("team_id") REFERENCES "public"."team"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "crm_account"
  ADD CONSTRAINT "crm_account_organization_id_crm_organization_record_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."crm_organization"("record_id")
  ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "crm_opportunity"
  ADD CONSTRAINT "crm_opportunity_record_id_crm_record_id_fk"
  FOREIGN KEY ("record_id") REFERENCES "public"."crm_record"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "crm_opportunity"
  ADD CONSTRAINT "crm_opportunity_team_id_team_id_fk"
  FOREIGN KEY ("team_id") REFERENCES "public"."team"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "crm_opportunity"
  ADD CONSTRAINT "crm_opportunity_account_id_crm_account_record_id_fk"
  FOREIGN KEY ("account_id") REFERENCES "public"."crm_account"("record_id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "crm_record_team_object_type_idx"
  ON "crm_record" USING btree ("team_id", "object_type_id");--> statement-breakpoint

CREATE INDEX "crm_party_team_party_type_idx"
  ON "crm_party" USING btree ("team_id", "party_type");--> statement-breakpoint

CREATE INDEX "crm_organization_team_legal_name_idx"
  ON "crm_organization" USING btree ("team_id", "legal_name");--> statement-breakpoint

CREATE UNIQUE INDEX "crm_organization_team_organization_number_idx"
  ON "crm_organization" USING btree ("team_id", "organization_number");--> statement-breakpoint

CREATE INDEX "crm_account_team_organization_idx"
  ON "crm_account" USING btree ("team_id", "organization_id");--> statement-breakpoint

CREATE INDEX "crm_account_team_account_type_idx"
  ON "crm_account" USING btree ("team_id", "account_type");--> statement-breakpoint

CREATE INDEX "crm_opportunity_team_account_idx"
  ON "crm_opportunity" USING btree ("team_id", "account_id");--> statement-breakpoint

CREATE INDEX "crm_opportunity_team_status_idx"
  ON "crm_opportunity" USING btree ("team_id", "status");
