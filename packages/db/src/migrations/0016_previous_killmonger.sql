CREATE TABLE "automation_rule" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"trigger_type" text NOT NULL,
	"trigger_event_type" text NOT NULL,
	"action_type" text NOT NULL,
	"action_config" jsonb NOT NULL,
	"approval_policy" text DEFAULT 'require_approval' NOT NULL,
	"created_by_actor_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_run" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"rule_id" text NOT NULL,
	"source_outbox_event_id" text NOT NULL,
	"status" text NOT NULL,
	"action_type" text NOT NULL,
	"input" jsonb NOT NULL,
	"output" jsonb NOT NULL,
	"error" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "automation_rule" ADD CONSTRAINT "automation_rule_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_run" ADD CONSTRAINT "automation_run_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_run" ADD CONSTRAINT "automation_run_rule_id_automation_rule_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."automation_rule"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_run" ADD CONSTRAINT "automation_run_source_outbox_event_id_outbox_event_id_fk" FOREIGN KEY ("source_outbox_event_id") REFERENCES "public"."outbox_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "automation_rule_team_enabled_idx" ON "automation_rule" USING btree ("team_id","enabled");--> statement-breakpoint
CREATE INDEX "automation_rule_trigger_idx" ON "automation_rule" USING btree ("team_id","trigger_event_type");--> statement-breakpoint
CREATE INDEX "automation_run_team_started_idx" ON "automation_run" USING btree ("team_id","started_at");--> statement-breakpoint
CREATE INDEX "automation_run_rule_started_idx" ON "automation_run" USING btree ("rule_id","started_at");--> statement-breakpoint
CREATE INDEX "automation_run_source_idx" ON "automation_run" USING btree ("source_outbox_event_id");