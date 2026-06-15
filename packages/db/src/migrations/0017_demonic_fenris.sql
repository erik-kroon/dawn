CREATE TABLE "api_key" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"scopes" jsonb NOT NULL,
	"created_by_actor_id" text NOT NULL,
	"last_used_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_app" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"name" text NOT NULL,
	"redirect_uris" jsonb NOT NULL,
	"scopes" jsonb NOT NULL,
	"created_by_actor_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_grant" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"app_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"scopes" jsonb NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_delivery" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"subscription_id" text NOT NULL,
	"outbox_event_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"request_payload" jsonb NOT NULL,
	"response_status" integer,
	"response_body" text,
	"error" text,
	"next_attempt_at" timestamp,
	"delivered_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"url" text NOT NULL,
	"event_types" jsonb NOT NULL,
	"signing_secret_hash" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by_actor_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_app" ADD CONSTRAINT "oauth_app_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_grant" ADD CONSTRAINT "oauth_grant_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_grant" ADD CONSTRAINT "oauth_grant_app_id_oauth_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."oauth_app"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_subscription_id_webhook_subscription_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."webhook_subscription"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_outbox_event_id_outbox_event_id_fk" FOREIGN KEY ("outbox_event_id") REFERENCES "public"."outbox_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_subscription" ADD CONSTRAINT "webhook_subscription_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_key_hash_idx" ON "api_key" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "api_key_team_idx" ON "api_key" USING btree ("team_id","created_at");--> statement-breakpoint
CREATE INDEX "oauth_app_team_idx" ON "oauth_app" USING btree ("team_id","created_at");--> statement-breakpoint
CREATE INDEX "oauth_grant_team_idx" ON "oauth_grant" USING btree ("team_id","created_at");--> statement-breakpoint
CREATE INDEX "oauth_grant_app_idx" ON "oauth_grant" USING btree ("app_id","created_at");--> statement-breakpoint
CREATE INDEX "webhook_delivery_subscription_idx" ON "webhook_delivery" USING btree ("subscription_id","created_at");--> statement-breakpoint
CREATE INDEX "webhook_delivery_status_idx" ON "webhook_delivery" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "webhook_delivery_outbox_idx" ON "webhook_delivery" USING btree ("outbox_event_id");--> statement-breakpoint
CREATE INDEX "webhook_subscription_team_status_idx" ON "webhook_subscription" USING btree ("team_id","status");--> statement-breakpoint
CREATE INDEX "webhook_subscription_team_created_idx" ON "webhook_subscription" USING btree ("team_id","created_at");