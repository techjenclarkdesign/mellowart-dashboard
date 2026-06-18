# Mellow Art Dashboard — User Manual

A plain-language guide for running the Mellow Art platform: reviewing artist
submissions, approving/rejecting them, sending invoices through Xero, and
emailing applicants. No technical knowledge required.

- **Dashboard URL:** https://mellow-cf.mellowartmarket.workers.dev
- **Who this is for:** the admin(s) who review submissions and manage invoices.

---

## 1. What the platform does

Artists submit their profile through your public form. Each submission lands in
this dashboard as **Pending**. You review it and either:

- **Approve** → the system creates an invoice in **Xero** and emails the artist
  a link to view and pay it.
- **Reject** → the system emails the artist with the reason you wrote.

You can also track whether an invoice has been **paid** and adjust invoice
defaults (price, currency, due date, tax).

The flow at a glance:

```
Artist submits form  →  Pending  →  you Approve  →  Xero invoice + email sent  →  track payment
                                 →  you Reject   →  rejection email sent
```

---

## 2. Logging in

1. Go to the dashboard URL and you'll be sent to the **login** page.
2. Enter your admin **email** and **password**.
3. You land on the **Dashboard** (summary cards).

> Forgot your password or need another admin account? That's done by the
> developer (admin accounts are created directly in the database). Ask them to
> reset it or add a new admin.

Use **Logout** (in the sidebar) when you're done, especially on a shared
computer.

---

## 3. The Dashboard (home)

After login you see four summary cards:

| Card | Meaning |
| --- | --- |
| **Total inquiries** | All submissions ever received. |
| **Pending review** | Waiting for your decision. |
| **Approved** | Accepted applicants. |
| **Rejected** | Declined applicants. |

Use the sidebar to move between **Dashboard**, **Inquiries**, and **Invoice
settings**.

---

## 4. Reviewing submissions (Inquiries)

Open **Inquiries** to see the full list (sortable, filterable, paginated).

### Status badges

Each row shows one status badge:

| Badge | What it means |
| --- | --- |
| **Pending** | New — needs your decision. |
| **Rejected** | You declined it. |
| **Approved** | You accepted it (no invoice activity yet). |
| **Approved · Invoicing** | Invoice is being created in Xero. |
| **Approved · Awaiting payment** | Invoice sent, not yet paid. |
| **Approved · Paid** | Invoice paid. |
| **Approved · Overdue** | Invoice past its due date. |
| **Approved · Invoice voided** | Invoice cancelled. |

You can **filter by status** (Pending / Approved / Rejected) to focus your work.

### Viewing details

Click a row's actions and choose **View** to see the artist's full profile —
bio, contact details, and their uploaded **profile photo + portfolio images**.
(Images are private; only logged-in admins can see them.)

### Approving

1. On a **Pending** row, open the actions menu and choose **Approve**.
2. The system will:
   - Create an **invoice in Xero** using your Invoice settings (price, currency,
     etc.).
   - **Email the artist** an approval message with a "View & pay invoice" link.
3. The badge moves to **Approved · Awaiting payment**.

> Approval only works on **Pending** submissions. Once approved or rejected, the
> decision is final (it can't be flipped back from the dashboard).

**Requirements for approval to fully work:**
- **Xero must be connected** (otherwise the invoice can't be created).
- **Gmail must be connected** for the email to send. If Gmail is disconnected,
  the approval and invoice still happen — only the email is skipped.

### Rejecting

1. On a **Pending** row, open the actions menu and choose **Reject**.
2. **Type a reason** (required, at least a few characters). This reason is
   included in the email sent to the artist.
3. The badge moves to **Rejected**.

> The rejection email is best-effort: if Gmail is disconnected or fails, the
> rejection is still recorded — only the email is skipped.

### Tracking payment

The system doesn't automatically know when an invoice is paid in Xero, so you
reconcile it by hand:

1. Check the invoice status in your **Xero** account.
2. Back in the dashboard, open the row's actions → **Payment**, and set the
   matching status: **Awaiting payment**, **Paid**, **Overdue**, or **Voided**.

This keeps the dashboard badge in sync with reality.

---

## 5. Invoice settings

Open **Invoice settings** in the sidebar. This page has three sections.

### Xero connection

Invoices can only be created while Xero is **Connected**.

- **Connect Xero** → opens Xero's consent screen → returns here showing
  "Connected · <your organisation>".
- **Reconnect** → re-authorize (e.g. after the connection expires).
- **Disconnect** → stops invoice creation until reconnected.

> The connection refreshes itself automatically while in use. If it sits unused
> for ~60 days it expires and you'll need to **Reconnect**.

### Email (Gmail)

Sends approval and rejection emails from your Google Workspace mailbox.

- **Connect Gmail** → opens Google's consent screen → returns showing
  "Connected · <mailbox>". That mailbox becomes the **From** address on all
  emails.
- **Reconnect** / **Disconnect** as needed.

> Approvals and rejections still work while Gmail is disconnected — the emails
> are simply not sent.

### Line item & tax

These defaults are applied to the single fee line on every generated invoice:

| Field | What it is |
| --- | --- |
| **Item description** | Text shown on the invoice line (e.g. "Market table fee"). |
| **Unit amount** | The price (a number, e.g. `440.00`). |
| **Currency** | 3-letter code, e.g. `AUD`, `USD`. |
| **Account code** | Your Xero account/ledger code the income posts to. |
| **Due in (days)** | How many days from issue until the invoice is due. |
| **Line amount types** | Whether the unit amount is tax-inclusive, exclusive, or no-tax (matches Xero's options). |
| **Tax type** | Xero tax code (e.g. `OUTPUT`). Leave blank for none. |

Click **Save settings**. Changes apply to **future** invoices only — already-
created invoices are not changed.

---

## 6. Where the artist form sends data

Artists don't use this dashboard — they fill in your public form, which sends
their submission to the platform automatically. The technical details of that
connection (the API) are in `docs/api-submit.md` (for whoever builds/maintains
the form). As the admin, you only ever see the results in **Inquiries**.

---

## 7. Common questions

**An artist says they didn't get the email.**
Check **Invoice settings → Email (Gmail)** shows *Connected*. If it was
disconnected at the time, the email was skipped — reconnect, then (for
approvals) the invoice link is also visible in Xero so you can resend manually.

**Approval failed / no invoice was created.**
Check **Invoice settings → Xero connection** shows *Connected*. If it expired,
click **Reconnect** and approve again.

**I approved/rejected the wrong one.**
Decisions are final in the dashboard. For an invoice mistake, void/correct it in
Xero and set the dashboard **Payment** status to **Voided**. For other fixes,
contact the developer.

**Can I change the email wording?**
The email text is set in the app's templates. Ask the developer to adjust the
approval/rejection wording.

**Who can log in?**
Only admin accounts created by the developer. There's no public sign-up.
