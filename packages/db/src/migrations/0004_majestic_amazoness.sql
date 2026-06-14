CREATE TABLE "transaction_import_session" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"account_id" text NOT NULL,
	"source" text DEFAULT 'csv' NOT NULL,
	"file_name" text,
	"status" text DEFAULT 'committed' NOT NULL,
	"created_by_actor_id" text NOT NULL,
	"mapping" jsonb NOT NULL,
	"row_count" integer NOT NULL,
	"imported_count" integer NOT NULL,
	"duplicate_count" integer NOT NULL,
	"invalid_count" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"committed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transaction_import_session" ADD CONSTRAINT "transaction_import_session_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_import_session" ADD CONSTRAINT "transaction_import_session_account_id_ledger_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ledger_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transaction_import_session_team_idx" ON "transaction_import_session" USING btree ("team_id","created_at");--> statement-breakpoint
CREATE INDEX "transaction_import_session_account_idx" ON "transaction_import_session" USING btree ("account_id","created_at");