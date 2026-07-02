# Artist Application API

Public endpoint for submitting an artist application (text fields + documents).
This is the integration point for an external site/form (e.g. Webflow) to push
applications into the Mellow Art dashboard.

## Endpoint

```
POST https://mellow-cf.mellowartmarket.workers.dev/api/submit
```

- **Method:** `POST` only (any other method → `405`).
- **Content-Type:** `multipart/form-data` (required — JSON is not accepted).
- **Auth:** send the shared secret in the `X-Client-Key` header.

```
X-Client-Key: <CLIENT_KEY>
```

The key is a Worker secret (`CLIENT_KEY`). Ask the dashboard owner for the value
— do not hard-code it in client-side/browser code, because anyone who can read
the page can read the key. Call this endpoint from a server/backend you control.

## Request fields

All sent as `multipart/form-data` parts.

### Text fields

| Field | Required | Rules |
| --- | --- | --- |
| `firstName` | ✅ | 1–100 chars |
| `lastName` | ✅ | 1–100 chars |
| `email` | ✅ | valid email, ≤320 chars |
| `confirmEmail` | optional | re-enter email — if sent, must equal `email` (case-insensitive); never stored |
| `appliedBefore` | ✅ | 1–50 chars (e.g. "Yes" / "No") |
| `brandName` | ✅ | 1–200 chars |
| `website` | ✅ | 1–300 chars (send `N/A` if none) |
| `instagram` | ✅ | 1–120 chars (e.g. `@brand`) |
| `bio` | ✅ | 1–5000 chars **and 200–400 words** |
| `primaryCategory` | ✅ | 1–100 chars |
| `secondaryCategory` | ✅ | 1–100 chars |
| `productDescription` | ✅ | 1–2000 chars |
| `additionalNotes` | optional | ≤5000 chars |
| `firstStallPreference` | ✅ | 1–100 chars — chosen stall's **slug** (see below) |
| `secondStallPreference` | ✅ | 1–100 chars — chosen stall's **slug** (see below) |
| `offerMiniIfUnavailable` | ✅ | 1–50 chars (e.g. "Yes" / "No") |
| `sharingStall` | ✅ | 1–50 chars (e.g. "Yes" / "No") |
| `hasInsurance` | ✅ | 1–50 chars (e.g. "Yes" / "No") |
| `consentDebut` | ✅ | must be truthy — `true` / `on` / `1` / `yes` |
| `consentSharing` | ✅ | must be truthy — `true` / `on` / `1` / `yes` |
| `consentSetupGuide` | ✅ | must be truthy — `true` / `on` / `1` / `yes` |
| `eventSlug` | optional | event **slug** (Webflow Item ID / local id also accepted) — see below |

### Shared-stall second artist ("buddy")

Only sent when the applicant answers **Yes** to `sharingStall` (the form's
conditional "buddy" section). All are **optional** on the API — send them when
sharing, omit them otherwise. They mirror the main applicant's text fields.

| Field | Webflow field | Rules |
| --- | --- | --- |
| `secondFirstName` | `buddy-first-name` | 1–100 chars |
| `secondLastName` | `buddy-last-name` | 1–100 chars |
| `secondEmail` | `buddy-email-01` | valid email, ≤320 chars |
| `secondAppliedBefore` | `buddy-first-timer` | 1–50 chars |
| `secondBrandName` | `buddy-brand-name` | 1–200 chars |
| `secondWebsite` | `buddy-website` | 1–300 chars |
| `secondInstagram` | `buddy-instagram` | 1–120 chars |
| `secondBio` | `buddy-artist-bio` | 1–5000 chars (no word-count check) |
| `secondPrimaryCategory` | `buddy-category-01` | 1–100 chars |
| `secondSecondaryCategory` | `buddy-category-02` | 1–100 chars |
| `secondProductDescription` | `buddy-product-info` | 1–2000 chars |

The buddy "confirm email" (`buddy-email-02`) is a client-side check only — do
not send it; it is never stored.

