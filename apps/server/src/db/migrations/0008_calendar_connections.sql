CREATE TYPE "public"."calendar_provider_type" AS ENUM ('google', 'outlook');

CREATE TYPE "public"."calendar_connection_status" AS ENUM (
    'pending',
    'connected',
    'error',
    'revoked'
);

CREATE TABLE "public"."calendar_connection" (
    "id" text PRIMARY KEY NOT NULL,
    "organization_id" text NOT NULL REFERENCES "public"."organization"("id") ON DELETE CASCADE,
    "user_id" text NOT NULL REFERENCES "public"."user"("id") ON DELETE CASCADE,
    "provider_type" "public"."calendar_provider_type" NOT NULL,
    "external_account_id" text,
    "calendar_id" text,
    "access_token" text,
    "refresh_token" text,
    "token_expires_at" timestamp with time zone,
    "scope" text,
    "state_token" text,
    "status" "public"."calendar_connection_status" NOT NULL DEFAULT 'pending',
    "last_synced_at" timestamp with time zone,
    "failure_reason" text,
    "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "calendar_connection_user_org_provider_unique"
    ON "public"."calendar_connection" ("user_id", "organization_id", "provider_type");
