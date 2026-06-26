-- Internal, admin-only freeform notes on a submission. Distinct from the
-- applicant's own `additional_notes` (a form field) — these are private staff
-- notes, never shown to the applicant.
ALTER TABLE submissions ADD COLUMN internal_notes TEXT;
