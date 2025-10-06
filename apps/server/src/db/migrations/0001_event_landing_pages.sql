ALTER TABLE "event" ADD COLUMN IF NOT EXISTS "slug" text;
ALTER TABLE "event" ADD COLUMN IF NOT EXISTS "hero_media" jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "event" ADD COLUMN IF NOT EXISTS "landing_page" jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE "event"
SET "slug" = CONCAT('event-', "id")
WHERE "slug" IS NULL OR LENGTH(TRIM("slug")) = 0;

ALTER TABLE "event" ALTER COLUMN "slug" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "event_slug_unique" ON "event" ("slug");