Notes:
- `bio` has **two** checks: a character cap (≤5000) and a **word count of
  200–400 words** (words = whitespace-separated tokens). Both must pass.
- The three consent flags are mandatory and must be truthy. Accepted truthy
  strings: `true`, `on`, `1`, `yes` (case-insensitive). Anything else counts as
  `false` and the request is rejected.
- `confirmEmail` is the form's "re-enter email" field. It's only checked when
  present and is never saved; the row stores `email` only.

### Stall preferences (`firstStallPreference` / `secondStallPreference`)

These are the applicant's **wishes**, sent as stall **slugs** (the same slugs
configured per event under **Events → Stall options**, e.g. `mini`, `standard`,
`flagship`, `mini-debut`, `standard-debut`, `flagship-debut`).

- They are **stored as the raw slug** and resolved to a readable tier label in
  the dashboard at view time, scoped to the matched event. An unrecognised slug
  is not an error — it's stored and shown as-is.
- A preference is **not** the same as the assigned/billed stall. The admin still
  assigns the actual stall (which sets the invoice price) inside the dashboard;
  the assignment starts empty.

### Event scoping (`eventSlug`)

Optional. Pass the event's **slug** (e.g. `mellow-debut-2025`, the same slug
configured under **Events**) — the event's **Webflow Item ID** (e.g.
`6a223b24e44ab35ad710df07`) or the dashboard's own event id are also accepted —
so the application is filed under that event in the dashboard.

- The event must already exist in the dashboard (created under **Events**).
  An **unknown or missing** `eventSlug` is **not** an error — the application is
  accepted and simply left unassigned, and an admin can scope it later.
- The legacy field names `webflow_id` and `event` are still accepted as aliases
  for `eventSlug`.

### Document files

| Field | Required | Count | Per-file rules |
| --- | --- | --- | --- |
| `portfolio` | ✅ | exactly 1 | 1-page A4 portfolio (PDF or image) — see below |
| `insurance` | optional | 0 or 1 | Certificate of Currency (PDF or image) |
| `secondPortfolio` | optional | 0 or 1 | Second artist's portfolio (`buddy-portfolio-file`), shared stall only |

Per-file rules (apply to both):

- **Allowed types:** `application/pdf`, `image/jpeg`, `image/png`, `image/webp`,
  `image/avif`, `image/gif`. The check is on the part's MIME type — set it
  correctly.
- **Max size:** 10 MB per file.
- Empty (0-byte) files are rejected. A 0-byte `insurance` part is treated as "no
  file".

> Note: the recommended filename convention `[BRANDNAME]_portfolio2512` is **not
> enforced** by the API — it's a guideline for applicants only.

## Responses

### Success — `201 Created`

```json
{ "ok": true, "id": "ART-8F5550F2" }
```

`id` is the application reference (`ART-` + 8 hex chars). It's the reference used
on the invoice and in confirmation/approval/rejection emails.

### Errors

| Status | Body | Meaning |
| --- | --- | --- |
| `401` | `{ "error": "Unauthorized" }` | Missing/wrong `X-Client-Key`. |
| `400` | `{ "error": "Expected multipart/form-data" }` | Body wasn't multipart. |
| `422` | `{ "error": "Email addresses do not match" }` | `confirmEmail` sent but ≠ `email`. |
| `422` | `{ "error": "Validation failed", "issues": { ... } }` | Text fields failed zod validation. `issues` is a zod flatten (`formErrors` + `fieldErrors`). |
| `422` | `{ "error": "Bio must be 200–400 words" }` | Bio word count out of range. |
| `422` | `{ "error": "A portfolio document is required" }` | Missing/empty `portfolio`. |
| `422` | `{ "error": "<filename>: Unsupported file type: <type> (PDF or image only)" }` | A file failed the type/size/empty check. |
| `405` | `{ "error": "Method not allowed" }` | Used a method other than POST. |

## Example — cURL

