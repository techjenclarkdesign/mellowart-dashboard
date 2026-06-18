// Augments the generated `Cloudflare.Env` with secrets/vars we reference in
// code before they exist as bindings. Keep these in sync with `wrangler.jsonc`
// and `wrangler secret put`.
declare namespace Cloudflare {
  interface Env {
    // BUCKET (R2 `mellow-uploads`) is a real binding now — its type comes from
    // the generated `wrangler types` output, so no manual declaration needed.
    /** JWT signing secret — `wrangler secret put JWT_SECRET` */
    JWT_SECRET: string;
    /** Shared secret for the public submit API — `wrangler secret put CLIENT_KEY` */
    CLIENT_KEY: string;
    /** Xero web-app (OAuth2) client id — `wrangler secret put XERO_CLIENT_ID` */
    XERO_CLIENT_ID: string;
    /** Xero web-app (OAuth2) client secret — `wrangler secret put XERO_CLIENT_SECRET` */
    XERO_CLIENT_SECRET: string;
    /** Google OAuth2 client id (Gmail send) — `wrangler secret put GOOGLE_CLIENT_ID` */
    GOOGLE_CLIENT_ID: string;
    /** Google OAuth2 client secret (Gmail send) — `wrangler secret put GOOGLE_CLIENT_SECRET` */
    GOOGLE_CLIENT_SECRET: string;
    // Invoice currency/amount/account/tax now live in the `invoice_settings` table.
  }
}
