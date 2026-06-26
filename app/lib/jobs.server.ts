import { sendEmail } from "~/lib/gmail.server";
import { approvalEmail, rejectionEmail } from "~/lib/emails";
import { getInvoiceSettings, saveInvoiceRecord } from "~/lib/invoices.server";
import { attachInvoice } from "~/lib/payments.server";
import { createInvoice } from "~/lib/xero-client.server";

interface InvoiceSubmissionRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  payment_status: string;
  stall_tier: string | null;
  stall_amount: number | null;
  stall_currency: string | null;
}

function isoDate(daysFromNow: number): string {
  return new Date(Date.now() + daysFromNow * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

// approve → invoicing → (this) create Xero invoice from DB config → awaiting_payment
export async function createInvoiceForSubmission(
  env: Env,
  submissionId: string,
): Promise<void> {
  const row = await env.DB.prepare(
    `SELECT s.id, s.first_name, s.last_name, s.email, s.payment_status,
            o.tier AS stall_tier, o.unit_amount AS stall_amount,
            o.currency AS stall_currency
       FROM submissions s
       LEFT JOIN stall_options o ON o.id = s.stall_option_id
      WHERE s.id = ?`,
  )
    .bind(submissionId)
    .first<InvoiceSubmissionRow>();

  // Idempotency: only invoice while in the `invoicing` state. The assigned
  // stall must carry a price — that's what drives the invoice amount.
  if (!row || row.payment_status !== "invoicing") return;
  if (row.stall_amount == null) return;

  const settings = await getInvoiceSettings(env.DB);

  // Stall option (event-scoped) sets the amount/currency; the rest of the line
  // (account, tax, terms) still comes from invoice settings.
  const unitAmount = row.stall_amount;
  const currency = row.stall_currency ?? settings.currency;
  const description = row.stall_tier
    ? `${settings.itemDescription} — ${row.stall_tier}`
    : settings.itemDescription;

  const created = await createInvoice(
    env,
    {
      contactName: `${row.first_name} ${row.last_name}`.trim(),
      contactEmail: row.email,
      reference: row.id,
      description,
      unitAmount,
      accountCode: settings.accountCode,
      currency,
      lineAmountTypes: settings.lineAmountTypes,
      taxType: settings.taxType,
      dueDate: isoDate(settings.dueDays),
    },
    row.id, // idempotency key — Xero won't create a duplicate on retry
  );

  // Snapshot what we created for later reconciliation/reference.
  await saveInvoiceRecord(env.DB, {
    xeroInvoiceId: created.invoiceId,
    submissionId: row.id,
    invoiceNumber: created.invoiceNumber,
    currency: created.currency ?? currency,
    unitAmount,
    total: created.total,
    amountDue: created.amountDue,
    status: created.status,
    onlineUrl: created.onlineUrl,
    reference: row.id,
  });

  await attachInvoice(env.DB, row.id, created.invoiceId, created.onlineUrl);

  // Best-effort approval email with the invoice link. Never let a mail failure
  // (or a missing Gmail connection) undo the invoice — it's already created.
  try {
    const name = `${row.first_name} ${row.last_name}`.trim();
    await sendEmail(
      env,
      approvalEmail({
        to: row.email,
        name,
        reference: row.id,
        invoiceUrl: created.onlineUrl,
        amount: created.total ?? unitAmount,
        currency: created.currency ?? currency,
      }),
    );
  } catch (err) {
    console.error("Approval email failed (invoice still created)", err);
  }
}

// Best-effort rejection email with the admin's reason. Never let a mail failure
// (or a missing Gmail connection) undo the rejection — it's already recorded.
export async function sendRejectionEmail(
  env: Env,
  submissionId: string,
  reason: string,
): Promise<void> {
  const row = await env.DB.prepare(
    "SELECT id, first_name, last_name, email FROM submissions WHERE id = ?",
  )
    .bind(submissionId)
    .first<{ id: string; first_name: string; last_name: string; email: string }>();
  if (!row) return;

  try {
    await sendEmail(
      env,
      rejectionEmail({
        to: row.email,
        name: `${row.first_name} ${row.last_name}`.trim(),
        reference: row.id,
        reason,
      }),
    );
  } catch (err) {
    console.error("Rejection email failed (submission still rejected)", err);
  }
}
