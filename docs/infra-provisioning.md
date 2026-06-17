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
- **R2 bucket** `mellow-uploads` (binding `BUCKET`) — uploaded profile/portfolio images + image streaming.
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

### 2. R2 bucket `mellow-uploads` ⛔ blocked

R2 is **not enabled** on this account:

```
bunx wrangler r2 bucket list
→ ERROR 10042: Please enable R2 through the Cloudflare Dashboard.
```

**Decision (chosen by user): deploy now without R2.**

- The `r2_buckets` binding in `wrangler.jsonc` was **commented out** so the
  Worker could deploy.
- A `BUCKET: R2Bucket` declaration was added to `app/env.d.ts` so type-checking
  stays green. At runtime `env.BUCKET` is `undefined` until R2 is restored.
- **Consequence:** file upload (`/api/submit` image writes) and image streaming
  (`/api/files/*`) routes will fail at runtime until R2 is enabled.

To restore R2 later:

```bash
# 1. Enable R2 in the Cloudflare dashboard (Dashboard → R2 → Enable; may
#    require adding a payment method).
# 2. Create the bucket:
bunx wrangler r2 bucket create mellow-uploads
# 3. Uncomment the r2_buckets block in wrangler.jsonc.
# 4. Redeploy:
bun run deploy
```

### 3. Secrets

Set as Worker secrets via `wrangler secret put` (values piped from a
short-lived temp file, never printed or logged):

| Secret | Value | Status |
| --- | --- | --- |
| `JWT_SECRET` | random 32-char hex (`openssl rand -hex 16`) | ✅ set |
| `CLIENT_KEY` | random 32-char hex (`openssl rand -hex 16`) | ✅ set |
| `XERO_CLIENT_ID` | real Xero Custom Connection client id | ⛔ not set |
| `XERO_CLIENT_SECRET` | real Xero Custom Connection client secret | ⛔ not set |

How the random secrets were generated and stored (value never echoed):

```bash
umask 077; openssl rand -hex 16 | tr -d '\n' > /tmp/secret
bunx wrangler secret put <NAME> < /tmp/secret
rm -f /tmp/secret
```

> **The actual secret values are intentionally NOT recorded in this doc**, since
> `docs/` is committed to git. They live only as encrypted Worker secrets. To
> rotate, re-run the command above. To use the same value locally, set it in
> `.dev.vars` (gitignored).

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

## Follow-ups

- [ ] Enable R2, create `mellow-uploads`, uncomment the binding, redeploy.
- [ ] Set `XERO_CLIENT_ID` and `XERO_CLIENT_SECRET` (real Xero credentials)
      before invoice creation will work.
- [ ] Seed an admin user on the remote D1 so someone can log in, e.g.:
      `bunx wrangler d1 execute mellow-db --remote --command "<INSERT admin>"`.
- [ ] Replace the placeholder `VALUE_FROM_CLOUDFLARE` var if unused.
