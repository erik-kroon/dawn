CREATE TABLE "counterparty" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_account" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"name" text NOT NULL,
	"currency" text NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_split" (
	"id" text PRIMARY KEY NOT NULL,
	"transaction_id" text NOT NULL,
	"category_id" text,
	"amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_tag" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_tag_assignment" (
	"transaction_id" text NOT NULL,
	"tag_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "account_id" text;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "type" text DEFAULT 'expense' NOT NULL;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "counterparty_id" text;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "provider_transaction_id" text;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "duplicate_key" text;--> statement-breakpoint
ALTER TABLE "counterparty" ADD CONSTRAINT "counterparty_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_account" ADD CONSTRAINT "ledger_account_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_split" ADD CONSTRAINT "transaction_split_transaction_id_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transaction"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_split" ADD CONSTRAINT "transaction_split_category_id_transaction_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."transaction_category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_tag" ADD CONSTRAINT "transaction_tag_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_tag_assignment" ADD CONSTRAINT "transaction_tag_assignment_transaction_id_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transaction"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_tag_assignment" ADD CONSTRAINT "transaction_tag_assignment_tag_id_transaction_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."transaction_tag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "counterparty_team_name_idx" ON "counterparty" USING btree ("team_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_account_team_name_idx" ON "ledger_account" USING btree ("team_id","name");--> statement-breakpoint
CREATE INDEX "ledger_account_team_idx" ON "ledger_account" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "transaction_split_transaction_idx" ON "transaction_split" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "transaction_split_category_idx" ON "transaction_split" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transaction_tag_team_name_idx" ON "transaction_tag" USING btree ("team_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "transaction_tag_assignment_idx" ON "transaction_tag_assignment" USING btree ("transaction_id","tag_id");--> statement-breakpoint
CREATE INDEX "transaction_tag_assignment_tag_idx" ON "transaction_tag_assignment" USING btree ("tag_id");--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_account_id_ledger_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ledger_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_counterparty_id_counterparty_id_fk" FOREIGN KEY ("counterparty_id") REFERENCES "public"."counterparty"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transaction_team_account_posted_idx" ON "transaction" USING btree ("team_id","account_id","posted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "transaction_team_duplicate_idx" ON "transaction" USING btree ("team_id","duplicate_key");--> statement-breakpoint
CREATE UNIQUE INDEX "transaction_team_provider_idx" ON "transaction" USING btree ("team_id","provider_transaction_id");