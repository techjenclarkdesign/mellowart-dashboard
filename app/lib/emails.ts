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

const LOGO_URL =
  "https://cdn.prod.website-files.com/6a223b24e44ab35ad710d94d/6a223b24e44ab35ad710d9a3_image%2030.webp";
const CONTACT_EMAIL = "mellowartmarket@gmail.com";

export interface ApprovalEmailInput {
  to: string;
  name: string;
  reference: string;
  eventName: string | null;
  invoiceUrl: string;
  amount: number | null;
  currency: string;
  /** Pre-formatted, e.g. "15 Aug 2026". */
  dueDate: string;
  /** Manual EFT details from Invoice settings. */
  bankAccountName: string | null;
  bankBsb: string | null;
  bankAccountNumber: string | null;
  confirmationFormUrl: string | null;
}

/** Sent when a submission is approved and its Xero invoice is created. */
export function approvalEmail(input: ApprovalEmailInput): OutgoingEmail {
  const name = escapeHtml(input.name || "there");
  const ref = escapeHtml(input.reference);
  const eventName = escapeHtml(input.eventName || "the event");
  const due = escapeHtml(input.dueDate);
  const amountStr = escapeHtml(money(input.amount, input.currency) || "—");
  const link = escapeHtml(input.invoiceUrl);

  // Stripe / Xero online-payment block (only if we have a link).
  const onlineOption = input.invoiceUrl
    ? `
    <div class="payment-option">
      <div class="payment-option-header">
        <span class="option-badge">Option 1</span>
        <span class="option-title">Pay Online via Stripe</span>
      </div>
      <div class="payment-option-body">
        <p>Pay securely online using your credit or debit card. Instant confirmation.</p>
        <a href="${link}" class="btn">View &amp; Pay Invoice →</a>
        <p class="link-fallback">Or paste this link into your browser:<br/><a href="${link}">${link}</a></p>
      </div>
    </div>`
    : "";

  // EFT / bank-transfer block (only if BSB + account number are configured).
  const hasBank = Boolean(input.bankBsb && input.bankAccountNumber);
  const confirmRow = input.confirmationFormUrl
    ? `
        <div class="confirm-step">
          <span class="icon">📋</span>
          <span>Or fill in our confirmation form: <a href="${escapeHtml(input.confirmationFormUrl)}" style="color:#2C2422;">${escapeHtml(input.confirmationFormUrl)}</a></span>
        </div>`
    : "";
  const bankOption = hasBank
    ? `
    <div class="payment-option">
      <div class="payment-option-header">
        <span class="option-badge">Option ${input.invoiceUrl ? "2" : "1"}</span>
        <span class="option-title">Pay via Bank Transfer (EFT)</span>
      </div>
      <div class="payment-option-body">
        <p>Prefer to pay manually? Transfer directly to our bank account using the details below.</p>
        <table class="bank-table">
          <tr><td>Account Name</td><td>${escapeHtml(input.bankAccountName || "Mellow Art Market")}</td></tr>
          <tr><td>BSB</td><td>${escapeHtml(input.bankBsb!)}</td></tr>
          <tr><td>Account Number</td><td>${escapeHtml(input.bankAccountNumber!)}</td></tr>
          <tr><td>Amount</td><td>${amountStr}</td></tr>
          <tr><td>Reference</td><td>${ref} – ${name}</td></tr>
        </table>
        <div class="warning-box">
          ⚠️ Please use your <strong>Submission ID and full name</strong> as the payment reference so we can match your payment correctly.
        </div>
        <p style="font-size:13px; font-weight:600; color:#2C2422; margin-bottom:12px;">After transferring, please confirm your payment:</p>
        <div class="confirm-step">
          <span class="icon">📧</span>
          <span>Email us at <a href="mailto:${CONTACT_EMAIL}" style="color:#2C2422;">${CONTACT_EMAIL}</a></span>
        </div>${confirmRow}
      </div>
    </div>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Mellow Art — Invoice Email</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background-color: #F5F5F0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 15px; color: #2C2422; padding: 40px 16px; }
    .email-wrapper { max-width: 600px; margin: 0 auto; background: #FFFFFF; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 16px rgba(0,0,0,0.06); }
    .header { background-color: #FFFDF2; padding: 36px 40px 28px; text-align: center; border-bottom: 1px solid #F0EBE3; }
    .header img { height: 44px; width: auto; }
    .hero { background-color: #2C2422; padding: 40px 40px 36px; text-align: center; }
    .hero .tag { display: inline-block; background: #F2C4CE; color: #2C2422; font-size: 11px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; padding: 6px 16px; border-radius: 999px; margin-bottom: 20px; }
    .hero h1 { font-size: 26px; font-weight: 600; color: #FFFFFF; line-height: 1.3; margin-bottom: 12px; }
    .hero p { font-size: 14px; color: #BEB5B2; line-height: 1.7; }
    .hero .submission-id { display: inline-block; margin-top: 16px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); color: #FFFFFF; font-size: 12px; letter-spacing: 0.08em; padding: 6px 16px; border-radius: 8px; font-family: monospace; }
    .body { padding: 36px 40px; }
    .greeting { font-size: 15px; line-height: 1.7; color: #2C2422; margin-bottom: 28px; }
    .section-label { font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #BEB5B2; margin-bottom: 16px; }
    .invoice-box { background: #FFFDF2; border: 1.5px solid #F0EBE3; border-radius: 12px; padding: 20px 24px; margin-bottom: 28px; }
    .invoice-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #F0EBE3; font-size: 14px; }
    .invoice-row:last-child { border-bottom: none; padding-top: 14px; }
    .invoice-row .label { color: #7A6E6C; }
    .invoice-row .value { font-weight: 500; color: #2C2422; }
    .invoice-row.total .label { font-weight: 600; font-size: 15px; color: #2C2422; }
    .invoice-row.total .value { font-weight: 700; font-size: 18px; color: #2C2422; }
    .payment-option { border: 1.5px solid #F0EBE3; border-radius: 12px; overflow: hidden; margin-bottom: 16px; }
    .payment-option-header { background: #F8F5F0; padding: 12px 20px; display: flex; align-items: center; gap: 10px; }
    .option-badge { background: #2C2422; color: #FFFFFF; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; padding: 3px 10px; border-radius: 999px; text-transform: uppercase; }
    .option-title { font-size: 13px; font-weight: 600; color: #2C2422; }
    .payment-option-body { padding: 20px; }
    .payment-option-body p { font-size: 13px; color: #7A6E6C; line-height: 1.6; margin-bottom: 16px; }
    .btn { display: block; text-align: center; background: #2C2422; color: #FFFFFF !important; text-decoration: none; font-size: 13px; font-weight: 600; letter-spacing: 0.04em; padding: 14px 24px; border-radius: 999px; }
    .btn-outline { display: block; text-align: center; background: transparent; color: #2C2422 !important; text-decoration: none; font-size: 13px; font-weight: 600; letter-spacing: 0.04em; padding: 14px 24px; border-radius: 999px; border: 1.5px solid #2C2422; }
    .link-fallback { font-size: 11px; color: #BEB5B2; text-align: center; margin-top: 10px; word-break: break-all; }
    .link-fallback a { color: #BEB5B2; }
    .bank-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 16px; }
    .bank-table tr td { padding: 9px 0; border-bottom: 1px solid #F0EBE3; vertical-align: top; }
    .bank-table tr:last-child td { border-bottom: none; }
    .bank-table td:first-child { color: #7A6E6C; width: 44%; }
    .bank-table td:last-child { font-weight: 500; color: #2C2422; }
    .warning-box { background: #FFF8E1; border-left: 3px solid #F2C4CE; border-radius: 0 8px 8px 0; padding: 12px 16px; font-size: 12px; color: #7A6E6C; line-height: 1.6; margin-bottom: 16px; }
    .warning-box strong { color: #2C2422; }
    .confirm-step { display: flex; align-items: flex-start; gap: 12px; font-size: 13px; color: #2C2422; margin-bottom: 10px; }
    .confirm-step .icon { font-size: 16px; margin-top: 1px; flex-shrink: 0; }
    .divider { border: none; border-top: 1px solid #F0EBE3; margin: 28px 0; }
    .closing { font-size: 14px; color: #7A6E6C; line-height: 1.7; margin-bottom: 24px; }
    .footer { background: #2C2422; padding: 28px 40px; text-align: center; }
    .footer img { height: 32px; width: auto; margin-bottom: 16px; opacity: 0.9; }
    .footer p { font-size: 12px; color: #7A6E6C; line-height: 1.7; }
    .footer a { color: #BEB5B2; text-decoration: none; }
    .social-links { display: flex; justify-content: center; gap: 16px; margin: 16px 0; }
    .social-links a { color: #BEB5B2; font-size: 12px; text-decoration: none; }
    @media (max-width: 480px) {
      .header, .hero, .body, .footer { padding-left: 24px; padding-right: 24px; }
      .invoice-row { flex-direction: column; align-items: flex-start; gap: 2px; }
    }
  </style>
</head>
<body>
<div class="email-wrapper">
  <div class="header">
    <img src="${LOGO_URL}" alt="Mellow Art Market" />
  </div>
  <div class="hero">
    <div class="tag">Application Approved</div>
    <h1>Congratulations,<br/>${name}! 🎨</h1>
    <p>Your application has been approved.<br/>Complete your payment to secure your spot.</p>
    <div class="submission-id">${ref}</div>
  </div>
  <div class="body">
    <p class="greeting">
      Hi ${name},<br/><br/>
      We're so excited to have you join us at <strong>${eventName}</strong>! 🌿
      Your spot is almost secured — just one step left. Please complete your payment by <strong>${due}</strong> to confirm your place at the event.
    </p>
    <div class="section-label">Invoice Summary</div>
    <div class="invoice-box">
      <div class="invoice-row"><span class="label">Event</span><span class="value">${eventName}</span></div>
      <div class="invoice-row"><span class="label">Submission ID</span><span class="value">${ref}</span></div>
      <div class="invoice-row"><span class="label">Payment Due</span><span class="value">${due}</span></div>
      <div class="invoice-row total"><span class="label">Total Amount</span><span class="value">${amountStr}</span></div>
    </div>
    <div class="section-label">Payment Options</div>
    ${onlineOption}
    ${bankOption}
    <hr class="divider" />
    <p class="closing">
      Once your payment is received and confirmed, we'll send you a follow-up email with all the event details you need. 🌿<br/><br/>
      If you have any questions, don't hesitate to reach out — we're always happy to help!<br/><br/>
      Can't wait to see you at <strong>${eventName}</strong>. 🎨
    </p>
    <p style="font-size:14px; color:#2C2422;">
      Warm regards,<br/>
      <strong>The Mellow Art Team</strong>
    </p>
  </div>
  <div class="footer">
    <img src="${LOGO_URL}" alt="Mellow Art Market" />
    <div class="social-links">
      <a href="https://www.instagram.com/mellowartmarket/">Instagram</a>
      <a href="https://www.facebook.com/mellowartmarket">Facebook</a>
      <a href="https://www.tiktok.com/@mellowartmarket">TikTok</a>
    </div>
    <p>
      <a href="https://www.mellowart.com.au">www.mellowart.com.au</a><br/>
      ${CONTACT_EMAIL}<br/><br/>
      This is an automated message from Mellow Art Market.<br/>
      © 2026 Mellow Art Market · Melbourne, Australia
    </p>
  </div>
</div>
</body>
</html>`;

  return {
    to: input.to,
    subject: `You're in! Complete your payment for ${input.eventName || "Mellow Art Market"} (${input.reference})`,
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
