import { env } from "cloudflare:workers";

import type { Route } from "./+types/api.summary";
import { requireAdmin } from "~/lib/auth.server";
import { getDashboardData } from "~/lib/summary.server";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const eventId = new URL(request.url).searchParams.get("event") || null;
  return Response.json(await getDashboardData(env.DB, eventId));
}
