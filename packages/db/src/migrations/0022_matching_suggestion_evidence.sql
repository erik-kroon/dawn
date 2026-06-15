ALTER TABLE "inbox_match_suggestion" ADD COLUMN "signal_scores" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "inbox_match_suggestion" ADD COLUMN "signal_details" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "inbox_match_suggestion" ADD COLUMN "thresholds" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "inbox_match_suggestion" ADD COLUMN "calibration" jsonb;--> statement-breakpoint
ALTER TABLE "inbox_match_suggestion" ADD COLUMN "match_type" text DEFAULT 'suggested' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "transaction_attachment_team_document_once_idx" ON "transaction_attachment" USING btree ("team_id","document_id");
