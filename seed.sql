-- Dev seed. Apply: bunx wrangler d1 execute mellow-db --local --file=./seed.sql

-- Invoice config (dev values) — Mellow Art Pty Ltd (AU, GST-inclusive).
UPDATE invoice_settings
   SET currency = 'AUD',
       account_code = '200',
       tax_type = 'OUTPUT',            -- Xero AU "GST on Income" (10%)
       line_amount_types = 'Inclusive', -- stall price is GST-inclusive
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
  (id, event_id, tier, slug, unit_amount, currency, frontage, furniture, sharing, sort_order)
VALUES
  ('STL-S-MINI', 'EVT-SUMMER26', 'Mini',             'mini',             250, 'AUD', '0.9m × 0.75m table', '1 chair',                         'No sharing',   0),
  ('STL-S-STD',  'EVT-SUMMER26', 'Standard',         'standard',         450, 'AUD', '2m frontage',        '1.8m × 0.75m trestle + 2 chairs', 'Max 2 brands', 1),
  ('STL-S-FLAG', 'EVT-SUMMER26', 'Flagship',         'flagship',         570, 'AUD', '3m frontage',        '1.8m × 0.75m trestle + 2 chairs', 'Max 2 brands', 2),
  ('STL-D-MINI', 'EVT-DEBUT26',  'Mini – Debut',     'mini-debut',       200, 'AUD', '0.9m × 0.75m table', '1 chair',                         'No sharing',   0),
  ('STL-D-STD',  'EVT-DEBUT26',  'Standard – Debut', 'standard-debut',   400, 'AUD', '2m frontage',        '1.8m × 0.75m trestle + 2 chairs', 'Max 2 brands', 1),
  ('STL-D-FLAG', 'EVT-DEBUT26',  'Flagship – Debut', 'flagship-debut',   520, 'AUD', '3m frontage',        '1.8m × 0.75m trestle + 2 chairs', 'Max 2 brands', 2);

INSERT OR IGNORE INTO submissions
  (id, first_name, last_name, email, applied_before, brand_name, website, instagram,
   bio, primary_category, secondary_category, product_description, additional_notes,
   consent_debut, consent_sharing, consent_setup_guide,
   first_stall_preference, second_stall_preference, offer_mini_if_unavailable,
   sharing_stall, has_insurance,
   event_id, status, reject_reason, decided_at, stall_option_id, payment_status, created_at)
VALUES
  ('ART-1024', 'Aria',  'Putri',      'aria.putri@example.com',     'No',  'Aria Studio',   'https://ariastudio.com', '@ariaputri',    'Mixed-media painter exploring archipelago folklore.', 'Painting',    'Contemporary', 'Original paintings and limited prints.', NULL, 1, 1, 1, 'standard',       'mini',       'Yes', 'No',  'Yes', 'EVT-SUMMER26', 'pending',    NULL,                                       NULL,                  NULL,        'none', '2026-06-09 09:00:00'),
  ('ART-1023', 'Budi',  'Santoso',    'budi.santoso@example.com',   'Yes', 'Budi Ceramics', 'N/A',                    '@budiceramics', 'Ceramicist working with volcanic clay glazes.',       'Ceramics',    'Functional',   'Handmade tableware and vases.',          NULL, 1, 1, 1, 'flagship',       'standard',   'No',  'No',  'Yes', 'EVT-SUMMER26', 'accepted',   NULL,                                       '2026-06-08 14:20:00', 'STL-S-STD', 'none', '2026-06-08 14:20:00'),
  ('ART-1022', 'Citra', 'Lestari',    'citra.lestari@example.com',  'No',  'Citra Draws',   'https://citra.art',      '@citradraws',   'Digital illustrator focused on editorial work.',      'Digital Art', 'Illustration', 'Art prints and stickers.',               NULL, 1, 1, 1, 'mini',           'standard',   'Yes', 'No',  'No',  'EVT-SUMMER26', 'rejected',   'Portfolio did not meet our requirements.', '2026-06-08 11:00:00', NULL,        'none', '2026-06-08 10:05:00'),
  ('ART-1021', 'Dewi',  'Anggraini',  'dewi.anggraini@example.com', 'No',  'Dewi Weaves',   'https://dewiweaves.com', '@dewiweaves',   'Textile artist reviving traditional weaving.',        'Textile',     'Traditional',  'Handwoven scarves and wall hangings.',   NULL, 1, 1, 1, 'standard-debut', 'mini-debut', 'Yes', 'Yes', 'Yes', 'EVT-DEBUT26',  'waitlisted', NULL,                                       '2026-06-07 17:00:00', NULL,        'none', '2026-06-07 16:45:00');
