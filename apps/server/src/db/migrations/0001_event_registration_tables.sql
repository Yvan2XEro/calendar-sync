CREATE TYPE "public"."event_ticket_type_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."event_order_status" AS ENUM('pending_payment', 'requires_action', 'confirmed', 'cancelled', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."event_attendee_status" AS ENUM('reserved', 'registered', 'checked_in', 'cancelled', 'waitlisted');--> statement-breakpoint
CREATE TYPE "public"."event_waitlist_status" AS ENUM('active', 'invited', 'converted', 'removed');--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_organization_idx" ON "event" USING btree ("organization_id");--> statement-breakpoint
CREATE TABLE "event_attendee_profile" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"email" text NOT NULL,
	"display_name" text,
	"phone" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "event_attendee_profile_organization_id_email_unique" ON "event_attendee_profile" USING btree ("organization_id", "email");--> statement-breakpoint
CREATE INDEX "event_attendee_profile_email_idx" ON "event_attendee_profile" USING btree ("email");--> statement-breakpoint
ALTER TABLE "event_attendee_profile" ADD CONSTRAINT "event_attendee_profile_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
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
);--> statement-breakpoint
CREATE INDEX "event_ticket_type_event_id_status_idx" ON "event_ticket_type" USING btree ("event_id", "status");--> statement-breakpoint
ALTER TABLE "event_ticket_type" ADD CONSTRAINT "event_ticket_type_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
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
);--> statement-breakpoint
CREATE UNIQUE INDEX "event_order_confirmation_code_unique" ON "event_order" USING btree ("confirmation_code");--> statement-breakpoint
CREATE INDEX "event_order_event_id_status_idx" ON "event_order" USING btree ("event_id", "status");--> statement-breakpoint
CREATE INDEX "event_order_payment_intent_idx" ON "event_order" USING btree ("payment_intent_id");--> statement-breakpoint
CREATE INDEX "event_order_created_at_idx" ON "event_order" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "event_order" ADD CONSTRAINT "event_order_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_order" ADD CONSTRAINT "event_order_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_order" ADD CONSTRAINT "event_order_purchaser_profile_id_event_attendee_profile_id_fk" FOREIGN KEY ("purchaser_profile_id") REFERENCES "public"."event_attendee_profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
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
);--> statement-breakpoint
CREATE UNIQUE INDEX "event_order_item_order_id_ticket_type_id_unique" ON "event_order_item" USING btree ("order_id", "ticket_type_id");--> statement-breakpoint
ALTER TABLE "event_order_item" ADD CONSTRAINT "event_order_item_order_id_event_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."event_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_order_item" ADD CONSTRAINT "event_order_item_ticket_type_id_event_ticket_type_id_fk" FOREIGN KEY ("ticket_type_id") REFERENCES "public"."event_ticket_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
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
);--> statement-breakpoint
CREATE UNIQUE INDEX "event_waitlist_event_id_ticket_type_id_profile_id_unique" ON "event_waitlist_entry" USING btree ("event_id", "ticket_type_id", "profile_id");--> statement-breakpoint
CREATE INDEX "event_waitlist_status_idx" ON "event_waitlist_entry" USING btree ("status");--> statement-breakpoint
ALTER TABLE "event_waitlist_entry" ADD CONSTRAINT "event_waitlist_entry_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_waitlist_entry" ADD CONSTRAINT "event_waitlist_entry_ticket_type_id_event_ticket_type_id_fk" FOREIGN KEY ("ticket_type_id") REFERENCES "public"."event_ticket_type"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_waitlist_entry" ADD CONSTRAINT "event_waitlist_entry_profile_id_event_attendee_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."event_attendee_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_waitlist_entry" ADD CONSTRAINT "event_waitlist_entry_promoted_order_id_event_order_id_fk" FOREIGN KEY ("promoted_order_id") REFERENCES "public"."event_order"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
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
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "event_attendee_confirmation_code_unique" ON "event_attendee" USING btree ("confirmation_code");--> statement-breakpoint
CREATE INDEX "event_attendee_event_id_status_idx" ON "event_attendee" USING btree ("event_id", "status");--> statement-breakpoint
ALTER TABLE "event_attendee" ADD CONSTRAINT "event_attendee_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_attendee" ADD CONSTRAINT "event_attendee_order_id_event_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."event_order"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_attendee" ADD CONSTRAINT "event_attendee_order_item_id_event_order_item_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."event_order_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_attendee" ADD CONSTRAINT "event_attendee_ticket_type_id_event_ticket_type_id_fk" FOREIGN KEY ("ticket_type_id") REFERENCES "public"."event_ticket_type"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_attendee" ADD CONSTRAINT "event_attendee_profile_id_event_attendee_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."event_attendee_profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_attendee" ADD CONSTRAINT "event_attendee_waitlist_entry_id_event_waitlist_entry_id_fk" FOREIGN KEY ("waitlist_entry_id") REFERENCES "public"."event_waitlist_entry"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
