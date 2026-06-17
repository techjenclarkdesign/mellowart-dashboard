// Augments the generated `Cloudflare.Env` with secrets/vars we reference in
// code before they exist as bindings. Keep these in sync with `wrangler.jsonc`
// and `wrangler secret put`.
declare namespace Cloudflare {
  interface Env {
    /**
     * R2 bucket for uploaded images. The `r2_buckets` binding in wrangler.jsonc
     * is temporarily commented out because R2 is not yet enabled on the account
     * (Cloudflare API error 10042). Declared here so type-checking stays green;
     * at runtime `env.BUCKET` is undefined until R2 is enabled and the binding
     * is restored. See docs/infra-provisioning.md.
     */
    BUCKET: R2Bucket;
    /** JWT signing secret — `wrangler secret put JWT_SECRET` */
    JWT_SECRET: string;
    /** Shared secret for the public submit API — `wrangler secret put CLIENT_KEY` */
    CLIENT_KEY: string;
    /** Xero web-app (OAuth2) client id — `wrangler secret put XERO_CLIENT_ID` */
    XERO_CLIENT_ID: string;
    /** Xero web-app (OAuth2) client secret — `wrangler secret put XERO_CLIENT_SECRET` */
    XERO_CLIENT_SECRET: string;
    // Invoice currency/amount/account/tax now live in the `invoice_settings` table.
  }
}
