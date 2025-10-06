ALTER TABLE "organization_provider"
        ADD COLUMN "config" jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "event"
        ADD COLUMN "google_calendar_event_id" text;
