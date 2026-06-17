import {
  getInvoiceRecord,
  getInvoiceSettings,
  reconcile,
  saveInvoiceRecord,
  updateInvoiceStatus,
} from "~/lib/invoices.server";
import {
  attachInvoice,
  findByInvoiceId,
  markInvoicePaid,
} from "~/lib/payments.server";
import {
  createInvoice,
  getInvoice,
  isInvoicePaid,
  type XeroCreds,
} from "~/lib/xero-client.server";

/** Async work pulled off the request path via Cloudflare Queues. */
export type Job =
  | { type: "create_invoice"; submissionId: string }
  | { type: "verify_payment"; invoiceId: string };

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

export async function processJob(env: Env, job: Job): Promise<void> {
  switch (job.type) {
    case "create_invoice":
      await handleCreateInvoice(env, job.submissionId);
      return;
    case "verify_payment":
      await handleVerifyPayment(env, job.invoiceId);
      return;
  }
}

// approve → invoicing → (this) create Xero invoice from DB config → awaiting_payment
async function handleCreateInvoice(
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

  // Snapshot what we created so the webhook can reconcile against it.
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

// Xero webhook fired → fetch the invoice, reconcile against our snapshot,
// then flip to paid when settled.
async function handleVerifyPayment(
  env: Env,
  invoiceId: string,
): Promise<void> {
  const submission = await findByInvoiceId(env.DB, invoiceId);
  if (!submission) return; // not one of ours

  const invoice = await getInvoice(creds(env), invoiceId);
  if (!invoice) return;

  // Verify the live invoice matches what we recorded at creation.
  const snapshot = await getInvoiceRecord(env.DB, invoiceId);
  if (snapshot) {
    const issues = reconcile(snapshot, invoice);
    if (issues.length) {
      console.warn("Invoice mismatch vs snapshot", { invoiceId, issues });
    }
  }

  await updateInvoiceStatus(env.DB, invoiceId, invoice.status, invoice.amountDue);

  if (isInvoicePaid(invoice)) {
    await markInvoicePaid(env.DB, invoiceId); // idempotent
    // TODO: send the payment-confirmation email.
  }
}
