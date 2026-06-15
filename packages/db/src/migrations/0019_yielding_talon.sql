ALTER TABLE "bank_connection" ADD COLUMN "token_ciphertext" text;--> statement-breakpoint
ALTER TABLE "bank_connection" ADD COLUMN "token_key_id" text;--> statement-breakpoint
ALTER TABLE "bank_connection" ADD COLUMN "token_last_four" text;