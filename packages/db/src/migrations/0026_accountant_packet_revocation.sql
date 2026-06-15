ALTER TABLE "accountant_packet_export"
  ADD COLUMN "status" text DEFAULT 'available' NOT NULL,
  ADD COLUMN "revoked_at" timestamp,
  ADD COLUMN "revoked_by_actor_id" text,
  ADD COLUMN "revoke_reason" text;
