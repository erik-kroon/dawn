CREATE TABLE "bank_account" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"ledger_account_id" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"name" text NOT NULL,
	"currency" text NOT NULL,
	"type" text NOT NULL,
	"current_balance_minor" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"raw_payload" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_connection" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_connection_id" text NOT NULL,
	"institution_name" text NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL,
	"last_sync_at" timestamp,
	"raw_payload" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_object" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_object_type" text NOT NULL,
	"provider_object_id" text NOT NULL,
	"connection_id" text,
	"bank_account_id" text,
	"internal_entity_type" text,
	"internal_entity_id" text,
	"raw_payload" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_sync_run" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"accounts_synced" integer DEFAULT 0 NOT NULL,
	"transactions_imported" integer DEFAULT 0 NOT NULL,
	"duplicate_count" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "bank_account" ADD CONSTRAINT "bank_account_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_account" ADD CONSTRAINT "bank_account_connection_id_bank_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."bank_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_account" ADD CONSTRAINT "bank_account_ledger_account_id_ledger_account_id_fk" FOREIGN KEY ("ledger_account_id") REFERENCES "public"."ledger_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_connection" ADD CONSTRAINT "bank_connection_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_object" ADD CONSTRAINT "provider_object_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_object" ADD CONSTRAINT "provider_object_connection_id_bank_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."bank_connection"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_object" ADD CONSTRAINT "provider_object_bank_account_id_bank_account_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_sync_run" ADD CONSTRAINT "provider_sync_run_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_sync_run" ADD CONSTRAINT "provider_sync_run_connection_id_bank_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."bank_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bank_account_provider_idx" ON "bank_account" USING btree ("connection_id","provider_account_id");--> statement-breakpoint
CREATE INDEX "bank_account_team_idx" ON "bank_account" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_connection_provider_idx" ON "bank_connection" USING btree ("team_id","provider","provider_connection_id");--> statement-breakpoint
CREATE INDEX "bank_connection_team_status_idx" ON "bank_connection" USING btree ("team_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_object_provider_idx" ON "provider_object" USING btree ("team_id","provider","provider_object_type","provider_object_id");--> statement-breakpoint
CREATE INDEX "provider_object_internal_idx" ON "provider_object" USING btree ("internal_entity_type","internal_entity_id");--> statement-breakpoint
CREATE INDEX "provider_sync_run_connection_idx" ON "provider_sync_run" USING btree ("connection_id","started_at");--> statement-breakpoint
CREATE INDEX "provider_sync_run_status_idx" ON "provider_sync_run" USING btree ("status","started_at");