import { env } from "cloudflare:workers";
import { redirect } from "react-router";

import type { Route } from "./+types/xero.disconnect";
import { requireAdmin } from "~/lib/auth.server";
import { clearXeroTokens } from "~/lib/xero-tokens.server";

/** Forget the stored Xero connection. The admin can re-authorize anytime. */
export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  await clearXeroTokens(env.DB);
  return redirect("/invoice-settings?xero=disconnected");
}
