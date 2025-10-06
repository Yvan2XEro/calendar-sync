ALTER TYPE "public"."event_email_type" ADD VALUE IF NOT EXISTS 'digest';

CREATE TYPE "public"."digest_segment" AS ENUM ('joined', 'discover');

CREATE TABLE "public"."digest_schedule" (
    "id" text PRIMARY KEY NOT NULL,
    "segment" "public"."digest_segment" NOT NULL,
    "enabled" boolean NOT NULL DEFAULT false,
    "cadence_hours" integer NOT NULL DEFAULT 168,
    "lookahead_days" integer NOT NULL DEFAULT 14,
    "last_sent_at" timestamp with time zone,
    "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "digest_schedule_segment_unique" ON "public"."digest_schedule" ("segment");
