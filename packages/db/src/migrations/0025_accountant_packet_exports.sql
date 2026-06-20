CREATE TABLE "accountant_packet_export" (
  "id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL,
  "actor_id" text NOT NULL,
  "object_key" text NOT NULL,
  "file_name" text NOT NULL,
  "content_type" text NOT NULL,
  "byte_size" integer NOT NULL,
  "manifest" jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "accountant_packet_export"
  ADD CONSTRAINT "accountant_packet_export_team_id_team_id_fk"
  FOREIGN KEY ("team_id") REFERENCES "public"."team"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE UNIQUE INDEX "accountant_packet_export_object_key_idx"
  ON "accountant_packet_export" USING btree ("object_key");--> statement-breakpoint

CREATE INDEX "accountant_packet_export_team_created_idx"
  ON "accountant_packet_export" USING btree ("team_id", "created_at");
