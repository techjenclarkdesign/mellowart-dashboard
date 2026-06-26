-- Reshape `submissions` to match the current public application form.
--
-- The intake changed shape: it now collects brand/website/Instagram, a primary
-- + secondary category, a product description, stall preferences (first +
-- second, as stall slugs), a "would you take a paired Mini" answer, a
-- sharing-a-stall answer, an insurance answer, and three stall agreements. It no
-- longer collects phone, location, a profile photo, or the old image consents.
--
-- SQLite can't drop columns or alter CHECK constraints in place, so the table is
-- rebuilt (same pattern as 0006). Legacy rows are preserved by mapping the old
-- columns onto their closest new homes:
--   primary_medium  → primary_category
--   style_category  → secondary_category
--   social_link     → instagram
--   consent_images  → consent_debut
--   consent_purpose → consent_sharing
-- (phone / location / custom_orders are dropped — no longer part of the form.)
--
-- D1 does not enforce foreign keys during migrations, so dropping/renaming
-- `submissions` (referenced by submission_images / invoices) is safe; child
-- references resolve again by name once the table is renamed back.

CREATE TABLE submissions_new (
  id               TEXT PRIMARY KEY,

  -- Applicant identity & contact
  first_name       TEXT NOT NULL,
  last_name        TEXT NOT NULL,
  email            TEXT NOT NULL,
  applied_before   TEXT,                       -- "Applied to a Mellow Art event before?" (yes/no)

  -- Brand & profile
  brand_name          TEXT,
  website             TEXT,                    -- "N/A" allowed
  instagram           TEXT,                    -- handle, @xxxxx
  bio                 TEXT NOT NULL,           -- artist statement (200–400 words)
  primary_category    TEXT,
  secondary_category  TEXT,
  product_description TEXT,
  additional_notes    TEXT,

  -- Stall agreements (all required true on submit)
  consent_debut       INTEGER NOT NULL DEFAULT 0,  -- Debut stall is first-timers only
  consent_sharing     INTEGER NOT NULL DEFAULT 0,  -- sharing = full stall size, not a half table
  consent_setup_guide INTEGER NOT NULL DEFAULT 0,  -- read & agree to the stall setup guide

  -- Stall preferences — applicant's wishes, stored as stall slugs and resolved
  -- against stall_options (scoped to the matched event) at read time.
  first_stall_preference    TEXT,
  second_stall_preference   TEXT,
  offer_mini_if_unavailable TEXT,             -- "take a paired Mini if no full table?" (yes/no)
  sharing_stall             TEXT,             -- "are you sharing a stall?" (yes/no)

  -- Insurance
  has_insurance    TEXT,                       -- "have $10M public liability?" (yes/no)

  -- Which event this application belongs to (nullable for legacy rows).
  event_id         TEXT REFERENCES events (id) ON DELETE SET NULL,

  -- Decision machine: pending → accepted | waitlisted | rejected (reversible).
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN (
                       'pending', 'accepted', 'waitlisted', 'rejected'
                     )),
  reject_reason    TEXT,
  decided_by       TEXT,
  decided_at       TEXT,

  -- Stall assignment (admin) — only meaningful once accepted; feeds the invoice.
  stall_option_id  TEXT REFERENCES stall_options (id) ON DELETE SET NULL,

  -- Payment machine
  payment_status   TEXT NOT NULL DEFAULT 'none'
                     CHECK (payment_status IN (
                       'none', 'invoicing', 'awaiting_payment',
                       'paid', 'overdue', 'voided'
                     )),
  xero_invoice_id  TEXT,
  invoice_url      TEXT,
  paid_at          TEXT,

  -- Admin-only notes (never shown to the applicant).
  internal_notes   TEXT,

  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Carry legacy rows over, mapping old columns to their closest new homes.
INSERT INTO submissions_new (
  id, first_name, last_name, email, bio,
  primary_category, secondary_category, instagram, additional_notes,
  consent_debut, consent_sharing,
  event_id, status, reject_reason, decided_by, decided_at,
  stall_option_id, payment_status, xero_invoice_id, invoice_url, paid_at,
  internal_notes, created_at, updated_at
)
SELECT
  id, first_name, last_name, email, bio,
  primary_medium, style_category, social_link, additional_notes,
  consent_images, consent_purpose,
  event_id, status, reject_reason, decided_by, decided_at,
  stall_option_id, payment_status, xero_invoice_id, invoice_url, paid_at,
  internal_notes, created_at, updated_at
FROM submissions;

DROP TABLE submissions;
ALTER TABLE submissions_new RENAME TO submissions;

CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions (status);
CREATE INDEX IF NOT EXISTS idx_submissions_payment_status ON submissions (payment_status);
CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON submissions (created_at);
CREATE INDEX IF NOT EXISTS idx_submissions_xero_invoice ON submissions (xero_invoice_id);
CREATE INDEX IF NOT EXISTS idx_submissions_event ON submissions (event_id);
CREATE INDEX IF NOT EXISTS idx_submissions_stall_option ON submissions (stall_option_id);

-- Widen submission_images.kind to allow the insurance certificate. 'profile' is
-- kept for legacy rows even though the form no longer collects a profile photo.
CREATE TABLE submission_images_new (
  id            TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES submissions (id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('profile', 'portfolio', 'insurance')),
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
