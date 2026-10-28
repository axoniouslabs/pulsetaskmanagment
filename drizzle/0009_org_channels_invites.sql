CREATE TABLE "backups" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"size" integer NOT NULL,
	"data" "bytea" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"code" text NOT NULL,
	"email" text,
	"role" text DEFAULT 'employee' NOT NULL,
	"team_id" text DEFAULT '' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"work_type" text DEFAULT 'desk' NOT NULL,
	"created_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"used_by_id" text,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "announcements" ADD COLUMN "replies" jsonb;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "member_ids" text[];--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "created_by_id" text;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "pins" jsonb;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "channel_id" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "availability" jsonb;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "contact_purged_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "backups_org_id_at_index" ON "backups" USING btree ("org_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "invites_code_index" ON "invites" USING btree ("code");--> statement-breakpoint
CREATE INDEX "invites_org_id_index" ON "invites" USING btree ("org_id");--> statement-breakpoint
-- every unit has its own channels (spec §13): backfill the ones made before this rule
INSERT INTO "channels" ("id", "org_id", "name", "kind", "unit_type", "unit_id", "description")
SELECT 'c_' || t."id", t."org_id", t."name", 'open', 'team', t."id", 'Day-to-day coordination for ' || t."name"
FROM "teams" t WHERE NOT EXISTS (SELECT 1 FROM "channels" c WHERE c."unit_type" = 'team' AND c."unit_id" = t."id" AND c."kind" = 'open');--> statement-breakpoint
INSERT INTO "channels" ("id", "org_id", "name", "kind", "unit_type", "unit_id", "description")
SELECT 'cf_' || t."id", t."org_id", t."name" || ' task feed', 'task_feed', 'team', t."id", 'Every task event in ' || t."name" || ', posted by Pulse'
FROM "teams" t WHERE NOT EXISTS (SELECT 1 FROM "channels" c WHERE c."unit_type" = 'team' AND c."unit_id" = t."id" AND c."kind" = 'task_feed');--> statement-breakpoint
INSERT INTO "channels" ("id", "org_id", "name", "kind", "unit_type", "unit_id", "description")
SELECT 'c_' || d."id", d."org_id", d."name", 'open', 'department', d."id", 'Day-to-day coordination for ' || d."name"
FROM "departments" d WHERE NOT EXISTS (SELECT 1 FROM "channels" c WHERE c."unit_type" = 'department' AND c."unit_id" = d."id" AND c."kind" = 'open');--> statement-breakpoint
INSERT INTO "channels" ("id", "org_id", "name", "kind", "unit_type", "unit_id", "description")
SELECT 'cf_' || d."id", d."org_id", d."name" || ' task feed', 'task_feed', 'department', d."id", 'Every task event in ' || d."name" || ', posted by Pulse'
FROM "departments" d WHERE NOT EXISTS (SELECT 1 FROM "channels" c WHERE c."unit_type" = 'department' AND c."unit_id" = d."id" AND c."kind" = 'task_feed');--> statement-breakpoint
INSERT INTO "channels" ("id", "org_id", "name", "kind", "unit_type", "unit_id", "description")
SELECT 'c_' || g."id", g."org_id", g."name", 'open', 'group', g."id", g."description"
FROM "groups" g WHERE NOT EXISTS (SELECT 1 FROM "channels" c WHERE c."unit_type" = 'group' AND c."unit_id" = g."id");
