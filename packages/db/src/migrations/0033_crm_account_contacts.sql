CREATE TABLE IF NOT EXISTS "crm_person" (
  "record_id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL,
  "given_name" text,
  "family_name" text,
  "display_name" text NOT NULL,
  "email" text,
  "phone_number" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "crm_person_record_id_crm_record_id_fk"
    FOREIGN KEY ("record_id") REFERENCES "public"."crm_record"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "crm_person_team_id_team_id_fk"
    FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action
);

CREATE INDEX IF NOT EXISTS "crm_person_team_display_name_idx"
  ON "crm_person" ("team_id", "display_name");

CREATE INDEX IF NOT EXISTS "crm_person_team_email_idx"
  ON "crm_person" ("team_id", "email");

CREATE TABLE IF NOT EXISTS "crm_contact" (
  "record_id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL,
  "account_id" text NOT NULL,
  "person_id" text NOT NULL,
  "role" text,
  "is_primary" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "crm_contact_record_id_crm_record_id_fk"
    FOREIGN KEY ("record_id") REFERENCES "public"."crm_record"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "crm_contact_team_id_team_id_fk"
    FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "crm_contact_account_id_crm_account_record_id_fk"
    FOREIGN KEY ("account_id") REFERENCES "public"."crm_account"("record_id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "crm_contact_person_id_crm_person_record_id_fk"
    FOREIGN KEY ("person_id") REFERENCES "public"."crm_person"("record_id") ON DELETE restrict ON UPDATE no action
);

CREATE INDEX IF NOT EXISTS "crm_contact_team_account_idx"
  ON "crm_contact" ("team_id", "account_id");

CREATE INDEX IF NOT EXISTS "crm_contact_team_person_idx"
  ON "crm_contact" ("team_id", "person_id");

CREATE UNIQUE INDEX IF NOT EXISTS "crm_contact_team_account_person_idx"
  ON "crm_contact" ("team_id", "account_id", "person_id");
