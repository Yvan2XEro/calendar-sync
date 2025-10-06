CREATE TYPE "public"."event_automation_type" AS ENUM('calendar_sync', 'digest_refresh');--> statement-breakpoint
CREATE TYPE "public"."event_automation_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "event_automation_job" (
        "id" text PRIMARY KEY NOT NULL,
        "event_id" text NOT NULL,
        "type" "event_automation_type" NOT NULL,
        "status" "event_automation_status" DEFAULT 'pending' NOT NULL,
        "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
        "attempts" integer DEFAULT 0 NOT NULL,
        "last_error" text,
        "scheduled_at" timestamp with time zone DEFAULT now() NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "event_automation_job_event_id_type_status_unique" ON "event_automation_job" USING btree ("event_id", "type", "status");--> statement-breakpoint
CREATE INDEX "event_automation_job_event_idx" ON "event_automation_job" USING btree ("event_id", "created_at" DESC);--> statement-breakpoint
ALTER TABLE "event_automation_job" ADD CONSTRAINT "event_automation_job_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
