import { env } from "cloudflare:workers";

import type { Route } from "./+types/api.summary";
import { requireAdmin } from "~/lib/auth.server";
import { getInquirySummary } from "~/lib/summary.server";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  return Response.json(await getInquirySummary(env.DB));
}
