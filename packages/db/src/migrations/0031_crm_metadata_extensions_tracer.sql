CREATE TABLE IF NOT EXISTS "crm_object_type_definition" (
  "id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL,
  "object_type_id" text NOT NULL,
  "label" text NOT NULL,
  "is_custom" boolean DEFAULT true NOT NULL,
  "created_by_actor_id" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "crm_object_type_definition_team_id_team_id_fk"
    FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action
);

CREATE TABLE IF NOT EXISTS "crm_field_definition" (
  "id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL,
  "object_type_definition_id" text NOT NULL,
  "object_type_id" text NOT NULL,
  "stable_key" text NOT NULL,
  "label" text NOT NULL,
  "field_type" text NOT NULL,
  "cardinality" text DEFAULT 'single' NOT NULL,
  "is_required" boolean DEFAULT false NOT NULL,
  "is_unique" boolean DEFAULT false NOT NULL,
  "allowed_reference_object_type_id" text,
  "created_by_actor_id" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "crm_field_definition_team_id_team_id_fk"
    FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "crm_field_definition_object_type_definition_id_fk"
    FOREIGN KEY ("object_type_definition_id") REFERENCES "public"."crm_object_type_definition"("id") ON DELETE cascade ON UPDATE no action
);

CREATE TABLE IF NOT EXISTS "crm_option_set" (
  "id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL,
  "field_definition_id" text NOT NULL,
  "stable_key" text NOT NULL,
  "label" text NOT NULL,
  "created_by_actor_id" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "crm_option_set_team_id_team_id_fk"
    FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "crm_option_set_field_definition_id_fk"
    FOREIGN KEY ("field_definition_id") REFERENCES "public"."crm_field_definition"("id") ON DELETE cascade ON UPDATE no action
);

CREATE TABLE IF NOT EXISTS "crm_option_value" (
  "id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL,
  "option_set_id" text NOT NULL,
  "stable_key" text NOT NULL,
  "label" text NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "crm_option_value_team_id_team_id_fk"
    FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "crm_option_value_option_set_id_fk"
    FOREIGN KEY ("option_set_id") REFERENCES "public"."crm_option_set"("id") ON DELETE cascade ON UPDATE no action
);

CREATE TABLE IF NOT EXISTS "crm_record_field_value" (
  "id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL,
  "record_id" text NOT NULL,
  "field_definition_id" text NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "text_value" text,
  "integer_value" integer,
  "boolean_value" boolean,
  "date_value" timestamp,
  "amount_minor" integer,
  "currency_code" text,
  "option_value_id" text,
  "reference_record_id" text,
  "updated_by_actor_id" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "crm_record_field_value_team_id_team_id_fk"
    FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "crm_record_field_value_record_id_fk"
    FOREIGN KEY ("record_id") REFERENCES "public"."crm_record"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "crm_record_field_value_field_definition_id_fk"
    FOREIGN KEY ("field_definition_id") REFERENCES "public"."crm_field_definition"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "crm_record_field_value_option_value_id_fk"
    FOREIGN KEY ("option_value_id") REFERENCES "public"."crm_option_value"("id") ON DELETE restrict ON UPDATE no action,
  CONSTRAINT "crm_record_field_value_reference_record_id_fk"
    FOREIGN KEY ("reference_record_id") REFERENCES "public"."crm_record"("id") ON DELETE restrict ON UPDATE no action
);

CREATE UNIQUE INDEX IF NOT EXISTS "crm_object_type_definition_team_object_type_idx"
  ON "crm_object_type_definition" USING btree ("team_id", "object_type_id");
CREATE UNIQUE INDEX IF NOT EXISTS "crm_field_definition_team_object_stable_key_idx"
  ON "crm_field_definition" USING btree ("team_id", "object_type_id", "stable_key");
CREATE INDEX IF NOT EXISTS "crm_field_definition_team_object_type_definition_idx"
  ON "crm_field_definition" USING btree ("team_id", "object_type_definition_id");
CREATE UNIQUE INDEX IF NOT EXISTS "crm_option_set_team_field_definition_idx"
  ON "crm_option_set" USING btree ("team_id", "field_definition_id");
CREATE UNIQUE INDEX IF NOT EXISTS "crm_option_value_team_set_stable_key_idx"
  ON "crm_option_value" USING btree ("team_id", "option_set_id", "stable_key");
CREATE INDEX IF NOT EXISTS "crm_option_value_team_set_sort_idx"
  ON "crm_option_value" USING btree ("team_id", "option_set_id", "sort_order");
CREATE UNIQUE INDEX IF NOT EXISTS "crm_record_field_value_team_record_field_position_idx"
  ON "crm_record_field_value" USING btree ("team_id", "record_id", "field_definition_id", "position");
CREATE INDEX IF NOT EXISTS "crm_record_field_value_text_filter_idx"
  ON "crm_record_field_value" USING btree ("team_id", "field_definition_id", "text_value");
CREATE INDEX IF NOT EXISTS "crm_record_field_value_integer_filter_idx"
  ON "crm_record_field_value" USING btree ("team_id", "field_definition_id", "integer_value");
CREATE INDEX IF NOT EXISTS "crm_record_field_value_boolean_filter_idx"
  ON "crm_record_field_value" USING btree ("team_id", "field_definition_id", "boolean_value");
CREATE INDEX IF NOT EXISTS "crm_record_field_value_date_filter_idx"
  ON "crm_record_field_value" USING btree ("team_id", "field_definition_id", "date_value");
CREATE INDEX IF NOT EXISTS "crm_record_field_value_money_filter_idx"
  ON "crm_record_field_value" USING btree ("team_id", "field_definition_id", "amount_minor", "currency_code");
CREATE INDEX IF NOT EXISTS "crm_record_field_value_option_filter_idx"
  ON "crm_record_field_value" USING btree ("team_id", "field_definition_id", "option_value_id");
CREATE INDEX IF NOT EXISTS "crm_record_field_value_reference_filter_idx"
  ON "crm_record_field_value" USING btree ("team_id", "field_definition_id", "reference_record_id");
