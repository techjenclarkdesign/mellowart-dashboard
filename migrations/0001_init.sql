-- Admins (custom JWT auth)
CREATE TABLE IF NOT EXISTS admins (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Artist profile submissions.
-- Two independent state machines:
--   1. Decision (status):        pending → approved | rejected   (admin, sync)
--   2. Payment  (payment_status): none → invoicing → awaiting_payment → paid
--      (+ overdue/voided). Optional — NOT auto-triggered by approval.
CREATE TABLE IF NOT EXISTS submissions (
  id               TEXT PRIMARY KEY,

  -- Artist fields
  first_name       TEXT NOT NULL,
  last_name        TEXT NOT NULL,
  email            TEXT NOT NULL,
  phone            TEXT NOT NULL,
  bio              TEXT NOT NULL,            -- artist statement (200–400 words)
  primary_medium   TEXT NOT NULL,
  style_category   TEXT NOT NULL,
  location         TEXT NOT NULL,
  social_link      TEXT,
  custom_orders    TEXT,                     -- "Open for custom orders" (optional)
  additional_notes TEXT,
  consent_images   INTEGER NOT NULL DEFAULT 0,  -- 1 = consented
  consent_purpose  INTEGER NOT NULL DEFAULT 0,

  -- Decision machine
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'approved', 'rejected')),
  reject_reason    TEXT,
  decided_by       TEXT,
  decided_at       TEXT,

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

-- Uploaded images live in R2; we store the keys here.
--   kind = 'profile'   → exactly one
--   kind = 'portfolio' → three or more
CREATE TABLE IF NOT EXISTS submission_images (
  id            TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES submissions (id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('profile', 'portfolio')),
  r2_key        TEXT NOT NULL,
  content_type  TEXT,
  size          INTEGER,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions (status);
CREATE INDEX IF NOT EXISTS idx_submissions_payment_status ON submissions (payment_status);
CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON submissions (created_at);
CREATE INDEX IF NOT EXISTS idx_submissions_xero_invoice ON submissions (xero_invoice_id);
CREATE INDEX IF NOT EXISTS idx_submission_images_submission ON submission_images (submission_id);
