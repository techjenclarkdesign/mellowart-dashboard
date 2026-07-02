-- Shared-stall second artist. When an applicant answers "Yes" to "Are you
-- sharing a stall?", the form's conditional section collects a full profile for
-- the second artist. All columns are nullable — populated only when sharing.
-- Columns mirror the main applicant's text fields (the Webflow "buddy" section
-- is a full copy of the main form). buddy-email-02 is a confirm field only and
-- is never stored; the buddy portfolio upload is stored as a submission image
-- with kind 'second_portfolio' (see below).
ALTER TABLE submissions ADD COLUMN second_artist_first_name TEXT;
ALTER TABLE submissions ADD COLUMN second_artist_last_name TEXT;
ALTER TABLE submissions ADD COLUMN second_artist_email TEXT;
ALTER TABLE submissions ADD COLUMN second_artist_applied_before TEXT;
ALTER TABLE submissions ADD COLUMN second_artist_brand_name TEXT;
ALTER TABLE submissions ADD COLUMN second_artist_website TEXT;
ALTER TABLE submissions ADD COLUMN second_artist_instagram TEXT;
ALTER TABLE submissions ADD COLUMN second_artist_bio TEXT;
ALTER TABLE submissions ADD COLUMN second_artist_primary_category TEXT;
ALTER TABLE submissions ADD COLUMN second_artist_secondary_category TEXT;
ALTER TABLE submissions ADD COLUMN second_artist_product_description TEXT;

-- Widen submission_images.kind to allow the second artist's portfolio document.
-- SQLite can't alter a CHECK in place, so rebuild the table (as in 0012).
CREATE TABLE submission_images_new (
  id            TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES submissions (id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('profile', 'portfolio', 'insurance', 'second_portfolio')),
  r2_key        TEXT NOT NULL,
  content_type  TEXT,
  size          INTEGER,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO submission_images_new (
  id, submission_id, kind, r2_key, content_type, size, sort_order, created_at
)
SELECT id, submission_id, kind, r2_key, content_type, size, sort_order, created_at
FROM submission_images;

DROP TABLE submission_images;
ALTER TABLE submission_images_new RENAME TO submission_images;

CREATE INDEX IF NOT EXISTS idx_submission_images_submission ON submission_images (submission_id);
