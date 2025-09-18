ALTER TABLE "organization_provider"
  ADD COLUMN "config" jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN "secrets_ref" text,
  ADD COLUMN "status" text NOT NULL DEFAULT 'pending',
  ADD COLUMN "imap_test_ok" boolean NOT NULL DEFAULT false,
  ADD COLUMN "last_tested_at" timestamp;

CREATE TABLE "provider_secret" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE cascade,
  "data" jsonb NOT NULL,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);
