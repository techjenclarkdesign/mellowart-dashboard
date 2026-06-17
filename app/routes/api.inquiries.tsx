import { env } from "cloudflare:workers";

import type { Route } from "./+types/api.inquiries";
import { requireAdmin } from "~/lib/auth.server";
import { parseListQuery } from "~/lib/data-table";
import { d1List } from "~/lib/d1-pagination.server";

// Map client column ids (TanStack accessorKeys) → DB columns for sorting.
const SORT_FIELD_MAP: Record<string, string> = {
  id: "id",
  name: "last_name",
  status: "status",
  submittedAt: "created_at",
};

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);

  const url = new URL(request.url);
  const query = parseListQuery(url.searchParams);
  if (query.sort) {
    query.sort.field = SORT_FIELD_MAP[query.sort.field] ?? "created_at";
  }

  const result = await d1List(env.DB, query, {
    table: "submissions",
    columns:
      "id, first_name AS firstName, last_name AS lastName, " +
      "(first_name || ' ' || last_name) AS name, email, " +
      "primary_medium AS primaryMedium, style_category AS styleCategory, location, " +
      "status, reject_reason AS rejectReason, payment_status AS paymentStatus, " +
      "created_at AS submittedAt",
    searchColumns: ["first_name", "last_name", "email"],
    filterColumns: ["status"],
    sortColumns: ["last_name", "status", "created_at"],
    defaultSort: { field: "created_at", dir: "desc" },
  });

  return Response.json(result);
}
