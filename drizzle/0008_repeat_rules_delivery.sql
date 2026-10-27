ALTER TABLE "notifications" ADD COLUMN "failed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "repeat" jsonb;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "repeat_index" integer;--> statement-breakpoint
-- Data retention (spec §12/§21): the activity log stays append-only. The one
-- exception is the retention job, which marks its own transaction and may only
-- remove rows older than the 12-month minimum. Nothing can ever be edited.
CREATE OR REPLACE FUNCTION pulse_activity_is_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND current_setting('pulse.retention_purge', true) = 'on'
     AND OLD.at < now() - interval '12 months' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'activity is append-only: % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;
