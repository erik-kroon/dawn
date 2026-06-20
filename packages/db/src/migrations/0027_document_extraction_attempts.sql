CREATE TABLE "document_extraction_attempt" (
  "id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL,
  "inbox_item_id" text NOT NULL,
  "document_id" text NOT NULL,
  "document_version_id" text NOT NULL,
  "extraction_id" text,
  "attempt_number" integer NOT NULL,
  "source" text NOT NULL,
  "provider" text,
  "model" text,
  "status" text NOT NULL,
  "duration_ms" integer,
  "quality_score" integer,
  "error_class" text,
  "error_message" text,
  "raw_text_present" boolean DEFAULT false NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "document_extraction_attempt"
  ADD CONSTRAINT "document_extraction_attempt_team_id_team_id_fk"
  FOREIGN KEY ("team_id") REFERENCES "public"."team"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "document_extraction_attempt"
  ADD CONSTRAINT "document_extraction_attempt_inbox_item_id_inbox_item_id_fk"
  FOREIGN KEY ("inbox_item_id") REFERENCES "public"."inbox_item"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "document_extraction_attempt"
  ADD CONSTRAINT "document_extraction_attempt_document_id_document_id_fk"
  FOREIGN KEY ("document_id") REFERENCES "public"."document"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "document_extraction_attempt"
  ADD CONSTRAINT "document_extraction_attempt_document_version_id_document_version_id_fk"
  FOREIGN KEY ("document_version_id") REFERENCES "public"."document_version"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "document_extraction_attempt"
  ADD CONSTRAINT "document_extraction_attempt_extraction_id_document_extraction_id_fk"
  FOREIGN KEY ("extraction_id") REFERENCES "public"."document_extraction"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "document_extraction_attempt_inbox_idx"
  ON "document_extraction_attempt" USING btree ("team_id", "inbox_item_id");--> statement-breakpoint

CREATE INDEX "document_extraction_attempt_extraction_idx"
  ON "document_extraction_attempt" USING btree ("extraction_id");
