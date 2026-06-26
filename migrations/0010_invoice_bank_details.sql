-- Manual EFT / bank-transfer details shown on the approval email (Option 2).
-- These can't come from Xero, so the admin enters them in Invoice settings.
ALTER TABLE invoice_settings ADD COLUMN bank_account_name TEXT;
ALTER TABLE invoice_settings ADD COLUMN bank_bsb TEXT;
ALTER TABLE invoice_settings ADD COLUMN bank_account_number TEXT;
ALTER TABLE invoice_settings ADD COLUMN confirmation_form_url TEXT;

UPDATE invoice_settings
   SET bank_account_name = 'Mellow Art Market'
 WHERE id = 1 AND bank_account_name IS NULL;
