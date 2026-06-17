-- Single-row invoice configuration, forwarded to Xero at creation time.
CREATE TABLE IF NOT EXISTS invoice_settings (
  id                INTEGER PRIMARY KEY CHECK (id = 1),
  currency          TEXT NOT NULL DEFAULT 'IDR',
  unit_amount       REAL NOT NULL DEFAULT 0,
  account_code      TEXT NOT NULL DEFAULT '200',
  tax_type          TEXT,                                  -- org-specific, e.g. 'NONE'
  line_amount_types TEXT NOT NULL DEFAULT 'Exclusive',     -- Exclusive | Inclusive | NoTax
  item_description  TEXT NOT NULL DEFAULT 'Artist directory listing',
  due_days          INTEGER NOT NULL DEFAULT 14,
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO invoice_settings (id) VALUES (1);

-- Snapshot of each Xero invoice we create, for reconciling against webhooks.
CREATE TABLE IF NOT EXISTS invoices (
  xero_invoice_id TEXT PRIMARY KEY,
  submission_id   TEXT NOT NULL REFERENCES submissions (id) ON DELETE CASCADE,
  invoice_number  TEXT,
  currency        TEXT,
  unit_amount     REAL,
  total           REAL,
  amount_due      REAL,
  status          TEXT,   -- last known Xero status (AUTHORISED → PAID …)
  online_url      TEXT,
  reference       TEXT,   -- our submission id, sent as the Xero Reference
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_invoices_submission ON invoices (submission_id);
