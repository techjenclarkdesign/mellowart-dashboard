import { createCookie } from "react-router";

/**
 * Short-lived CSRF `state` cookie for the Google OAuth2 round-trip. Set on
 * /google/authorize, verified on /google/callback.
 */
export const googleStateCookie = createCookie("__google_oauth_state", {
  httpOnly: true,
  secure: import.meta.env.PROD,
  sameSite: "lax",
  path: "/",
  maxAge: 600,
});

/** Absolute callback URL; must match a redirect URI on the Google OAuth client. */
export function googleCallbackRedirectUri(request: Request): string {
  return new URL("/google/callback", request.url).toString();
}
