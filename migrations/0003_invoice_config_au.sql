-- Switch invoice config to Mellow Art Pty Ltd (AU): AUD, GST-inclusive 10%.
-- Matches the "FULL TABLE FEE" tax invoice example.
UPDATE invoice_settings
   SET currency = 'AUD',
       unit_amount = 440,
       account_code = '200',
       tax_type = 'OUTPUT',             -- Xero AU "GST on Income" (10%)
       line_amount_types = 'Inclusive', -- unit amount is GST-inclusive
       item_description = 'FULL TABLE FEE',
       updated_at = datetime('now')
 WHERE id = 1;
