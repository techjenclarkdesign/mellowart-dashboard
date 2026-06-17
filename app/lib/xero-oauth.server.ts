import { createCookie } from "react-router";

/**
 * Short-lived CSRF `state` cookie for the Xero OAuth2 round-trip. Set when we
 * redirect to Xero (/xero/authorize), verified on return (/xero/callback).
 */
export const xeroStateCookie = createCookie("__xero_oauth_state", {
  httpOnly: true,
  secure: import.meta.env.PROD,
  sameSite: "lax",
  path: "/",
  maxAge: 600, // 10 minutes — long enough to complete consent
});

/**
 * Absolute callback URL derived from the incoming request. Must match a
 * redirect URI registered on the Xero app exactly (scheme + host + path).
 */
export function callbackRedirectUri(request: Request): string {
  return new URL("/xero/callback", request.url).toString();
}
