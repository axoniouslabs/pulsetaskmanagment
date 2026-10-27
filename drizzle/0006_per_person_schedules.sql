ALTER TABLE "attendance" ADD COLUMN "breaks" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "departments" ADD COLUMN "settings" jsonb;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "schedule" jsonb;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "secondary_team_ids" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "default_assignee_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "pool" jsonb;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "time_entries" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "idle_flagged_at" timestamp with time zone;