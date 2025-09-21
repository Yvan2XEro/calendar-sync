CREATE TABLE "event" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"flag_id" text,
	"title" text NOT NULL,
	"description" text,
	"location" text,
	"url" text,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone,
	"is_all_day" boolean DEFAULT false NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"priority" integer DEFAULT 3 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_provider_id_provider_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."provider"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_flag_id_flag_id_fk" FOREIGN KEY ("flag_id") REFERENCES "public"."flag"("id") ON DELETE set null ON UPDATE no action;