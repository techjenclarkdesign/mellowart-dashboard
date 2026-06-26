-- Stall options (event-scoped) now carry the price that drives each invoice,
-- so the global `unit_amount` on invoice_settings is dead. Drop it.
ALTER TABLE invoice_settings DROP COLUMN unit_amount;
