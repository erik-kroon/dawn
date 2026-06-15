CREATE TABLE "business_insight" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"severity" text NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"source_refs" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "business_insight" ADD CONSTRAINT "business_insight_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "business_insight_team_period_idx" ON "business_insight" USING btree ("team_id","period_start","period_end");--> statement-breakpoint
CREATE INDEX "business_insight_team_created_idx" ON "business_insight" USING btree ("team_id","created_at");