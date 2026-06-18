/** Transactional email templates. Pure string builders — no bindings. */

import type { OutgoingEmail } from "~/lib/gmail.server";

const FROM_NAME = "Mellow Art";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(amount: number | null, currency: string): string {
  if (amount == null) return "";
  return `${currency} ${amount.toFixed(2)}`;
}

function layout(body: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f6f6f6;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:28px">
    <h1 style="margin:0 0 4px;font-size:18px">Mellow Art</h1>
    ${body}
    <p style="margin:24px 0 0;font-size:12px;color:#888">This is an automated message from Mellow Art.</p>
  </div></body></html>`;
}

function button(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">${escapeHtml(label)}</a>`;
}

/** Sent when a submission is approved and its Xero invoice is created. */
export function approvalEmail(input: {
  to: string;
  name: string;
  reference: string;
  invoiceUrl: string;
  amount: number | null;
  currency: string;
}): OutgoingEmail {
  const amount = money(input.amount, input.currency);
  const cta = input.invoiceUrl
    ? `<p style="margin:0 0 20px">${button(input.invoiceUrl, "View & pay invoice")}</p>`
    : "";
  const html = layout(`
    <p style="margin:16px 0 12px">Hi ${escapeHtml(input.name || "there")},</p>
    <p style="margin:0 0 12px">Good news — your submission (<strong>${escapeHtml(input.reference)}</strong>) has been <strong>approved</strong>.</p>
    <p style="margin:0 0 20px">${amount ? `An invoice for <strong>${escapeHtml(amount)}</strong> has been issued.` : "An invoice has been issued."} You can review and pay it online below.</p>
    ${cta}
    ${input.invoiceUrl ? `<p style="margin:0 0 4px;font-size:12px;color:#888">Or paste this link into your browser:</p><p style="margin:0;font-size:12px;color:#888;word-break:break-all">${escapeHtml(input.invoiceUrl)}</p>` : ""}
  `);
  return {
    to: input.to,
    subject: `Your Mellow Art submission ${input.reference} is approved`,
    html,
    fromName: FROM_NAME,
  };
}

/**
 * Sent when a submission is rejected. Includes the reason the admin typed.
 * NOTE: placeholder wording — to be refined later.
 */
export function rejectionEmail(input: {
  to: string;
  name: string;
  reference: string;
  reason: string;
}): OutgoingEmail {
  const html = layout(`
    <p style="margin:16px 0 12px">Hi ${escapeHtml(input.name || "there")},</p>
    <p style="margin:0 0 12px">Thank you for your submission (<strong>${escapeHtml(input.reference)}</strong>). After review, it has <strong>not been accepted</strong> at this time.</p>
    <p style="margin:0 0 4px">Reason:</p>
    <p style="margin:0 0 20px;padding:12px 14px;background:#f6f6f6;border-radius:8px;white-space:pre-wrap">${escapeHtml(input.reason)}</p>
  `);
  return {
    to: input.to,
    subject: `Your Mellow Art submission ${input.reference}`,
    html,
    fromName: FROM_NAME,
  };
}
