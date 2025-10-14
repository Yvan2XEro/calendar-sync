CREATE TYPE "public"."event_calendar_sync_status" AS ENUM('pending', 'synced', 'failed');--> statement-breakpoint
CREATE TABLE "event_calendar_sync" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"member_id" text,
	"google_event_id" text,
	"status" "event_calendar_sync_status" DEFAULT 'pending' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_calendar_sync" ADD CONSTRAINT "event_calendar_sync_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_calendar_sync" ADD CONSTRAINT "event_calendar_sync_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_calendar_sync_event_member_unique" ON "event_calendar_sync" USING btree ("event_id","member_id");--> statement-breakpoint
CREATE INDEX "event_calendar_sync_member_idx" ON "event_calendar_sync" USING btree ("member_id");--> statement-breakpoint
ALTER TABLE "event" DROP COLUMN "google_calendar_event_id";