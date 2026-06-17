/**
 * State-machine writes for submissions. Every transition is guarded in SQL
 * (`WHERE ... AND status = ...`) so they're idempotent and safe under retries /
 * concurrent webhook deliveries. Each returns whether a row actually changed.
 */

interface InvoiceLookupRow {
  id: string;
  payment_status: string;
}

/**
 * pending → approved. Decision only — does NOT auto-trigger payment. If a
 * listing fee applies, call `startInvoicing` separately (e.g. from a Workflow).
 */
export async function approveSubmission(
  db: D1Database,
  id: string,
  decidedBy: string,
): Promise<boolean> {
  const res = await db
    .prepare(
      `UPDATE submissions
         SET status = 'approved',
             decided_by = ?,
             decided_at = datetime('now'),
             updated_at = datetime('now')
       WHERE id = ? AND status = 'pending'`,
    )
    .bind(decidedBy, id)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

/** approved + none → invoicing. Optional, explicit entry into the payment machine. */
export async function startInvoicing(
  db: D1Database,
  id: string,
): Promise<boolean> {
  const res = await db
    .prepare(
      `UPDATE submissions
         SET payment_status = 'invoicing',
             updated_at = datetime('now')
       WHERE id = ? AND status = 'approved' AND payment_status = 'none'`,
    )
    .bind(id)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

/** pending → rejected (terminal). */
export async function rejectSubmission(
  db: D1Database,
  id: string,
  reason: string,
  decidedBy: string,
): Promise<boolean> {
  const res = await db
    .prepare(
      `UPDATE submissions
         SET status = 'rejected',
             reject_reason = ?,
             decided_by = ?,
             decided_at = datetime('now'),
             updated_at = datetime('now')
       WHERE id = ? AND status = 'pending'`,
    )
    .bind(reason, decidedBy, id)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

/**
 * invoicing → awaiting_payment. Called by the approval Workflow once the Xero
 * invoice exists. Stores the join key used by the webhook.
 */
export async function attachInvoice(
  db: D1Database,
  id: string,
  xeroInvoiceId: string,
  invoiceUrl: string,
): Promise<boolean> {
  const res = await db
    .prepare(
      `UPDATE submissions
         SET xero_invoice_id = ?,
             invoice_url = ?,
             payment_status = 'awaiting_payment',
             updated_at = datetime('now')
       WHERE id = ? AND payment_status = 'invoicing'`,
    )
    .bind(xeroInvoiceId, invoiceUrl, id)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

/** Find the submission a Xero invoice belongs to (webhook → applicant). */
export async function findByInvoiceId(
  db: D1Database,
  xeroInvoiceId: string,
): Promise<InvoiceLookupRow | null> {
  return db
    .prepare(
      "SELECT id, payment_status FROM submissions WHERE xero_invoice_id = ?",
    )
    .bind(xeroInvoiceId)
    .first<InvoiceLookupRow>();
}

/**
 * → paid. Idempotent: only transitions from awaiting_payment/overdue, so a
 * duplicate webhook delivery is a no-op (returns false).
 */
export async function markInvoicePaid(
  db: D1Database,
  xeroInvoiceId: string,
): Promise<boolean> {
  const res = await db
    .prepare(
      `UPDATE submissions
         SET payment_status = 'paid',
             paid_at = datetime('now'),
             updated_at = datetime('now')
       WHERE xero_invoice_id = ?
         AND payment_status IN ('awaiting_payment', 'overdue')`,
    )
    .bind(xeroInvoiceId)
    .run();
  return (res.meta.changes ?? 0) > 0;
}
