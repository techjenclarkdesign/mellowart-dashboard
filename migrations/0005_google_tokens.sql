-- OAuth2 token store for the Google (Gmail API) connection used to send mail.
-- One row; populated by /google/callback, refreshed on demand. Google refresh
-- tokens are long-lived and usually do NOT rotate, so the same one is reused.
CREATE TABLE IF NOT EXISTS google_tokens (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  access_token  TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at    INTEGER NOT NULL,            -- epoch ms when the access token expires
  email         TEXT NOT NULL,               -- the connected mailbox (the From address)
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
