CREATE TABLE "project" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'active' NOT NULL,
	"billable_rate_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"created_by_actor_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_member" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"project_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"role" text NOT NULL,
	"billable_rate_minor" integer,
	"currency" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"project_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"description" text NOT NULL,
	"occurred_on" timestamp NOT NULL,
	"duration_minutes" integer NOT NULL,
	"billable_status" text NOT NULL,
	"billable_rate_minor" integer,
	"currency" text,
	"invoice_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_member" ADD CONSTRAINT "project_member_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_member" ADD CONSTRAINT "project_member_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_team_status_idx" ON "project" USING btree ("team_id","status");--> statement-breakpoint
CREATE INDEX "project_customer_idx" ON "project" USING btree ("customer_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "project_member_actor_idx" ON "project_member" USING btree ("project_id","actor_id");--> statement-breakpoint
CREATE INDEX "project_member_team_idx" ON "project_member" USING btree ("team_id","actor_id");--> statement-breakpoint
CREATE INDEX "time_entry_team_occurred_idx" ON "time_entry" USING btree ("team_id","occurred_on");--> statement-breakpoint
CREATE INDEX "time_entry_project_idx" ON "time_entry" USING btree ("project_id","occurred_on");--> statement-breakpoint
CREATE INDEX "time_entry_invoice_idx" ON "time_entry" USING btree ("invoice_id");