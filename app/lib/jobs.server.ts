import { getInvoiceSettings, saveInvoiceRecord } from "~/lib/invoices.server";
import { attachInvoice } from "~/lib/payments.server";
import { createInvoice, type XeroCreds } from "~/lib/xero-client.server";

interface InvoiceSubmissionRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  payment_status: string;
}

function creds(env: Env): XeroCreds {
  return { clientId: env.XERO_CLIENT_ID, clientSecret: env.XERO_CLIENT_SECRET };
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
    "SELECT id, first_name, last_name, email, payment_status FROM submissions WHERE id = ?",
  )
    .bind(submissionId)
    .first<InvoiceSubmissionRow>();

  // Idempotency: only invoice while in the `invoicing` state.
  if (!row || row.payment_status !== "invoicing") return;

  const settings = await getInvoiceSettings(env.DB);

  const created = await createInvoice(
    creds(env),
    {
      contactName: `${row.first_name} ${row.last_name}`.trim(),
      contactEmail: row.email,
      reference: row.id,
      description: settings.itemDescription,
      unitAmount: settings.unitAmount,
      accountCode: settings.accountCode,
      currency: settings.currency,
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
    currency: created.currency ?? settings.currency,
    unitAmount: settings.unitAmount,
    total: created.total,
    amountDue: created.amountDue,
    status: created.status,
    onlineUrl: created.onlineUrl,
    reference: row.id,
  });

  await attachInvoice(env.DB, row.id, created.invoiceId, created.onlineUrl);
  // TODO: send the approval email containing `created.onlineUrl`.
}
