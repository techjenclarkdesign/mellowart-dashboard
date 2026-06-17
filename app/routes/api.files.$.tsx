import { env } from "cloudflare:workers";

import type { Route } from "./+types/api.files.$";
import { requireAdmin } from "~/lib/auth.server";

/**
 * Authenticated R2 file streamer. The bucket is private; admins view uploaded
 * images through this route (cookie-authenticated, same-origin).
 *   <img src={`/api/files/${image.key}`} />
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAdmin(request);

  const key = params["*"];
  if (!key) return new Response("Not found", { status: 404 });

  const object = await env.BUCKET.get(key);
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/octet-stream");
  }
  headers.set("cache-control", "private, max-age=3600");

  return new Response(object.body, { headers });
}
