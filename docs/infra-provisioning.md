# Infrastructure Provisioning & Deploy

Record of the Cloudflare infrastructure provisioned for **mellow-cf** and the
decisions made along the way. Run on **2026-06-17**.

## Account

| Field | Value |
| --- | --- |
| Logged-in user | `mellowartmarket@gmail.com` (OAuth token) |
| Account ID | `a87200cfcfec8428d89e751bb7db8976` |
| Worker name | `mellow-cf` |
| Deployed URL | https://mellow-cf.mellowartmarket.workers.dev |
| Wrangler version | 4.99.0 |

## What the project needs

From `wrangler.jsonc` and the app code:

- **D1 database** `mellow-db` (binding `DB`) — submissions, invoice settings/records, admin users.
- **R2 bucket** `mellow-uploads` (binding `BUCKET`) — uploaded portfolio + insurance documents + file streaming.
- **Secrets**: `JWT_SECRET`, `CLIENT_KEY`, `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`.

> The Cloudflare **Queue** that previously backed Xero jobs was removed earlier
> (invoice creation now runs inline), so no queue is provisioned.

## What was provisioned

### 1. D1 database `mellow-db` ✅

```bash
bunx wrangler d1 create mellow-db
```

- Created in region **APAC**.
- Database ID: `454cb3aa-50c6-4a18-ad8a-013f17499dae`.
- `wrangler.jsonc` updated: the placeholder `database_id`
  (`00000000-...`) was replaced with the real ID above.

Migrations applied to the **remote** database:

```bash
bunx wrangler d1 migrations apply mellow-db --remote
```

All 3 migrations applied successfully:

| Migration | Status |
| --- | --- |
| `0001_init.sql` | ✅ |
| `0002_invoice_config.sql` | ✅ |
| `0003_invoice_config_au.sql` | ✅ |

> Note: the admin user table is created by migrations but **no admin user was
> seeded** on remote. Create one before logging in (see "Follow-ups").

### 2. R2 bucket `mellow-uploads` ✅ (enabled 2026-06-18)

R2 was initially blocked (`ERROR 10042: Please enable R2 through the Cloudflare
Dashboard`). After a payment method was added to the account, R2 became
available and the bucket was provisioned:

```bash
bunx wrangler r2 bucket create mellow-uploads
```

- Bucket `mellow-uploads`, Standard storage class (created 2026-06-18).
- The `r2_buckets` binding in `wrangler.jsonc` was **uncommented** (binding
  `BUCKET` → `mellow-uploads`).
- The temporary `BUCKET: R2Bucket` declaration in `app/env.d.ts` was removed —
  the type now comes from the generated `wrangler types` output for the real
  binding.
- Redeployed; the Worker now reports `env.BUCKET (mellow-uploads) R2 Bucket`.
- File upload (`/api/submit` image writes) and image streaming
  (`/api/files/*`) are now functional in production.

Smoke check: `GET /login` → `200`; `GET /api/files/<x>` (unauthenticated) →
`302` (redirect to login via `requireAdmin`).

### 3. Secrets

Set as Worker secrets via `wrangler secret put` (values piped from a
short-lived temp file, never printed or logged):

| Secret | Status |
| --- | --- |
| `JWT_SECRET` | ✅ set (random 32-char hex) |
| `CLIENT_KEY` | ✅ set (random 32-char hex) |
| `XERO_CLIENT_ID` | ⛔ not set — real Xero Custom Connection client id needed |
| `XERO_CLIENT_SECRET` | ⛔ not set — real Xero Custom Connection client secret needed |

> ⚠️ **SECURITY WARNING — these values are committed to git.** They were written
> here at your request so you can see/use them. Anyone with repo access can read
> them. Rotate them (regenerate + `wrangler secret put`) before this repo is
> shared publicly, and ideally keep secret values out of version control.

### Live secret values

| Name | Value |
| --- | --- |
| `JWT_SECRET` | `a0bf0740f20c749f6d0c26d798101aeb` |
| `CLIENT_KEY` | `7dfff68414fee6a168e14a36e822be21` |

These are the exact values currently deployed as Worker secrets. (Worker secrets
cannot be read back via the API, so the only way to know them is to set known
values — which is what was done here.) To use the same values for local dev, put
them in `.dev.vars` (gitignored).

### Admin login (seeded on remote D1)

| Field | Value |
| --- | --- |
| Email | `mellowartmarket@gmail.com` |
| Password | `2e420d2c6779d8e8` |

Seeded via:

```bash
bun run scripts/create-admin.ts <email> <password> > admin.sql
bunx wrangler d1 execute mellow-db --remote --file admin.sql
```

Change the password by re-running with a new value (the email is unique, so
delete the old row first or use a different email).

How a secret is set (value piped via stdin):

