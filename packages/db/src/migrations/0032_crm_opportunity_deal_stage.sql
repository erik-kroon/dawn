ALTER TABLE "crm_opportunity"
  ADD COLUMN IF NOT EXISTS "stage" text DEFAULT 'new' NOT NULL;

CREATE INDEX IF NOT EXISTS "crm_opportunity_team_stage_idx"
  ON "crm_opportunity" ("team_id", "stage");
