-- Dev seed. Apply: bunx wrangler d1 execute mellow-db --local --file=./seed.sql

-- Invoice config (dev values) — Mellow Art Pty Ltd (AU, GST-inclusive).
UPDATE invoice_settings
   SET currency = 'AUD',
       unit_amount = 440,
       account_code = '200',
       tax_type = 'OUTPUT',            -- Xero AU "GST on Income" (10%)
       line_amount_types = 'Inclusive', -- unit amount is GST-inclusive
       item_description = 'FULL TABLE FEE',
       due_days = 14
 WHERE id = 1;

INSERT OR IGNORE INTO submissions
  (id, first_name, last_name, email, phone, bio, primary_medium, style_category, location,
   social_link, custom_orders, additional_notes, consent_images, consent_purpose,
   status, reject_reason, decided_at, payment_status, created_at)
VALUES
  ('ART-1024', 'Aria',  'Putri',      'aria.putri@example.com',      '+62 812-1111-2222', 'Mixed-media painter exploring archipelago folklore.', 'Painting',     'Contemporary', 'Bali',     'https://instagram.com/ariaputri',  'Yes', NULL, 1, 1, 'pending',  NULL,                                  NULL,                  'none', '2026-06-09 09:00:00'),
  ('ART-1023', 'Budi',  'Santoso',    'budi.santoso@example.com',    '+62 813-3333-4444', 'Ceramicist working with volcanic clay glazes.',       'Ceramics',     'Functional',   'Yogyakarta','https://instagram.com/budiceramics', 'No',  NULL, 1, 1, 'approved', NULL,                                  '2026-06-08 14:20:00', 'none', '2026-06-08 14:20:00'),
  ('ART-1022', 'Citra', 'Lestari',    'citra.lestari@example.com',   '+62 811-5555-6666', 'Digital illustrator focused on editorial work.',      'Digital Art',  'Illustration', 'Jakarta',  NULL,                               NULL,  NULL, 1, 1, 'rejected', 'Portfolio did not meet the minimum image count.', '2026-06-08 11:00:00', 'none', '2026-06-08 10:05:00'),
  ('ART-1021', 'Dewi',  'Anggraini',  'dewi.anggraini@example.com',  '+62 821-7777-8888', 'Textile artist reviving traditional weaving.',        'Textile',      'Traditional',  'Bandung',  'https://behance.net/dewi',         'Yes', NULL, 1, 1, 'pending',  NULL,                                  NULL,                  'none', '2026-06-07 16:45:00');
