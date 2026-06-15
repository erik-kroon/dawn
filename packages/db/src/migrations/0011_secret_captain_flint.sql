CREATE TABLE "invoice_event" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"invoice_id" text NOT NULL,
	"type" text NOT NULL,
	"occurred_at" timestamp NOT NULL,
	"actor_id" text,
	"metadata" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_payment" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"invoice_id" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"paid_at" timestamp NOT NULL,
	"method" text,
	"note" text,
	"created_by_actor_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_invoice" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"source_invoice_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"frequency" text NOT NULL,
	"next_run_at" timestamp NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by_actor_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "amount_paid_minor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "viewed_at" timestamp;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "paid_at" timestamp;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "overdue_at" timestamp;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "voided_at" timestamp;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "delivery_to_email" text;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "delivery_provider_message_id" text;--> statement-breakpoint
ALTER TABLE "invoice_event" ADD CONSTRAINT "invoice_event_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_event" ADD CONSTRAINT "invoice_event_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_payment" ADD CONSTRAINT "invoice_payment_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_payment" ADD CONSTRAINT "invoice_payment_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_invoice" ADD CONSTRAINT "recurring_invoice_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_invoice" ADD CONSTRAINT "recurring_invoice_source_invoice_id_invoice_id_fk" FOREIGN KEY ("source_invoice_id") REFERENCES "public"."invoice"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_invoice" ADD CONSTRAINT "recurring_invoice_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_event_invoice_idx" ON "invoice_event" USING btree ("invoice_id","occurred_at");--> statement-breakpoint
CREATE INDEX "invoice_event_team_idx" ON "invoice_event" USING btree ("team_id","occurred_at");--> statement-breakpoint
CREATE INDEX "invoice_payment_invoice_idx" ON "invoice_payment" USING btree ("invoice_id","paid_at");--> statement-breakpoint
CREATE INDEX "invoice_payment_team_idx" ON "invoice_payment" USING btree ("team_id","paid_at");--> statement-breakpoint
CREATE INDEX "recurring_invoice_team_status_idx" ON "recurring_invoice" USING btree ("team_id","status","next_run_at");--> statement-breakpoint
CREATE INDEX "recurring_invoice_source_idx" ON "recurring_invoice" USING btree ("source_invoice_id");