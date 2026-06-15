ALTER TABLE "transaction" ADD COLUMN "accountant_status" text DEFAULT 'needs_review' NOT NULL;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "accountant_status_reason" text;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "accountant_status_updated_at" timestamp;--> statement-breakpoint
CREATE INDEX "transaction_team_accountant_status_idx" ON "transaction" USING btree ("team_id","accountant_status");
