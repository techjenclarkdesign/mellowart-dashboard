-- Admin-managed email templates + shared branding.
-- Templates are stored as JSON block arrays; when a row is absent the app falls
-- back to the code defaults in app/lib/email-templates.ts, so this migration
-- only needs to create the tables (+ a default branding row).

CREATE TABLE IF NOT EXISTS email_templates (
  key         TEXT PRIMARY KEY,           -- approval | confirmation | rejection | waitlist
  subject     TEXT NOT NULL,
  preheader   TEXT,
  blocks      TEXT NOT NULL,              -- JSON array of blocks
  updated_at  TEXT,
  updated_by  TEXT
);

CREATE TABLE IF NOT EXISTS email_branding (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  from_name     TEXT NOT NULL,
  logo_url      TEXT NOT NULL,
  brand_color   TEXT NOT NULL,
  accent_color  TEXT NOT NULL,
  button_color  TEXT NOT NULL,
  header_bg     TEXT NOT NULL,
  footer_text   TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  website_url   TEXT NOT NULL,
  instagram_url TEXT,
  facebook_url  TEXT,
  tiktok_url    TEXT,
  updated_at    TEXT
);

INSERT INTO email_branding
  (id, from_name, logo_url, brand_color, accent_color, button_color, header_bg,
   footer_text, contact_email, website_url, instagram_url, facebook_url,
   tiktok_url, updated_at)
VALUES
  (1, 'Mellow Art',
   'https://cdn.prod.website-files.com/6a223b24e44ab35ad710d94d/6a223b24e44ab35ad710d9a3_image%2030.webp',
   '#2C2422', '#F2C4CE', '#2C2422', '#FFFDF2',
   'This is an automated message from Mellow Art Market.' || char(10) || '© 2026 Mellow Art Market · Melbourne, Australia',
   'mellowartmarket@gmail.com', 'https://www.mellowart.com.au',
   'https://www.instagram.com/mellowartmarket/',
   'https://www.facebook.com/mellowartmarket',
   'https://www.tiktok.com/@mellowartmarket',
   datetime('now'))
ON CONFLICT(id) DO NOTHING;
