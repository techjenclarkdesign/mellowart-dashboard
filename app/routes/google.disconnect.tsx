import { env } from "cloudflare:workers";
import { redirect } from "react-router";

import type { Route } from "./+types/google.disconnect";
import { requireAdmin } from "~/lib/auth.server";
import { clearGoogleTokens } from "~/lib/google-tokens.server";

/** Forget the stored Gmail connection. */
export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  await clearGoogleTokens(env.DB);
  return redirect("/invoice-settings?google=disconnected");
}
