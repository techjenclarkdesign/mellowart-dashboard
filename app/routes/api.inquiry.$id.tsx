import { env } from "cloudflare:workers";

import type { Route } from "./+types/api.inquiry.$id";
import { requireAdmin } from "~/lib/auth.server";
import { getSubmissionDetail } from "~/lib/submissions.server";

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAdmin(request);
  const detail = await getSubmissionDetail(env.DB, params.id);
  if (!detail) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(detail);
}
