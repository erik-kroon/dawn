CREATE TABLE "crm_record_grant" (
  "id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL,
  "record_id" text NOT NULL,
  "principal_id" text NOT NULL,
  "action" text NOT NULL,
  "granted_by_actor_id" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "crm_field_security_policy" (
  "id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL,
  "target_record_id" text,
  "object_type_id" text NOT NULL,
  "principal_id" text,
  "field_id" text NOT NULL,
  "action" text NOT NULL,
  "effect" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_record_grant"
  ADD CONSTRAINT "crm_record_grant_team_id_team_id_fk"
  FOREIGN KEY ("team_id") REFERENCES "public"."team"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "crm_record_grant"
  ADD CONSTRAINT "crm_record_grant_record_id_crm_record_id_fk"
  FOREIGN KEY ("record_id") REFERENCES "public"."crm_record"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "crm_field_security_policy"
  ADD CONSTRAINT "crm_field_security_policy_team_id_team_id_fk"
  FOREIGN KEY ("team_id") REFERENCES "public"."team"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "crm_field_security_policy"
  ADD CONSTRAINT "crm_field_security_policy_target_record_id_crm_record_id_fk"
  FOREIGN KEY ("target_record_id") REFERENCES "public"."crm_record"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "crm_record_grant_team_record_principal_action_idx"
  ON "crm_record_grant" USING btree ("team_id", "record_id", "principal_id", "action");
--> statement-breakpoint
CREATE INDEX "crm_record_grant_principal_idx"
  ON "crm_record_grant" USING btree ("team_id", "principal_id");
--> statement-breakpoint
CREATE INDEX "crm_field_security_policy_lookup_idx"
  ON "crm_field_security_policy" USING btree ("team_id", "object_type_id", "target_record_id", "principal_id");
--> statement-breakpoint
CREATE INDEX "crm_field_security_policy_field_idx"
  ON "crm_field_security_policy" USING btree ("team_id", "object_type_id", "field_id");
