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
| `consentImages` | ✅ | must be truthy — `true` / `on` / `1` / `yes` |
| `consentPurpose` | ✅ | must be truthy — `true` / `on` / `1` / `yes` |

Notes:
- `bio` has **two** checks: a character cap (≤5000) and a **word count of
  200–400 words** (words = whitespace-separated tokens). Both must pass.
- Both consent flags are mandatory and must be truthy. Accepted truthy strings:
  `true`, `on`, `1`, `yes` (case-insensitive). Anything else counts as `false`
  and the request is rejected.

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

1. Images are stored privately in R2 (`mellow-uploads`); a row is written to D1.
2. The submission appears in the dashboard as **pending**.
3. An admin **approves** (creates a Xero invoice + emails the applicant a
   pay-invoice link) or **rejects** (emails the applicant with the reason).

The API response only confirms the submission was accepted (`201` + `id`); the
approval/rejection decision and emails happen later in the dashboard.
