ALTER TABLE "event_attendee"
        ADD COLUMN "no_show" boolean NOT NULL DEFAULT false;

ALTER TYPE "event_email_type" ADD VALUE IF NOT EXISTS 'announcement';
