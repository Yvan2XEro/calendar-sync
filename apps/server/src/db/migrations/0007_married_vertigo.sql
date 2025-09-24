CREATE TYPE "public"."event_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "worker_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"level" text NOT NULL,
	"provider_id" text,
	"session_id" text,
	"msg" text NOT NULL,
	"data" jsonb
);
--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "status" "event_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
CREATE INDEX "status_start_at_idx" ON "event" USING btree ("status","start_at" desc);--> statement-breakpoint
CREATE INDEX "status_created_at_idx" ON "event" USING btree ("status","created_at" desc);--> statement-breakpoint
CREATE INDEX "provider_start_at_idx" ON "event" USING btree ("provider_id","start_at" desc);--> statement-breakpoint
CREATE INDEX "provider_created_at_idx" ON "event" USING btree ("provider_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "provider_status_start_at_idx" ON "event" USING btree ("provider_id","status","start_at" desc);--> statement-breakpoint
CREATE INDEX "provider_status_created_at_idx" ON "event" USING btree ("provider_id","status","created_at" desc);