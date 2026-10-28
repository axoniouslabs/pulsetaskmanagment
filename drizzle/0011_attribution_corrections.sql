ALTER TABLE "activity" ADD COLUMN "about_id" text;--> statement-breakpoint
ALTER TABLE "attendance" ADD COLUMN "corrected" jsonb;--> statement-breakpoint
ALTER TABLE "daily_stats" ADD COLUMN "rework_hours" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_stats" ADD COLUMN "reviews_done" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_stats" ADD COLUMN "review_given_hours" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_stats" ADD COLUMN "blocking_hours" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "departments" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
-- every department has a notices channel (spec §13)
INSERT INTO "channels" ("id", "org_id", "name", "kind", "unit_type", "unit_id", "description")
SELECT 'cn_' || d."id", d."org_id", d."name" || ' notices', 'announcement', 'department', d."id", 'Notices for everyone in ' || d."name"
FROM "departments" d WHERE NOT EXISTS (SELECT 1 FROM "channels" c WHERE c."unit_type" = 'department' AND c."unit_id" = d."id" AND c."kind" = 'announcement');
