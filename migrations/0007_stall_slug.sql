-- Add a slug to stall options (parity with events / Webflow). Optional, but
-- when set it must be unique within its event. Existing rows keep NULL, and
-- SQLite treats NULLs as distinct, so multiple unset slugs per event are fine.
ALTER TABLE stall_options ADD COLUMN slug TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_stall_options_event_slug
  ON stall_options (event_id, slug);
