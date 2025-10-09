CREATE TYPE "public"."event_attendee_status" AS ENUM('reserved', 'registered', 'checked_in', 'cancelled', 'waitlisted');--> statement-breakpoint
CREATE TYPE "public"."calendar_connection_status" AS ENUM('pending', 'connected', 'error', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."calendar_provider_type" AS ENUM('google', 'outlook');--> statement-breakpoint
CREATE TYPE "public"."digest_segment" AS ENUM('joined', 'discover');--> statement-breakpoint
CREATE TYPE "public"."event_automation_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."event_automation_type" AS ENUM('calendar_sync', 'digest_refresh');--> statement-breakpoint
CREATE TYPE "public"."event_email_status" AS ENUM('pending', 'sending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."event_email_type" AS ENUM('confirmation', 'reminder', 'update', 'cancellation', 'follow_up', 'announcement', 'digest');--> statement-breakpoint
CREATE TYPE "public"."event_order_status" AS ENUM('pending_payment', 'requires_action', 'confirmed', 'cancelled', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."provider_status" AS ENUM('draft', 'beta', 'active', 'deprecated');--> statement-breakpoint
CREATE TYPE "public"."event_ticket_type_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."event_waitlist_status" AS ENUM('active', 'invited', 'converted', 'removed');--> statement-breakpoint
CREATE TABLE "event_attendee" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"order_id" text,
	"order_item_id" text,
	"ticket_type_id" text,
	"profile_id" text,
	"waitlist_entry_id" text,
	"status" "event_attendee_status" DEFAULT 'reserved' NOT NULL,
	"confirmation_code" text NOT NULL,
	"check_in_at" timestamp with time zone,
	"no_show" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_attendee_profile" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"email" text NOT NULL,
	"display_name" text,
	"phone" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_connection" (
	"id" text PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
	"provider_type" "calendar_provider_type" NOT NULL,
	"external_account_id" text,
	"calendar_id" text,
	"access_token" text,
	"refresh_token" text,
	"token_expires_at" timestamp with time zone,
	"scope" text,
	"state_token" text,
	"status" "calendar_connection_status" DEFAULT 'pending' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"failure_reason" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "digest_schedule" (
	"id" text PRIMARY KEY NOT NULL,
	"segment" "digest_segment" NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"cadence_hours" integer DEFAULT 168 NOT NULL,
	"lookahead_days" integer DEFAULT 14 NOT NULL,
	"last_sent_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"provider_id" text NOT NULL,
	"organization_id" text,
	"flag_id" text,
	"title" text NOT NULL,
	"description" text,
	"location" text,
	"url" text,
	"hero_media" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"landing_page" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone,
	"is_all_day" boolean DEFAULT false NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"external_id" text,
	"google_calendar_event_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "event_status" DEFAULT 'pending' NOT NULL,
	"priority" integer DEFAULT 3 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_automation_job" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"type" "event_automation_type" NOT NULL,
	"status" "event_automation_status" DEFAULT 'pending' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"scheduled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_email_delivery" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"order_id" text,
	"attendee_id" text,
	"recipient_email" text NOT NULL,
	"recipient_name" text,
	"type" "event_email_type" NOT NULL,
	"status" "event_email_status" DEFAULT 'pending' NOT NULL,
	"subject" text,
	"reply_to" text,
	"provider_message_id" text,
	"last_error" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"scheduled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_order" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"organization_id" text,
	"purchaser_profile_id" text,
	"status" "event_order_status" DEFAULT 'pending_payment' NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"subtotal_cents" integer DEFAULT 0 NOT NULL,
	"fee_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"payment_provider" text,
	"payment_intent_id" text,
	"external_payment_state" text,
	"contact_email" text NOT NULL,
	"contact_name" text,
	"confirmation_code" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_order_item" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"ticket_type_id" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_amount_cents" integer DEFAULT 0 NOT NULL,
	"subtotal_cents" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flag" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"priority" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flag_priority_range" CHECK ("flag"."priority" >= 1 AND "flag"."priority" <= 5)
);
--> statement-breakpoint
CREATE TABLE "organization_provider" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"provider_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider" (
	"id" text PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "provider_status" DEFAULT 'draft' NOT NULL,
	"trusted" boolean DEFAULT false NOT NULL,
	"last_tested_at" text
);
--> statement-breakpoint
CREATE TABLE "event_ticket_type" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"capacity" integer,
	"max_per_order" integer,
	"sales_start_at" timestamp with time zone,
	"sales_end_at" timestamp with time zone,
	"status" "event_ticket_type_status" DEFAULT 'active' NOT NULL,
	"is_waitlist_enabled" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_waitlist_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"ticket_type_id" text,
	"profile_id" text NOT NULL,
	"status" "event_waitlist_status" DEFAULT 'active' NOT NULL,
	"position" integer,
	"promoted_order_id" text,
	"promotion_expires_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worker_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"level" text NOT NULL,
	"provider_id" text,
	"session_id" text,
	"msg" text NOT NULL,
	"data" jsonb
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"inviter_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"role" text NOT NULL,
	"status" text NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"metadata" text,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"impersonated_by" text,
	"user_id" text NOT NULL,
	"active_organization_id" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean NOT NULL,
	"image" text,
	"role" text,
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "event_attendee" ADD CONSTRAINT "event_attendee_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_attendee" ADD CONSTRAINT "event_attendee_order_id_event_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."event_order"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_attendee" ADD CONSTRAINT "event_attendee_order_item_id_event_order_item_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."event_order_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_attendee" ADD CONSTRAINT "event_attendee_ticket_type_id_event_ticket_type_id_fk" FOREIGN KEY ("ticket_type_id") REFERENCES "public"."event_ticket_type"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_attendee" ADD CONSTRAINT "event_attendee_profile_id_event_attendee_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."event_attendee_profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_attendee" ADD CONSTRAINT "event_attendee_waitlist_entry_id_event_waitlist_entry_id_fk" FOREIGN KEY ("waitlist_entry_id") REFERENCES "public"."event_waitlist_entry"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_attendee_profile" ADD CONSTRAINT "event_attendee_profile_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_connection" ADD CONSTRAINT "calendar_connection_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_provider_id_provider_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."provider"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_flag_id_flag_id_fk" FOREIGN KEY ("flag_id") REFERENCES "public"."flag"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_automation_job" ADD CONSTRAINT "event_automation_job_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_email_delivery" ADD CONSTRAINT "event_email_delivery_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_email_delivery" ADD CONSTRAINT "event_email_delivery_order_id_event_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."event_order"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_email_delivery" ADD CONSTRAINT "event_email_delivery_attendee_id_event_attendee_id_fk" FOREIGN KEY ("attendee_id") REFERENCES "public"."event_attendee"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_order" ADD CONSTRAINT "event_order_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_order" ADD CONSTRAINT "event_order_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_order" ADD CONSTRAINT "event_order_purchaser_profile_id_event_attendee_profile_id_fk" FOREIGN KEY ("purchaser_profile_id") REFERENCES "public"."event_attendee_profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_order_item" ADD CONSTRAINT "event_order_item_order_id_event_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."event_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_order_item" ADD CONSTRAINT "event_order_item_ticket_type_id_event_ticket_type_id_fk" FOREIGN KEY ("ticket_type_id") REFERENCES "public"."event_ticket_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_provider" ADD CONSTRAINT "organization_provider_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_provider" ADD CONSTRAINT "organization_provider_provider_id_provider_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."provider"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_ticket_type" ADD CONSTRAINT "event_ticket_type_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_waitlist_entry" ADD CONSTRAINT "event_waitlist_entry_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_waitlist_entry" ADD CONSTRAINT "event_waitlist_entry_ticket_type_id_event_ticket_type_id_fk" FOREIGN KEY ("ticket_type_id") REFERENCES "public"."event_ticket_type"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_waitlist_entry" ADD CONSTRAINT "event_waitlist_entry_profile_id_event_attendee_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."event_attendee_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_waitlist_entry" ADD CONSTRAINT "event_waitlist_entry_promoted_order_id_event_order_id_fk" FOREIGN KEY ("promoted_order_id") REFERENCES "public"."event_order"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_impersonated_by_user_id_fk" FOREIGN KEY ("impersonated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_active_organization_id_organization_id_fk" FOREIGN KEY ("active_organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_attendee_confirmation_code_unique" ON "event_attendee" USING btree ("confirmation_code");--> statement-breakpoint
CREATE INDEX "event_attendee_event_id_status_idx" ON "event_attendee" USING btree ("event_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "event_attendee_profile_organization_id_email_unique" ON "event_attendee_profile" USING btree ("organization_id","email");--> statement-breakpoint
CREATE INDEX "event_attendee_profile_email_idx" ON "event_attendee_profile" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_connection_member_provider_unique" ON "calendar_connection" USING btree ("member_id","provider_type");--> statement-breakpoint
CREATE UNIQUE INDEX "digest_schedule_segment_unique" ON "digest_schedule" USING btree ("segment");--> statement-breakpoint
CREATE UNIQUE INDEX "event_slug_unique" ON "event" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "event_provider_id_external_id_unique" ON "event" USING btree ("provider_id","external_id");--> statement-breakpoint
CREATE INDEX "status_start_at_idx" ON "event" USING btree ("status","start_at" desc);--> statement-breakpoint
CREATE INDEX "status_created_at_idx" ON "event" USING btree ("status","created_at" desc);--> statement-breakpoint
CREATE INDEX "provider_start_at_idx" ON "event" USING btree ("provider_id","start_at" desc);--> statement-breakpoint
CREATE INDEX "provider_created_at_idx" ON "event" USING btree ("provider_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "provider_status_start_at_idx" ON "event" USING btree ("provider_id","status","start_at" desc);--> statement-breakpoint
CREATE INDEX "provider_status_created_at_idx" ON "event" USING btree ("provider_id","status","created_at" desc);--> statement-breakpoint
CREATE INDEX "event_organization_idx" ON "event" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_automation_job_event_id_type_status_unique" ON "event_automation_job" USING btree ("event_id","type","status");--> statement-breakpoint
CREATE INDEX "event_automation_job_event_idx" ON "event_automation_job" USING btree ("event_id","created_at");--> statement-breakpoint
CREATE INDEX "event_email_delivery_status_scheduled_idx" ON "event_email_delivery" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "event_email_delivery_event_type_recipient_idx" ON "event_email_delivery" USING btree ("event_id","type","recipient_email");--> statement-breakpoint
CREATE UNIQUE INDEX "event_order_confirmation_code_unique" ON "event_order" USING btree ("confirmation_code");--> statement-breakpoint
CREATE INDEX "event_order_event_id_status_idx" ON "event_order" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "event_order_payment_intent_idx" ON "event_order" USING btree ("payment_intent_id");--> statement-breakpoint
CREATE INDEX "event_order_created_at_idx" ON "event_order" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "event_order_item_order_id_ticket_type_id_unique" ON "event_order_item" USING btree ("order_id","ticket_type_id");--> statement-breakpoint
CREATE UNIQUE INDEX "flag_slug_unique" ON "flag" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_provider_organization_id_provider_id_unique" ON "organization_provider" USING btree ("organization_id","provider_id");--> statement-breakpoint
CREATE INDEX "event_ticket_type_event_id_status_idx" ON "event_ticket_type" USING btree ("event_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "event_waitlist_event_id_ticket_type_id_profile_id_unique" ON "event_waitlist_entry" USING btree ("event_id","ticket_type_id","profile_id");--> statement-breakpoint
CREATE INDEX "event_waitlist_status_idx" ON "event_waitlist_entry" USING btree ("status");