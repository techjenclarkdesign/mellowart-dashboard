-- Optional display name for admins (backward compatible — existing rows stay
-- NULL and keep working; only login email + password are required).
ALTER TABLE admins ADD COLUMN name TEXT;

-- Activity log of admin actions on submissions, powering the dashboard feed
-- and the Activity page. actor_* are nullable for non-admin/system events.
CREATE TABLE IF NOT EXISTS activity_log (
  id            TEXT PRIMARY KEY,
  actor_id      TEXT,
  actor_email   TEXT,
  submission_id TEXT,
  subject       TEXT,          -- artist name or reference shown in the feed
  type          TEXT NOT NULL, -- approved | rejected | waitlisted | invoice_sent | paid | overdue | voided | awaiting
  message       TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log (created_at DESC);
