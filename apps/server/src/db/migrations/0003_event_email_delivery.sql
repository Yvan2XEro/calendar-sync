CREATE TYPE "event_email_type" AS ENUM ('confirmation', 'reminder', 'update', 'cancellation', 'follow_up');

CREATE TYPE "event_email_status" AS ENUM ('pending', 'sending', 'sent', 'failed');

CREATE TABLE "event_email_delivery" (
    "id" text PRIMARY KEY,
    "event_id" text NOT NULL,
    "order_id" text,
    "attendee_id" text,
    "recipient_email" text NOT NULL,
    "recipient_name" text,
    "type" "event_email_type" NOT NULL,
    "status" "event_email_status" NOT NULL DEFAULT 'pending',
    "subject" text,
    "reply_to" text,
    "provider_message_id" text,
    "last_error" text,
    "attempt_count" integer NOT NULL DEFAULT 0,
    "scheduled_at" timestamp with time zone NOT NULL DEFAULT now(),
    "sent_at" timestamp with time zone,
    "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "event_email_delivery_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE cascade,
    CONSTRAINT "event_email_delivery_order_id_event_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "event_order"("id") ON DELETE set null,
    CONSTRAINT "event_email_delivery_attendee_id_event_attendee_id_fk" FOREIGN KEY ("attendee_id") REFERENCES "event_attendee"("id") ON DELETE set null
);

CREATE INDEX "event_email_delivery_status_scheduled_idx" ON "event_email_delivery" ("status", "scheduled_at");

CREATE INDEX "event_email_delivery_event_type_recipient_idx" ON "event_email_delivery" ("event_id", "type", "recipient_email");
