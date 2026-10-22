CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"actor_id" text NOT NULL,
	"kind" text NOT NULL,
	"task_id" text,
	"text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"author_id" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"requires_ack" boolean DEFAULT false NOT NULL,
	"ack_due_at" timestamp with time zone,
	"ack_by" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read_by" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"person_id" text NOT NULL,
	"date" text NOT NULL,
	"check_in" timestamp with time zone,
	"check_out" timestamp with time zone,
	"break_min" integer DEFAULT 0 NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channels" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"unit_type" text NOT NULL,
	"unit_id" text NOT NULL,
	"description" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_stats" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"person_id" text NOT NULL,
	"date" text NOT NULL,
	"assigned" integer NOT NULL,
	"approved" integer NOT NULL,
	"on_time" integer NOT NULL,
	"ack_minutes" integer NOT NULL,
	"reminders_sent" integer NOT NULL,
	"ack_first" integer NOT NULL,
	"submissions" integer NOT NULL,
	"rejections" integer NOT NULL,
	"est_hours" double precision NOT NULL,
	"actual_hours" double precision NOT NULL,
	"escalations" integer NOT NULL,
	"review_hours" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deadline_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"task_id" text NOT NULL,
	"by_id" text NOT NULL,
	"new_due_at" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"head_id" text NOT NULL,
	"description" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"person_id" text NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"healthy" boolean DEFAULT true NOT NULL,
	"endpoint" text,
	"p256dh" text,
	"auth" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "devices_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"member_ids" text[] DEFAULT '{}' NOT NULL,
	"owner_id" text NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "leaves" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"person_id" text NOT NULL,
	"from" text NOT NULL,
	"to" text NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"recipient_id" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"task_id" text,
	"read" boolean DEFAULT false NOT NULL,
	"pushed_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"seen_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"timezone" text DEFAULT 'Asia/Karachi' NOT NULL,
	"settings" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"initials" text NOT NULL,
	"role" text NOT NULL,
	"title" text NOT NULL,
	"department_id" text DEFAULT '' NOT NULL,
	"team_id" text DEFAULT '' NOT NULL,
	"hue" integer NOT NULL,
	"capacity_hours" double precision DEFAULT 8 NOT NULL,
	"email" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"work_type" text DEFAULT 'desk' NOT NULL,
	"on_leave" boolean DEFAULT false NOT NULL,
	"backup_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"prefs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"day_order" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "people_userId_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"hue" integer NOT NULL,
	"lead_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"from_id" text NOT NULL,
	"to_id" text NOT NULL,
	"task_id" text,
	"body" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"answer" text,
	"answered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"assignee_id" text NOT NULL,
	"created_by_id" text NOT NULL,
	"reviewer_id" text NOT NULL,
	"project_id" text,
	"department_id" text NOT NULL,
	"priority" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"start_at" timestamp with time zone,
	"due_at" timestamp with time zone NOT NULL,
	"estimate_hours" double precision DEFAULT 1 NOT NULL,
	"requires_approval" boolean DEFAULT true NOT NULL,
	"requires_proof" boolean DEFAULT false NOT NULL,
	"requires_result" boolean DEFAULT false NOT NULL,
	"reminder" jsonb NOT NULL,
	"reminders_sent" integer DEFAULT 0 NOT NULL,
	"reminders_ignored" integer DEFAULT 0 NOT NULL,
	"last_reminder_at" timestamp with time zone,
	"escalation_level" integer DEFAULT 0 NOT NULL,
	"subtasks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"comments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"watcher_ids" text[] DEFAULT '{}' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"blocked_reason" text,
	"blocked_owner_id" text,
	"blocked_at" timestamp with time zone,
	"blocked_from" text,
	"submitted_at" timestamp with time zone,
	"submission_note" text,
	"rejections" integer DEFAULT 0 NOT NULL,
	"last_rejection_reason" text,
	"acknowledged_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"status_changed_at" timestamp with time zone NOT NULL,
	"snoozed_until" timestamp with time zone,
	"snoozes_today" integer DEFAULT 0 NOT NULL,
	"logged_minutes" integer DEFAULT 0 NOT NULL,
	"recurrence" text,
	"group_claim" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"department_id" text NOT NULL,
	"name" text NOT NULL,
	"lead_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timers" (
	"person_id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"task_id" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_index" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "activity_org_id_at_index" ON "activity" USING btree ("org_id","at");--> statement-breakpoint
CREATE INDEX "activity_task_id_index" ON "activity" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "announcements_org_id_channel_id_index" ON "announcements" USING btree ("org_id","channel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_person_id_date_index" ON "attendance" USING btree ("person_id","date");--> statement-breakpoint
CREATE INDEX "attendance_org_id_date_index" ON "attendance" USING btree ("org_id","date");--> statement-breakpoint
CREATE INDEX "channels_org_id_index" ON "channels" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_stats_person_id_date_index" ON "daily_stats" USING btree ("person_id","date");--> statement-breakpoint
CREATE INDEX "daily_stats_org_id_date_index" ON "daily_stats" USING btree ("org_id","date");--> statement-breakpoint
CREATE INDEX "deadline_requests_org_id_index" ON "deadline_requests" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "departments_org_id_index" ON "departments" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "devices_org_id_index" ON "devices" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "devices_person_id_index" ON "devices" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "groups_org_id_index" ON "groups" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "leaves_org_id_index" ON "leaves" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "notifications_org_id_recipient_id_at_index" ON "notifications" USING btree ("org_id","recipient_id","at");--> statement-breakpoint
CREATE INDEX "people_org_id_index" ON "people" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "projects_org_id_index" ON "projects" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "questions_org_id_index" ON "questions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "session_user_id_index" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tasks_org_id_status_index" ON "tasks" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "tasks_org_id_assignee_id_index" ON "tasks" USING btree ("org_id","assignee_id");--> statement-breakpoint
CREATE INDEX "tasks_org_id_due_at_index" ON "tasks" USING btree ("org_id","due_at");--> statement-breakpoint
CREATE INDEX "teams_org_id_index" ON "teams" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_index" ON "verification" USING btree ("identifier");