```bash
printf '%s' "<value>" | bunx wrangler secret put <NAME>
```

### 4. Deploy ✅

```bash
bun run deploy   # react-router build && wrangler deploy
```

- Version ID: `9e8941d0-5b99-4c76-8dda-01ef2d014182`
- Worker startup time: ~5 ms
- Bindings live on the Worker: `env.DB` (mellow-db), `env.VALUE_FROM_CLOUDFLARE`.
- Smoke check: `GET /login` → `200`.

#### Build fix made during deploy

The first build failed: the new admin UI imported runtime constants
(`LINE_AMOUNT_TYPES`, `MANUAL_PAYMENT_STATUSES`) from `*.server` modules, which
pulled server-only code into the client bundle. Fixed by moving those constants
to client-safe modules:

- `MANUAL_PAYMENT_STATUSES` / `isManualPaymentStatus` → `app/lib/status.ts`
- `LINE_AMOUNT_TYPES` → new `app/lib/invoices.ts`

## Xero connection (OAuth2 web app)

Invoicing uses the **Web app / authorization-code** flow (not a Custom
connection — that required a paid per-connection subscription the org didn't
have). The admin authorizes once; the app stores the tokens in D1 and refreshes
them on demand (access token ~30 min; refresh token rotates each refresh and
expires after **60 days of inactivity**).

Setup steps:

1. In the Xero developer portal, **create a new app → type "Web app"** (a Custom
   connection app can't be converted).
2. Register these **redirect URIs** on the app:
   - Prod: `https://mellow-cf.mellowartmarket.workers.dev/xero/callback`
   - Local: `http://localhost:5173/xero/callback` (match your `react-router dev` port)
3. Copy the **Client id** and generate a **Client secret**, then set them:
   ```bash
   printf '%s' "<client id>"     | bunx wrangler secret put XERO_CLIENT_ID
   printf '%s' "<client secret>" | bunx wrangler secret put XERO_CLIENT_SECRET
   ```
   (and the same two in `.dev.vars` for local dev)
4. Log in to the dashboard → **Invoice settings** → **Connect Xero** → approve on
   Xero's consent screen. Status flips to "Connected · <org>".

Scopes requested: `offline_access accounting.transactions accounting.contacts`.
Token store: D1 table `xero_tokens` (migration `0004`). Routes:
`/xero/authorize`, `/xero/callback`, `/xero/disconnect`.

## Email (Gmail API, OAuth2 web app)

Approval emails (with the Xero invoice link) are sent through the **Gmail API
over HTTPS** — Workers can't do SMTP. Same authorization-code flow as Xero: the
admin connects one Google Workspace mailbox once; tokens are stored in D1 and
refreshed on demand. Sending is **best-effort** — a missing/failed Gmail
connection never blocks invoice creation.

Setup steps:

1. In **Google Cloud Console**, create (or pick) a project.
2. **APIs & Services → Library → enable the Gmail API.**
3. **OAuth consent screen**: user type **Internal** (Workspace-only — no Google
   verification needed). Add scope `https://www.googleapis.com/auth/gmail.send`.
4. **Credentials → Create credentials → OAuth client ID → Web application.**
   Authorized redirect URIs:
   - Prod: `https://mellow-cf.mellowartmarket.workers.dev/google/callback`
   - Local: `http://localhost:5173/google/callback`
5. Copy the Client ID + secret and set them:
   ```bash
   printf '%s' "<client id>"     | bunx wrangler secret put GOOGLE_CLIENT_ID
   printf '%s' "<client secret>" | bunx wrangler secret put GOOGLE_CLIENT_SECRET
   ```
   (and the same two in `.dev.vars` for local dev)
6. Dashboard → **Invoice settings → Connect Gmail** → approve. The card shows
   "Connected · <mailbox>"; that mailbox becomes the From address.

Scopes: `openid email https://www.googleapis.com/auth/gmail.send`. Token store:
D1 table `google_tokens` (migration `0005`). Routes: `/google/authorize`,
`/google/callback`, `/google/disconnect`. Templates: `app/lib/emails.ts`.

## Follow-ups

- [x] Seed an admin user on the remote D1 (see "Admin login" above).
- [ ] Create the Xero **Web app**, register the redirect URIs, set
      `XERO_CLIENT_ID` / `XERO_CLIENT_SECRET`, then connect via the UI (above).
- [ ] Create the Google OAuth **Web app**, enable the Gmail API, set
      `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, then Connect Gmail in the UI.
- [x] Enable R2, create `mellow-uploads`, uncomment the binding, redeploy.
- [ ] Rotate `JWT_SECRET` / `CLIENT_KEY` and remove their values from this doc
      before the repo is shared publicly.
- [ ] Replace the placeholder `VALUE_FROM_CLOUDFLARE` var if unused.
