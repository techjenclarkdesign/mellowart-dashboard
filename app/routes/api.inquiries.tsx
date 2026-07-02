import { env } from "cloudflare:workers";

import type { Route } from "./+types/api.inquiries";
import { requireAdmin } from "~/lib/auth.server";
import { parseListQuery } from "~/lib/data-table";
import { d1List, type D1ListConfig } from "~/lib/d1-pagination.server";

// Map client column ids (TanStack accessorKeys) → DB columns for sorting.
const SORT_FIELD_MAP: Record<string, string> = {
  id: "id",
  name: "last_name",
  status: "status",
  paymentStatus: "payment_status",
  submittedAt: "created_at",
};

const LIST_CONFIG: D1ListConfig = {
  table: "submissions",
  columns:
    "id, first_name AS firstName, last_name AS lastName, " +
    "(first_name || ' ' || last_name) AS name, email, brand_name AS brandName, " +
    "primary_category AS primaryCategory, secondary_category AS secondaryCategory, " +
    "sharing_stall AS sharingStall, " +
    "event_id AS eventId, status, reject_reason AS rejectReason, " +
    "stall_option_id AS stallOptionId, payment_status AS paymentStatus, " +
    "invoice_url AS invoiceUrl, internal_notes AS internalNotes, " +
    "archived_at AS archivedAt, created_at AS submittedAt",
  searchColumns: ["first_name", "last_name", "email"],
  // Filter keys sent by the UI map 1:1 to these columns.
  filterColumns: ["status", "payment_status", "event_id", "stall_option_id"],
  sortColumns: ["last_name", "status", "payment_status", "created_at"],
  defaultSort: { field: "created_at", dir: "desc" },
};

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);

  const url = new URL(request.url);
  const query = parseListQuery(url.searchParams);
  if (query.sort) {
    query.sort.field = SORT_FIELD_MAP[query.sort.field] ?? "created_at";
  }

  // Archive is a list-visibility scope, not a real column — pull `view` out of
  // the generic filters and map it to a WHERE fragment. The UI sends
  // view=active by default (hide archived); clearing the filter ("All views")
  // drops the key entirely, which shows everything.
  const view = query.filters?.view;
  if (query.filters) delete query.filters.view;
  const archiveWhere =
    view === "active"
      ? "archived_at IS NULL"
      : view === "archived"
        ? "archived_at IS NOT NULL"
        : undefined;
  const config: D1ListConfig = { ...LIST_CONFIG, extraWhere: archiveWhere };

  // Copy-emails mode: every matching email for the current search/filters,
  // ignoring pagination. Returns { emails: string[] }.
  if (url.searchParams.get("emails") === "1") {
    const all = await d1List<{ email: string }>(
      env.DB,
      { ...query, page: 1, pageSize: 10_000 },
      { ...config, columns: "email" },
    );
    const emails = [...new Set(all.data.map((r) => r.email))];
    return Response.json({ emails });
  }

  const result = await d1List(env.DB, query, config);
  return Response.json(result);
}
