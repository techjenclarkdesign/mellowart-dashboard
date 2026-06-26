# Artist Submission API

Public endpoint for submitting an artist profile (text fields + images). This is
the integration point for an external site/form to push submissions into the
Mellow Art dashboard.

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
| `phone` | ✅ | 3–40 chars |
| `bio` | ✅ | 1–5000 chars **and 200–400 words** |
| `primaryMedium` | ✅ | 1–100 chars (e.g. "Painting") |
| `styleCategory` | ✅ | 1–100 chars (e.g. "Abstract") |
| `location` | ✅ | 1–100 chars |
| `socialLink` | optional | ≤300 chars |
| `customOrders` | optional | ≤100 chars |
| `additionalNotes` | optional | ≤5000 chars |
| `webflow_id` | optional | event **Webflow Item ID** (slug / local id also accepted) — see below |
| `stall_slug` | optional | chosen stall's **slug**, scoped to the event — see below |
| `consentImages` | ✅ | must be truthy — `true` / `on` / `1` / `yes` |
| `consentPurpose` | ✅ | must be truthy — `true` / `on` / `1` / `yes` |

Notes:
- `bio` has **two** checks: a character cap (≤5000) and a **word count of
  200–400 words** (words = whitespace-separated tokens). Both must pass.
- Both consent flags are mandatory and must be truthy. Accepted truthy strings:
  `true`, `on`, `1`, `yes` (case-insensitive). Anything else counts as `false`
  and the request is rejected.

### Event scoping (`webflow_id`)

Optional. Pass the event's **Webflow Item ID** (e.g.
`6a223b24e44ab35ad710df07`) — its **slug** (e.g.
`mellow-art-stationery-fair-mel-01`) or the dashboard's own event id are also
accepted — so the submission is filed under that event in the dashboard.

- The event must already exist in the dashboard (created under **Events**).
  An **unknown or missing** `webflow_id` is **not** an error — the submission is
  accepted and simply left unassigned, and an admin can scope it later.
- Matching is by Webflow Item ID, slug, or the dashboard's own event id.
- The legacy field name `event` is still accepted as an alias for `webflow_id`.

### Stall pre-selection (`stall_slug`)

Optional. Pass the chosen stall's **slug** (configured per event under **Events →
Stall options**) so the submission arrives with its stall already attached. The
stall's price is the amount Xero charges when the applicant is later invoiced.

- Stall slugs are only **unique within an event**, so `stall_slug` is resolved
  **against the matched event**. It is ignored unless a valid `webflow_id`
  resolved an event.
- An **unknown or missing** `stall_slug` is **not** an error — the submission is
  accepted with no stall, and an admin assigns one later (the original flow).
- A pre-attached stall is still editable by an admin before invoicing.

### Image files

| Field | Required | Count | Per-file rules |
| --- | --- | --- | --- |
| `profilePhoto` | ✅ | exactly 1 | see below |
| `portfolioImages` | ✅ | 3–15 (repeat the field once per image) | see below |

Per-file rules (apply to every image):

- **Allowed types:** `image/jpeg`, `image/png`, `image/webp`, `image/avif`,
  `image/gif`. The check is on the part's MIME type — set it correctly.
- **Max size:** 10 MB per file.
- Empty (0-byte) files are rejected.

To send multiple portfolio images, include the `portfolioImages` part multiple
times (same field name, one per file).

## Responses

### Success — `201 Created`

```json
{ "ok": true, "id": "ART-8F5550F2" }
```

`id` is the submission reference (`ART-` + 8 hex chars). It's the reference used
on the invoice and in approval/rejection emails.

### Errors

