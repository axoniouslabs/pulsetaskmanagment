ALTER TABLE "daily_stats" ADD COLUMN "wait_hours" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_stats" ADD COLUMN "work_hours" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_stats" ADD COLUMN "blocked_hours" double precision DEFAULT 0 NOT NULL;