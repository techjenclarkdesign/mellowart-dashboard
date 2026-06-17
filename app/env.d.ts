// Augments the generated `Cloudflare.Env` with secrets/vars we reference in
// code before they exist as bindings. Keep these in sync with `wrangler.jsonc`
// and `wrangler secret put`.
declare namespace Cloudflare {
  interface Env {
    /** Xero webhook signing key — `wrangler secret put XERO_WEBHOOK_KEY` */
    XERO_WEBHOOK_KEY: string;
    /** JWT signing secret — `wrangler secret put JWT_SECRET` */
    JWT_SECRET: string;
    /** Shared secret for the public submit API — `wrangler secret put CLIENT_KEY` */
    CLIENT_KEY: string;
    /** Xero Custom Connection client id — `wrangler secret put XERO_CLIENT_ID` */
    XERO_CLIENT_ID: string;
    /** Xero Custom Connection client secret — `wrangler secret put XERO_CLIENT_SECRET` */
    XERO_CLIENT_SECRET: string;
    // Invoice currency/amount/account/tax now live in the `invoice_settings` table.
  }
}
