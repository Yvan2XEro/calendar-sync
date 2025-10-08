ALTER TABLE "public"."calendar_connection"
        ADD COLUMN "member_id" text;

UPDATE "public"."calendar_connection" AS cc
SET "member_id" = m."id"
FROM "public"."member" AS m
WHERE
        m."user_id" = cc."user_id"
        AND m."organization_id" = cc."organization_id";

ALTER TABLE "public"."calendar_connection"
        ALTER COLUMN "member_id" SET NOT NULL;

ALTER TABLE "public"."calendar_connection"
        ADD CONSTRAINT "calendar_connection_member_id_member_id_fk"
                FOREIGN KEY ("member_id")
                REFERENCES "public"."member"("id")
                ON DELETE CASCADE;

DROP INDEX IF EXISTS "calendar_connection_user_org_provider_unique";

CREATE UNIQUE INDEX "calendar_connection_member_org_provider_unique"
        ON "public"."calendar_connection" ("member_id", "organization_id", "provider_type");

ALTER TABLE "public"."calendar_connection"
        DROP COLUMN "user_id";
