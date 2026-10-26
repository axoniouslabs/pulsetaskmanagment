CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"amount" integer NOT NULL,
	"method" text NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"months" integer NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	"period_from" timestamp with time zone NOT NULL,
	"period_to" timestamp with time zone NOT NULL,
	"recorded_by" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"max_users" integer,
	"price_monthly" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "plan_id" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "contact_phone" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "notes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "platform_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_org_id_index" ON "payments" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "payments_paid_at_index" ON "payments" USING btree ("paid_at");--> statement-breakpoint
-- starting plans by team size; prices are set from the admin panel
INSERT INTO "plans" ("id", "name", "max_users", "price_monthly", "sort_order") VALUES
	('plan_starter', 'Starter', 10, NULL, 1),
	('plan_team', 'Team', 25, NULL, 2),
	('plan_business', 'Business', 50, NULL, 3),
	('plan_unlimited', 'Unlimited', NULL, NULL, 4)
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
-- whoever already runs the first real company on this server becomes the Pulse administrator
UPDATE "users" SET "platform_admin" = true
WHERE NOT EXISTS (SELECT 1 FROM "users" WHERE "platform_admin" = true)
	AND "id" = (
		SELECT p."user_id" FROM "people" p JOIN "organizations" o ON o."id" = p."org_id"
		WHERE p."role" = 'owner' AND p."active" = true AND p."user_id" IS NOT NULL AND o."id" <> 'org_crescent'
		ORDER BY o."created_at", p."created_at" LIMIT 1
	);
