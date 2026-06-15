CREATE TABLE "hard_negative_match" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"inbox_item_id" text NOT NULL,
	"transaction_id" text NOT NULL,
	"reason" text,
	"created_by_actor_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox_match_suggestion" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"inbox_item_id" text NOT NULL,
	"transaction_id" text NOT NULL,
	"score" integer NOT NULL,
	"confidence" text NOT NULL,
	"explanation" jsonb NOT NULL,
	"status" text DEFAULT 'suggested' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_alias" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"source" text NOT NULL,
	"target" text NOT NULL,
	"created_by_actor_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_attachment" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"transaction_id" text NOT NULL,
	"document_id" text NOT NULL,
	"inbox_item_id" text,
	"created_by_actor_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hard_negative_match" ADD CONSTRAINT "hard_negative_match_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hard_negative_match" ADD CONSTRAINT "hard_negative_match_inbox_item_id_inbox_item_id_fk" FOREIGN KEY ("inbox_item_id") REFERENCES "public"."inbox_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hard_negative_match" ADD CONSTRAINT "hard_negative_match_transaction_id_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transaction"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_match_suggestion" ADD CONSTRAINT "inbox_match_suggestion_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_match_suggestion" ADD CONSTRAINT "inbox_match_suggestion_inbox_item_id_inbox_item_id_fk" FOREIGN KEY ("inbox_item_id") REFERENCES "public"."inbox_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_match_suggestion" ADD CONSTRAINT "inbox_match_suggestion_transaction_id_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transaction"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_alias" ADD CONSTRAINT "team_alias_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_attachment" ADD CONSTRAINT "transaction_attachment_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_attachment" ADD CONSTRAINT "transaction_attachment_transaction_id_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transaction"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_attachment" ADD CONSTRAINT "transaction_attachment_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_attachment" ADD CONSTRAINT "transaction_attachment_inbox_item_id_inbox_item_id_fk" FOREIGN KEY ("inbox_item_id") REFERENCES "public"."inbox_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hard_negative_match_item_transaction_idx" ON "hard_negative_match" USING btree ("team_id","inbox_item_id","transaction_id");--> statement-breakpoint
CREATE INDEX "hard_negative_match_team_item_idx" ON "hard_negative_match" USING btree ("team_id","inbox_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inbox_match_suggestion_item_transaction_idx" ON "inbox_match_suggestion" USING btree ("team_id","inbox_item_id","transaction_id");--> statement-breakpoint
CREATE INDEX "inbox_match_suggestion_team_item_idx" ON "inbox_match_suggestion" USING btree ("team_id","inbox_item_id");--> statement-breakpoint
CREATE INDEX "inbox_match_suggestion_transaction_idx" ON "inbox_match_suggestion" USING btree ("transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_alias_source_target_idx" ON "team_alias" USING btree ("team_id","source","target");--> statement-breakpoint
CREATE INDEX "team_alias_team_idx" ON "team_alias" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transaction_attachment_document_idx" ON "transaction_attachment" USING btree ("team_id","transaction_id","document_id");--> statement-breakpoint
CREATE INDEX "transaction_attachment_team_transaction_idx" ON "transaction_attachment" USING btree ("team_id","transaction_id");--> statement-breakpoint
CREATE INDEX "transaction_attachment_inbox_item_idx" ON "transaction_attachment" USING btree ("inbox_item_id");