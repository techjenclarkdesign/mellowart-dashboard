import { env } from "cloudflare:workers";
import { redirect } from "react-router";

import type { Route } from "./+types/xero.authorize";
import { requireAdmin } from "~/lib/auth.server";
import { buildAuthorizeUrl } from "~/lib/xero-client.server";
import { callbackRedirectUri, xeroStateCookie } from "~/lib/xero-oauth.server";

/**
 * Kicks off the Xero OAuth2 consent flow: set a CSRF `state` cookie and
 * redirect the admin to Xero's authorize endpoint.
 */
export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);

  const state = crypto.randomUUID();
  const url = buildAuthorizeUrl(env, {
    state,
    redirectUri: callbackRedirectUri(request),
  });

  return redirect(url, {
    headers: { "Set-Cookie": await xeroStateCookie.serialize(state) },
  });
}
