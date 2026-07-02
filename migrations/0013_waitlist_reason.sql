-- Optional note attached to a waitlist decision, mirroring `reject_reason`.
-- Included in the waitlist email when supplied; cleared when the decision
-- moves away from `waitlisted`.
ALTER TABLE submissions ADD COLUMN waitlist_reason TEXT;
