-- Footer-specific branding: a dedicated footer background color and footer logo
-- (typically a light/inverted variant, since the footer sits on a dark panel).
-- Existing rows are backfilled from the current brand color / header logo so the
-- rendered output is unchanged until an admin sets footer-specific values.

ALTER TABLE email_branding ADD COLUMN footer_bg TEXT;
ALTER TABLE email_branding ADD COLUMN footer_logo_url TEXT;

UPDATE email_branding
   SET footer_bg = COALESCE(footer_bg, brand_color),
       footer_logo_url = COALESCE(footer_logo_url, logo_url)
 WHERE id = 1;
