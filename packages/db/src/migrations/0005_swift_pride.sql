CREATE TABLE "job_run" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"outbox_event_id" text NOT NULL,
	"job_type" text NOT NULL,
	"queue_name" text NOT NULL,
	"status" text NOT NULL,
	"attempt" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "outbox_event" ADD COLUMN "dispatch_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "outbox_event" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "outbox_event" ADD COLUMN "next_attempt_at" timestamp;--> statement-breakpoint
ALTER TABLE "job_run" ADD CONSTRAINT "job_run_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_run" ADD CONSTRAINT "job_run_outbox_event_id_outbox_event_id_fk" FOREIGN KEY ("outbox_event_id") REFERENCES "public"."outbox_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_run_outbox_idx" ON "job_run" USING btree ("outbox_event_id","created_at");--> statement-breakpoint
CREATE INDEX "job_run_status_idx" ON "job_run" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "outbox_event_retry_idx" ON "outbox_event" USING btree ("status","next_attempt_at");