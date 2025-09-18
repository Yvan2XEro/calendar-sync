CREATE TYPE "public"."provider_status" AS ENUM('draft', 'beta', 'active', 'deprecated');--> statement-breakpoint
ALTER TABLE "provider" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "provider" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "provider" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "provider" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "provider" ADD COLUMN "config" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "provider" ADD COLUMN "secrets_ref" text;--> statement-breakpoint
ALTER TABLE "provider" ADD COLUMN "status" "provider_status" DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "provider" ADD COLUMN "last_tested_at" timestamp with time zone;