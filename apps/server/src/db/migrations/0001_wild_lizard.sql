DROP TABLE "provider_secret" CASCADE;--> statement-breakpoint
ALTER TABLE "organization_provider" DROP COLUMN "config";--> statement-breakpoint
ALTER TABLE "organization_provider" DROP COLUMN "secrets_ref";--> statement-breakpoint
ALTER TABLE "organization_provider" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "organization_provider" DROP COLUMN "imap_test_ok";--> statement-breakpoint
ALTER TABLE "organization_provider" DROP COLUMN "last_tested_at";--> statement-breakpoint
ALTER TABLE "organization_provider" DROP COLUMN "created_at";--> statement-breakpoint
ALTER TABLE "organization_provider" DROP COLUMN "updated_at";--> statement-breakpoint
ALTER TABLE "provider" DROP COLUMN "config";--> statement-breakpoint
ALTER TABLE "provider" DROP COLUMN "secrets_ref";--> statement-breakpoint
ALTER TABLE "provider" DROP COLUMN "last_tested_at";--> statement-breakpoint
ALTER TABLE "provider" DROP COLUMN "created_at";--> statement-breakpoint
ALTER TABLE "provider" DROP COLUMN "updated_at";