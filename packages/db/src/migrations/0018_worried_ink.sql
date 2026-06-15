CREATE TABLE "integration_connection" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"category" text NOT NULL,
	"provider" text NOT NULL,
	"provider_connection_id" text NOT NULL,
	"display_name" text NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL,
	"capabilities" jsonb NOT NULL,
	"token_ciphertext" text NOT NULL,
	"token_key_id" text NOT NULL,
	"token_last_four" text NOT NULL,
	"raw_payload" jsonb NOT NULL,
	"last_sync_at" timestamp,
	"last_error" text,
	"disabled_at" timestamp,
	"created_by_actor_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_sync_run" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"integration_connection_id" text NOT NULL,
	"category" text NOT NULL,
	"provider" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"records_synced" integer DEFAULT 0 NOT NULL,
	"error" text,
	"raw_payload" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "integration_connection" ADD CONSTRAINT "integration_connection_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_sync_run" ADD CONSTRAINT "integration_sync_run_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_sync_run" ADD CONSTRAINT "integration_sync_run_integration_connection_id_integration_connection_id_fk" FOREIGN KEY ("integration_connection_id") REFERENCES "public"."integration_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "integration_connection_provider_idx" ON "integration_connection" USING btree ("team_id","provider","provider_connection_id");--> statement-breakpoint
CREATE INDEX "integration_connection_team_status_idx" ON "integration_connection" USING btree ("team_id","status");--> statement-breakpoint
CREATE INDEX "integration_connection_team_category_idx" ON "integration_connection" USING btree ("team_id","category");--> statement-breakpoint
CREATE INDEX "integration_sync_run_connection_idx" ON "integration_sync_run" USING btree ("integration_connection_id","started_at");--> statement-breakpoint
CREATE INDEX "integration_sync_run_status_idx" ON "integration_sync_run" USING btree ("status","started_at");