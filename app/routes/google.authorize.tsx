import { env } from "cloudflare:workers";
import { redirect } from "react-router";

import type { Route } from "./+types/google.authorize";
import { requireAdmin } from "~/lib/auth.server";
import { buildGoogleAuthorizeUrl } from "~/lib/gmail.server";
import {
  googleCallbackRedirectUri,
  googleStateCookie,
} from "~/lib/google-oauth.server";

/** Start the Google OAuth2 consent flow for Gmail sending. */
export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);

  const state = crypto.randomUUID();
  const url = buildGoogleAuthorizeUrl(env, {
    state,
    redirectUri: googleCallbackRedirectUri(request),
  });

  return redirect(url, {
    headers: { "Set-Cookie": await googleStateCookie.serialize(state) },
  });
}
