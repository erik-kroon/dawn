CREATE TABLE "document" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'uploading' NOT NULL,
	"current_version_id" text,
	"created_by_actor_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_version" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"team_id" text NOT NULL,
	"version_number" integer NOT NULL,
	"object_key" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"checksum_sha256" text,
	"status" text DEFAULT 'pending_upload' NOT NULL,
	"uploaded_by_actor_id" text NOT NULL,
	"uploaded_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_version" ADD CONSTRAINT "document_version_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_version" ADD CONSTRAINT "document_version_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_team_status_idx" ON "document" USING btree ("team_id","status");--> statement-breakpoint
CREATE INDEX "document_team_updated_idx" ON "document" USING btree ("team_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "document_version_number_idx" ON "document_version" USING btree ("document_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "document_version_object_key_idx" ON "document_version" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "document_version_team_idx" ON "document_version" USING btree ("team_id","created_at");