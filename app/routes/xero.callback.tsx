import { env } from "cloudflare:workers";
import { redirect } from "react-router";

import type { Route } from "./+types/xero.callback";
import { requireAdmin } from "~/lib/auth.server";
import {
  exchangeCodeForTokens,
  getConnections,
} from "~/lib/xero-client.server";
import { callbackRedirectUri, xeroStateCookie } from "~/lib/xero-oauth.server";
import { saveXeroTokens } from "~/lib/xero-tokens.server";

/**
 * Xero redirects back here after consent. Verify the `state`, exchange the
 * code for tokens, resolve the tenant, persist, and bounce to the settings UI.
 */
export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);

  const url = new URL(request.url);
  const clear = await xeroStateCookie.serialize("", { maxAge: 0 });
  const back = (status: string) =>
    redirect(`/invoice-settings?xero=${status}`, {
      headers: { "Set-Cookie": clear },
    });

  if (url.searchParams.get("error")) return back("error");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = (await xeroStateCookie.parse(
    request.headers.get("Cookie"),
  )) as string | null;

  if (!code || !state || !cookieState || state !== cookieState) {
    return back("error");
  }

  try {
    const tokens = await exchangeCodeForTokens(
      env,
      code,
      callbackRedirectUri(request),
    );
    const conns = await getConnections(tokens.access_token);
    if (!conns.length) return back("error");

    const tenant = conns[0];
    await saveXeroTokens(env.DB, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
      tenantId: tenant.tenantId,
      tenantName: tenant.tenantName,
    });
    return back("connected");
  } catch (err) {
    console.error("Xero callback failed", err);
    return back("error");
  }
}
