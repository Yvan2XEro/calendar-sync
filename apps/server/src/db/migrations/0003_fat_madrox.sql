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
CREATE UNIQUE INDEX "flag_slug_unique" ON "flag" USING btree ("slug");