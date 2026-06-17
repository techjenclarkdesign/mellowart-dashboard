/**
 * Client-safe invoice constants/types. Kept out of `invoices.server` so route
 * components can import them without pulling server-only code into the bundle.
 */

/** Allowed values for Xero's `line_amount_types`. */
export const LINE_AMOUNT_TYPES = ["Exclusive", "Inclusive", "NoTax"] as const;

export type LineAmountType = (typeof LINE_AMOUNT_TYPES)[number];