| Status | Body | Meaning |
| --- | --- | --- |
| `401` | `{ "error": "Unauthorized" }` | Missing/wrong `X-Client-Key`. |
| `400` | `{ "error": "Expected multipart/form-data" }` | Body wasn't multipart. |
| `422` | `{ "error": "Validation failed", "issues": { ... } }` | Text fields failed zod validation. `issues` is a zod flatten (`formErrors` + `fieldErrors`). |
| `422` | `{ "error": "Bio must be 200–400 words" }` | Bio word count out of range. |
| `422` | `{ "error": "A profile photo is required" }` | Missing/empty `profilePhoto`. |
| `422` | `{ "error": "At least 3 portfolio images are required" }` | Too few portfolio images. |
| `422` | `{ "error": "At most 15 portfolio images are allowed" }` | Too many portfolio images. |
| `422` | `{ "error": "<filename>: Unsupported image type: <type>" }` | A file failed the type/size/empty check. |
| `405` | `{ "error": "Method not allowed" }` | Used a method other than POST. |

## Example — cURL

```bash
curl -X POST https://mellow-cf.mellowartmarket.workers.dev/api/submit \
  -H "X-Client-Key: $CLIENT_KEY" \
  -F "firstName=Aria" \
  -F "lastName=Tester" \
  -F "email=artist@example.com" \
  -F "phone=+62 812 0000 0000" \
  -F "bio=<200-400 word bio here>" \
  -F "primaryMedium=Painting" \
  -F "styleCategory=Abstract" \
  -F "location=Jakarta, Indonesia" \
  -F "socialLink=https://instagram.com/artist" \
  -F "webflow_id=6a223b24e44ab35ad710df07" \
  -F "stall_slug=standard" \
  -F "consentImages=true" \
  -F "consentPurpose=true" \
  -F "profilePhoto=@profile.webp;type=image/webp" \
  -F "portfolioImages=@p1.webp;type=image/webp" \
  -F "portfolioImages=@p2.webp;type=image/webp" \
  -F "portfolioImages=@p3.webp;type=image/webp"
```

## Example — JavaScript (`fetch` + `FormData`)

Run this from a server you control (so the key stays secret).

```js
const form = new FormData();
form.set("firstName", "Aria");
form.set("lastName", "Tester");
form.set("email", "artist@example.com");
form.set("phone", "+62 812 0000 0000");
form.set("bio", bioText);                 // 200–400 words
form.set("primaryMedium", "Painting");
form.set("styleCategory", "Abstract");
form.set("location", "Jakarta, Indonesia");
form.set("socialLink", "https://instagram.com/artist"); // optional
form.set("webflow_id", "6a223b24e44ab35ad710df07");     // optional: scope to event
form.set("stall_slug", "standard");                     // optional: pre-select stall
form.set("consentImages", "true");
form.set("consentPurpose", "true");

// Files (Blob/File with a correct type). 1 profile + 3–15 portfolio.
form.set("profilePhoto", profileFile, "profile.webp");
for (const file of portfolioFiles) {
  form.append("portfolioImages", file, file.name);  // append = repeat the field
}

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
console.log("Submission id:", data.id);
```

> Don't set the `Content-Type` header manually when using `FormData` — the
> runtime adds it with the correct multipart boundary. Setting it yourself
> breaks parsing and yields a `400`.

## What happens after submit

1. Images are stored privately in R2 (`mellow-uploads`); a row is written to D1
   (linked to the event if `webflow_id` matched, and to the stall if `stall_slug`
   matched within that event).
2. The submission appears in the dashboard with application status **pending**
   and payment status **not sent**.
3. An admin sets the application status — **Accepted**, **Waitlisted**, or
   **Rejected** (rejecting emails the applicant with the reason).
4. Once **Accepted**, the admin confirms the **stall** (already attached if
   `stall_slug` was sent, otherwise assigned here; event-scoped, the stall's
   price is the invoice amount), then clicks **Send invoice** — this creates the
   Xero invoice and emails the applicant a pay-invoice link. Payment status is
   tracked separately (Awaiting payment → Paid, etc.).

The API response only confirms the submission was accepted (`201` + `id`); all
review, stall, invoicing, and email steps happen later in the dashboard.
