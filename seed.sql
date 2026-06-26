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

-- Events (normally mirrored from Webflow CMS).
INSERT OR IGNORE INTO events (id, webflow_id, name, slug, location, starts_at, ends_at)
VALUES
  ('EVT-SUMMER26', 'wf-summer-26', 'Mellow Art Market — Summer 2026', 'summer-2026', 'Sydney',    '2026-08-15', '2026-08-16'),
  ('EVT-DEBUT26',  'wf-debut-26',  'Mellow Art Market — Debut 2026',  'debut-2026',  'Melbourne', '2026-10-03', '2026-10-04');

-- Per-event stall options (spec pricing). Summer = regular tiers, Debut = debut tiers.
INSERT OR IGNORE INTO stall_options
  (id, event_id, tier, unit_amount, currency, frontage, furniture, sharing, sort_order)
VALUES
  ('STL-S-MINI', 'EVT-SUMMER26', 'Mini',             250, 'AUD', '0.9m × 0.75m table', '1 chair',                         'No sharing',   0),
  ('STL-S-STD',  'EVT-SUMMER26', 'Standard',         450, 'AUD', '2m frontage',        '1.8m × 0.75m trestle + 2 chairs', 'Max 2 brands', 1),
  ('STL-S-FLAG', 'EVT-SUMMER26', 'Flagship',         570, 'AUD', '3m frontage',        '1.8m × 0.75m trestle + 2 chairs', 'Max 2 brands', 2),
  ('STL-D-MINI', 'EVT-DEBUT26',  'Mini – Debut',     200, 'AUD', '0.9m × 0.75m table', '1 chair',                         'No sharing',   0),
  ('STL-D-STD',  'EVT-DEBUT26',  'Standard – Debut', 400, 'AUD', '2m frontage',        '1.8m × 0.75m trestle + 2 chairs', 'Max 2 brands', 1),
  ('STL-D-FLAG', 'EVT-DEBUT26',  'Flagship – Debut', 520, 'AUD', '3m frontage',        '1.8m × 0.75m trestle + 2 chairs', 'Max 2 brands', 2);

INSERT OR IGNORE INTO submissions
  (id, first_name, last_name, email, phone, bio, primary_medium, style_category, location,
   social_link, custom_orders, additional_notes, consent_images, consent_purpose,
   event_id, status, reject_reason, decided_at, stall_option_id, payment_status, created_at)
VALUES
  ('ART-1024', 'Aria',  'Putri',      'aria.putri@example.com',      '+62 812-1111-2222', 'Mixed-media painter exploring archipelago folklore.', 'Painting',     'Contemporary', 'Bali',      'https://instagram.com/ariaputri',   'Yes', NULL, 1, 1, 'EVT-SUMMER26', 'pending',    NULL,                                              NULL,                  NULL,        'none', '2026-06-09 09:00:00'),
  ('ART-1023', 'Budi',  'Santoso',    'budi.santoso@example.com',    '+62 813-3333-4444', 'Ceramicist working with volcanic clay glazes.',       'Ceramics',     'Functional',   'Yogyakarta','https://instagram.com/budiceramics', 'No',  NULL, 1, 1, 'EVT-SUMMER26', 'accepted',   NULL,                                              '2026-06-08 14:20:00', 'STL-S-STD', 'none', '2026-06-08 14:20:00'),
  ('ART-1022', 'Citra', 'Lestari',    'citra.lestari@example.com',   '+62 811-5555-6666', 'Digital illustrator focused on editorial work.',      'Digital Art',  'Illustration', 'Jakarta',   NULL,                                NULL,  NULL, 1, 1, 'EVT-SUMMER26', 'rejected',   'Portfolio did not meet the minimum image count.', '2026-06-08 11:00:00', NULL,        'none', '2026-06-08 10:05:00'),
  ('ART-1021', 'Dewi',  'Anggraini',  'dewi.anggraini@example.com',  '+62 821-7777-8888', 'Textile artist reviving traditional weaving.',        'Textile',      'Traditional',  'Bandung',   'https://behance.net/dewi',          'Yes', NULL, 1, 1, 'EVT-DEBUT26',  'waitlisted', NULL,                                              '2026-06-07 17:00:00', NULL,        'none', '2026-06-07 16:45:00');
