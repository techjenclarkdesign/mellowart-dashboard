-- OAuth2 token store for the Xero web-app connection (single organisation).
-- Populated by the /xero/callback route; refreshed (and the refresh token
-- rotated) on demand by the Xero client. One row only.
CREATE TABLE IF NOT EXISTS xero_tokens (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  access_token  TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at    INTEGER NOT NULL,            -- epoch ms when the access token expires
  tenant_id     TEXT NOT NULL,
  tenant_name   TEXT,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
