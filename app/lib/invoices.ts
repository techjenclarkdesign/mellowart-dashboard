/**
 * Client-safe invoice constants/types. Kept out of `invoices.server` so route
 * components can import them without pulling server-only code into the bundle.
 */

/** Allowed values for Xero's `line_amount_types`. */
export const LINE_AMOUNT_TYPES = ["Exclusive", "Inclusive", "NoTax"] as const;

export type LineAmountType = (typeof LINE_AMOUNT_TYPES)[number];

/**
 * Xero AU income-side tax types offered in invoice settings. Org-specific in
 * general, but these are the standard built-ins for a GST-on-income org.
 */
export const TAX_TYPES = [
  { value: "OUTPUT", label: "GST on Income (10%)" },
  { value: "EXEMPTOUTPUT", label: "GST Free Income" },
  { value: "NONE", label: "No GST" },
] as const;

export type TaxType = (typeof TAX_TYPES)[number]["value"];
