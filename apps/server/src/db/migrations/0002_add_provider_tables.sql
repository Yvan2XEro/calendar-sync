CREATE TABLE "provider" (
        "id" text PRIMARY KEY NOT NULL,
        "category" text NOT NULL,
        "name" text NOT NULL,
        "description" text,
        "created_at" timestamp NOT NULL,
        "updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_provider" (
        "id" text PRIMARY KEY NOT NULL,
        "organization_id" text NOT NULL,
        "provider_id" text NOT NULL,
        "created_at" timestamp NOT NULL,
        "updated_at" timestamp NOT NULL,
        CONSTRAINT "organization_provider_organization_id_provider_id_unique" UNIQUE("organization_id","provider_id")
);
--> statement-breakpoint
ALTER TABLE "organization_provider" ADD CONSTRAINT "organization_provider_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "organization_provider" ADD CONSTRAINT "organization_provider_provider_id_provider_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."provider"("id") ON DELETE cascade ON UPDATE no action;
