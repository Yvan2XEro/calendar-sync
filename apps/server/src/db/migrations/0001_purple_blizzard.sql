DROP TABLE IF EXISTS "provider_secret" CASCADE;

ALTER TABLE "organization_provider"
  DROP COLUMN IF EXISTS "config",
  DROP COLUMN IF EXISTS "secrets_ref",
  DROP COLUMN IF EXISTS "status",
  DROP COLUMN IF EXISTS "imap_test_ok",
  DROP COLUMN IF EXISTS "last_tested_at",
  DROP COLUMN IF EXISTS "created_at",
  DROP COLUMN IF EXISTS "updated_at";

ALTER TABLE "provider"
  ADD COLUMN IF NOT EXISTS "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  ADD COLUMN IF NOT EXISTS "status" "provider_status" DEFAULT 'draft' NOT NULL,
  ADD COLUMN IF NOT EXISTS "last_tested_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  DROP COLUMN IF EXISTS "secrets_ref";

UPDATE "provider"
  SET "config" = '{}'::jsonb
  WHERE "config" IS NULL;

ALTER TABLE "provider"
  ALTER COLUMN "config" SET DEFAULT '{}'::jsonb,
  ALTER COLUMN "config" SET NOT NULL;

UPDATE "provider"
  SET "created_at" = now()
  WHERE "created_at" IS NULL;

ALTER TABLE "provider"
  ALTER COLUMN "created_at" SET DEFAULT now(),
  ALTER COLUMN "created_at" SET NOT NULL;

UPDATE "provider"
  SET "updated_at" = now()
  WHERE "updated_at" IS NULL;

ALTER TABLE "provider"
  ALTER COLUMN "updated_at" SET DEFAULT now(),
  ALTER COLUMN "updated_at" SET NOT NULL;
