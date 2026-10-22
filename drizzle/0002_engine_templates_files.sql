CREATE TABLE "files" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"task_id" text,
	"by_id" text NOT NULL,
	"name" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"data" "bytea",
	"blob_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"created_by_id" text NOT NULL,
	"input" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "engine" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "recurrence_next_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "reminders_today" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "depends_on" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
CREATE INDEX "files_org_id_index" ON "files" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "files_task_id_index" ON "files" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "templates_org_id_index" ON "templates" USING btree ("org_id");