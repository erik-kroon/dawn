CREATE TABLE "document_extraction" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"inbox_item_id" text NOT NULL,
	"document_id" text NOT NULL,
	"document_version_id" text NOT NULL,
	"extraction_version" integer NOT NULL,
	"source" text NOT NULL,
	"status" text NOT NULL,
	"fields" jsonb NOT NULL,
	"confidence" jsonb NOT NULL,
	"raw_text" text,
	"error" text,
	"created_by_actor_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox_item" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"source_id" text NOT NULL,
	"source_type" text NOT NULL,
	"document_id" text NOT NULL,
	"document_version_id" text NOT NULL,
	"status" text DEFAULT 'pending_extraction' NOT NULL,
	"extraction_status" text DEFAULT 'pending' NOT NULL,
	"created_by_actor_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox_source" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_extraction" ADD CONSTRAINT "document_extraction_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_extraction" ADD CONSTRAINT "document_extraction_inbox_item_id_inbox_item_id_fk" FOREIGN KEY ("inbox_item_id") REFERENCES "public"."inbox_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_extraction" ADD CONSTRAINT "document_extraction_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_extraction" ADD CONSTRAINT "document_extraction_document_version_id_document_version_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "public"."document_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_item" ADD CONSTRAINT "inbox_item_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_item" ADD CONSTRAINT "inbox_item_source_id_inbox_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."inbox_source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_item" ADD CONSTRAINT "inbox_item_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_item" ADD CONSTRAINT "inbox_item_document_version_id_document_version_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "public"."document_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_source" ADD CONSTRAINT "inbox_source_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_extraction_version_idx" ON "document_extraction" USING btree ("inbox_item_id","extraction_version");--> statement-breakpoint
CREATE INDEX "document_extraction_team_idx" ON "document_extraction" USING btree ("team_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "inbox_item_document_version_idx" ON "inbox_item" USING btree ("team_id","document_version_id");--> statement-breakpoint
CREATE INDEX "inbox_item_team_status_idx" ON "inbox_item" USING btree ("team_id","status");--> statement-breakpoint
CREATE INDEX "inbox_item_team_updated_idx" ON "inbox_item" USING btree ("team_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "inbox_source_team_type_name_idx" ON "inbox_source" USING btree ("team_id","type","name");