-- Events + per-event stall options, and the submission links into them.
--
-- Also widens the decision enum to the spec's four states
-- (Pending / Accepted / Waitlisted / Rejected) and renames the legacy
-- `approved` value to `accepted`. SQLite can't alter a CHECK constraint in
-- place, so `submissions` is rebuilt below.
--
-- D1 does not enforce foreign keys during migrations, so the drop/rename of
-- `submissions` (referenced by submission_images / invoices) is safe; the
-- child references resolve again by name once the table is renamed back.

-- Events. Source of truth is the Webflow CMS; we mirror them locally so the
-- dashboard can scope applicants and stall options per event. `webflow_id`
-- is the upsert key used by the (stubbed) sync.
CREATE TABLE IF NOT EXISTS events (
  id          TEXT PRIMARY KEY,
  webflow_id  TEXT UNIQUE,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  location    TEXT,
  starts_at   TEXT,
  ends_at     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Stall options are event-scoped (NOT global): each event defines its own
-- tiers and prices. `unit_amount` drives the Xero invoice when assigned.
CREATE TABLE IF NOT EXISTS stall_options (
  id          TEXT PRIMARY KEY,
  event_id    TEXT NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  tier        TEXT NOT NULL,                 -- e.g. "Standard – Debut"
  unit_amount REAL NOT NULL DEFAULT 0,       -- price, GST-inclusive
  currency    TEXT NOT NULL DEFAULT 'AUD',
  frontage    TEXT,                          -- e.g. "2m frontage"
  furniture   TEXT,                          -- e.g. "1.8m trestle + 2 chairs"
  sharing     TEXT,                          -- e.g. "Max 2 brands"
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_stall_options_event ON stall_options (event_id);

-- Rebuild submissions: add event_id + stall_option_id, widen the status enum.
CREATE TABLE submissions_new (
  id               TEXT PRIMARY KEY,

  -- Artist fields
  first_name       TEXT NOT NULL,
  last_name        TEXT NOT NULL,
  email            TEXT NOT NULL,
  phone            TEXT NOT NULL,
  bio              TEXT NOT NULL,
  primary_medium   TEXT NOT NULL,
  style_category   TEXT NOT NULL,
  location         TEXT NOT NULL,
  social_link      TEXT,
  custom_orders    TEXT,
  additional_notes TEXT,
  consent_images   INTEGER NOT NULL DEFAULT 0,
  consent_purpose  INTEGER NOT NULL DEFAULT 0,

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

  -- Stall assignment — only meaningful once accepted; feeds the Xero invoice.
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

  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Copy existing rows, migrating approved → accepted.
INSERT INTO submissions_new (
  id, first_name, last_name, email, phone, bio, primary_medium, style_category,
  location, social_link, custom_orders, additional_notes, consent_images,
  consent_purpose, event_id, status, reject_reason, decided_by, decided_at,
  stall_option_id, payment_status, xero_invoice_id, invoice_url, paid_at,
  created_at, updated_at
)
SELECT
  id, first_name, last_name, email, phone, bio, primary_medium, style_category,
  location, social_link, custom_orders, additional_notes, consent_images,
  consent_purpose, NULL,
  CASE status WHEN 'approved' THEN 'accepted' ELSE status END,
  reject_reason, decided_by, decided_at,
  NULL, payment_status, xero_invoice_id, invoice_url, paid_at,
  created_at, updated_at
FROM submissions;

DROP TABLE submissions;
ALTER TABLE submissions_new RENAME TO submissions;

-- Recreate the indexes from 0001 (lost with the old table).
CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions (status);
CREATE INDEX IF NOT EXISTS idx_submissions_payment_status ON submissions (payment_status);
CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON submissions (created_at);
CREATE INDEX IF NOT EXISTS idx_submissions_xero_invoice ON submissions (xero_invoice_id);
CREATE INDEX IF NOT EXISTS idx_submissions_event ON submissions (event_id);
CREATE INDEX IF NOT EXISTS idx_submissions_stall_option ON submissions (stall_option_id);
