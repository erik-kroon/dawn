CREATE TABLE "assistant_message" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"team_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"source_refs" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_thread" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"title" text NOT NULL,
	"created_by_actor_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_tool_call" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"message_id" text NOT NULL,
	"team_id" text NOT NULL,
	"tool_name" text NOT NULL,
	"risk" text NOT NULL,
	"status" text NOT NULL,
	"input" jsonb NOT NULL,
	"output" jsonb NOT NULL,
	"source_refs" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assistant_message" ADD CONSTRAINT "assistant_message_thread_id_assistant_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."assistant_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_message" ADD CONSTRAINT "assistant_message_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_thread" ADD CONSTRAINT "assistant_thread_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_tool_call" ADD CONSTRAINT "assistant_tool_call_thread_id_assistant_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."assistant_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_tool_call" ADD CONSTRAINT "assistant_tool_call_message_id_assistant_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."assistant_message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_tool_call" ADD CONSTRAINT "assistant_tool_call_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assistant_message_thread_created_idx" ON "assistant_message" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "assistant_message_team_created_idx" ON "assistant_message" USING btree ("team_id","created_at");--> statement-breakpoint
CREATE INDEX "assistant_thread_team_updated_idx" ON "assistant_thread" USING btree ("team_id","updated_at");--> statement-breakpoint
CREATE INDEX "assistant_thread_creator_idx" ON "assistant_thread" USING btree ("team_id","created_by_actor_id");--> statement-breakpoint
CREATE INDEX "assistant_tool_call_thread_created_idx" ON "assistant_tool_call" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "assistant_tool_call_team_tool_idx" ON "assistant_tool_call" USING btree ("team_id","tool_name");