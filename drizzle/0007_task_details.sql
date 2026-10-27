ALTER TABLE "people" ADD COLUMN "saved_views" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "due_all_day" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "overdue_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "progress" integer;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "progress_note" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "progress_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "update_every_days" integer;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "last_update_reminded_at" timestamp with time zone;