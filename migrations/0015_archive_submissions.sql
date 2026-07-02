-- Archive is a list-visibility flag: archived rows are hidden from the default
-- inquiries view but still reachable via the "Archived"/"All" view. A timestamp
-- (not a boolean) records when it was archived; NULL means active.
ALTER TABLE submissions ADD COLUMN archived_at TEXT;

CREATE INDEX IF NOT EXISTS idx_submissions_archived ON submissions (archived_at);
