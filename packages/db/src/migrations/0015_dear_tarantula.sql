CREATE TABLE "assistant_action_approval" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"requested_by_message_id" text NOT NULL,
	"team_id" text NOT NULL,
	"tool_name" text NOT NULL,
	"risk" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"input" jsonb NOT NULL,
	"preview" jsonb NOT NULL,
	"result" jsonb,
	"source_refs" jsonb NOT NULL,
	"requested_by_actor_id" text NOT NULL,
	"approved_by_actor_id" text,
	"rejected_by_actor_id" text,
	"rejection_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"decided_at" timestamp,
	"executed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "assistant_action_approval" ADD CONSTRAINT "assistant_action_approval_thread_id_assistant_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."assistant_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_action_approval" ADD CONSTRAINT "assistant_action_approval_requested_by_message_id_assistant_message_id_fk" FOREIGN KEY ("requested_by_message_id") REFERENCES "public"."assistant_message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_action_approval" ADD CONSTRAINT "assistant_action_approval_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assistant_action_approval_team_status_idx" ON "assistant_action_approval" USING btree ("team_id","status");--> statement-breakpoint
CREATE INDEX "assistant_action_approval_thread_created_idx" ON "assistant_action_approval" USING btree ("thread_id","created_at");