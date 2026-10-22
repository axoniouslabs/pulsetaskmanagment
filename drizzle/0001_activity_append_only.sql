-- The activity log is the product's evidence. Nobody, including the owner and
-- the application itself, may change or delete a row once written.
CREATE OR REPLACE FUNCTION pulse_activity_is_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'activity is append-only: % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER activity_no_update BEFORE UPDATE ON "activity"
  FOR EACH ROW EXECUTE FUNCTION pulse_activity_is_append_only();
--> statement-breakpoint
CREATE TRIGGER activity_no_delete BEFORE DELETE ON "activity"
  FOR EACH ROW EXECUTE FUNCTION pulse_activity_is_append_only();
