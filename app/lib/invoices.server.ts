/** Invoice configuration + created-invoice snapshots (for webhook reconciliation). */

export interface InvoiceSettings {
  currency: string;
  unitAmount: number;
  accountCode: string;
  taxType: string | null;
  lineAmountTypes: string;
  itemDescription: string;
  dueDays: number;
}

const DEFAULT_SETTINGS: InvoiceSettings = {
  currency: "AUD",
  unitAmount: 440,
  accountCode: "200",
  taxType: "OUTPUT", // Xero AU "GST on Income" (10%)
  lineAmountTypes: "Inclusive", // unit amount is GST-inclusive
  itemDescription: "FULL TABLE FEE",
  dueDays: 14,
};

export async function getInvoiceSettings(
  db: D1Database,
): Promise<InvoiceSettings> {
  const row = await db
    .prepare(
      `SELECT currency, unit_amount AS unitAmount, account_code AS accountCode,
              tax_type AS taxType, line_amount_types AS lineAmountTypes,
              item_description AS itemDescription, due_days AS dueDays
       FROM invoice_settings WHERE id = 1`,
    )
    .first<InvoiceSettings>();
  return row ?? DEFAULT_SETTINGS;
}

export interface InvoiceRecord {
  xeroInvoiceId: string;
  submissionId: string;
  invoiceNumber: string | null;
  currency: string | null;
  unitAmount: number;
  total: number | null;
  amountDue: number | null;
  status: string | null;
  onlineUrl: string;
  reference: string;
}

/** Persist (or refresh) the snapshot of a created Xero invoice. */
export async function saveInvoiceRecord(
  db: D1Database,
  rec: InvoiceRecord,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO invoices
         (xero_invoice_id, submission_id, invoice_number, currency, unit_amount,
          total, amount_due, status, online_url, reference)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(xero_invoice_id) DO UPDATE SET
         invoice_number = excluded.invoice_number,
         currency = excluded.currency,
         total = excluded.total,
         amount_due = excluded.amount_due,
         status = excluded.status,
         online_url = excluded.online_url,
         updated_at = datetime('now')`,
    )
    .bind(
      rec.xeroInvoiceId,
      rec.submissionId,
      rec.invoiceNumber,
      rec.currency,
      rec.unitAmount,
      rec.total,
      rec.amountDue,
      rec.status,
      rec.onlineUrl,
      rec.reference,
    )
    .run();
}

export interface StoredInvoice {
  total: number | null;
  currency: string | null;
  reference: string | null;
  status: string | null;
}

export async function getInvoiceRecord(
  db: D1Database,
  xeroInvoiceId: string,
): Promise<StoredInvoice | null> {
  return db
    .prepare(
      "SELECT total, currency, reference, status FROM invoices WHERE xero_invoice_id = ?",
    )
    .bind(xeroInvoiceId)
    .first<StoredInvoice>();
}

export async function updateInvoiceStatus(
  db: D1Database,
  xeroInvoiceId: string,
  status: string,
  amountDue: number,
): Promise<void> {
  await db
    .prepare(
      `UPDATE invoices
         SET status = ?, amount_due = ?, updated_at = datetime('now')
       WHERE xero_invoice_id = ?`,
    )
    .bind(status, amountDue, xeroInvoiceId)
    .run();
}

/** Compare the live Xero invoice against our snapshot. Returns mismatch reasons. */
export function reconcile(
  snapshot: StoredInvoice,
  live: { total: number; currency: string; reference: string },
): string[] {
  const issues: string[] = [];
  if (snapshot.total != null && live.total !== snapshot.total) {
    issues.push(`total ${live.total} != snapshot ${snapshot.total}`);
  }
  if (snapshot.currency && live.currency && live.currency !== snapshot.currency) {
    issues.push(`currency ${live.currency} != snapshot ${snapshot.currency}`);
  }
  if (snapshot.reference && live.reference && live.reference !== snapshot.reference) {
    issues.push(`reference ${live.reference} != snapshot ${snapshot.reference}`);
  }
  return issues;
}
