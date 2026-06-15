ALTER TABLE "transaction" ADD COLUMN "transfer_group_id" text;--> statement-breakpoint
CREATE INDEX "transaction_team_transfer_group_idx" ON "transaction" USING btree ("team_id","transfer_group_id");