```bash
curl -X POST https://mellow-cf.mellowartmarket.workers.dev/api/submit \
  -H "X-Client-Key: $CLIENT_KEY" \
  -F "firstName=Aria" \
  -F "lastName=Tester" \
  -F "email=artist@example.com" \
  -F "confirmEmail=artist@example.com" \
  -F "appliedBefore=No" \
  -F "brandName=Aria Studio" \
  -F "website=https://ariastudio.com" \
  -F "instagram=@ariastudio" \
  -F "bio=<200-400 word bio here>" \
  -F "primaryCategory=Painting" \
  -F "secondaryCategory=Illustration" \
  -F "productDescription=Original paintings and prints" \
  -F "firstStallPreference=standard" \
  -F "secondStallPreference=mini" \
  -F "offerMiniIfUnavailable=Yes" \
  -F "sharingStall=No" \
  -F "hasInsurance=Yes" \
  -F "consentDebut=true" \
  -F "consentSharing=true" \
  -F "consentSetupGuide=true" \
  -F "eventSlug=mellow-debut-2025" \
  -F "portfolio=@portfolio.pdf;type=application/pdf" \
  -F "insurance=@insurance.pdf;type=application/pdf"
```

## Example — JavaScript (`fetch` + `FormData`)

Run this from a server you control (so the key stays secret).

```js
const form = new FormData();
form.set("firstName", "Aria");
form.set("lastName", "Tester");
form.set("email", "artist@example.com");
form.set("confirmEmail", "artist@example.com");  // optional re-enter check
form.set("appliedBefore", "No");
form.set("brandName", "Aria Studio");
form.set("website", "https://ariastudio.com");   // "N/A" if none
form.set("instagram", "@ariastudio");
form.set("bio", bioText);                         // 200–400 words
form.set("primaryCategory", "Painting");
form.set("secondaryCategory", "Illustration");
form.set("productDescription", "Original paintings and prints");
form.set("firstStallPreference", "standard");     // stall slug
form.set("secondStallPreference", "mini");        // stall slug
form.set("offerMiniIfUnavailable", "Yes");
form.set("sharingStall", "No");
form.set("hasInsurance", "Yes");
form.set("consentDebut", "true");
form.set("consentSharing", "true");
form.set("consentSetupGuide", "true");
form.set("eventSlug", "mellow-debut-2025"); // optional: scope to event

// Files (Blob/File with a correct type).
form.set("portfolio", portfolioFile, "portfolio.pdf");      // required
if (insuranceFile) form.set("insurance", insuranceFile, "insurance.pdf"); // optional

const res = await fetch(
  "https://mellow-cf.mellowartmarket.workers.dev/api/submit",
  {
    method: "POST",
    headers: { "X-Client-Key": process.env.CLIENT_KEY },
    body: form, // do NOT set Content-Type — fetch sets the multipart boundary
  },
);

const data = await res.json();
if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
console.log("Application id:", data.id);
```

> Don't set the `Content-Type` header manually when using `FormData` — the
> runtime adds it with the correct multipart boundary. Setting it yourself
> breaks parsing and yields a `400`.

## What happens after submit

1. Documents are stored privately in R2 (`mellow-uploads`); a row is written to
   D1 (linked to the event if `eventSlug` matched). Stall preferences are saved
   as slugs.
2. A **confirmation email** is sent to the applicant (best-effort — a mail
   failure never fails the submission).
3. The application appears in the dashboard with application status **pending**
   and payment status **not sent**.
4. An admin sets the application status — **Accepted**, **Waitlisted**, or
   **Rejected** (rejecting emails the applicant with the reason).
5. Once **Accepted**, the admin assigns the **stall** (event-scoped; the stall's
   price is the invoice amount), then clicks **Send invoice** — this creates the
   Xero invoice and emails the applicant a pay-invoice link. Payment status is
   tracked separately (Awaiting payment → Paid, etc.).

The API response only confirms the application was accepted (`201` + `id`); all
review, stall, invoicing, and email steps happen later in the dashboard.
