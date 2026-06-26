export interface InquirySummary {
  total: number;
  pending: number;
  accepted: number;
  waitlisted: number;
  rejected: number;
}

interface StatusRow {
  status: string;
  count: number;
}

/** Counts grouped by status, in a single query. */
export async function getInquirySummary(
  db: D1Database,
): Promise<InquirySummary> {
  const res = await db
    .prepare("SELECT status, COUNT(*) AS count FROM submissions GROUP BY status")
    .all<StatusRow>();

  const summary: InquirySummary = {
    total: 0,
    pending: 0,
    accepted: 0,
    waitlisted: 0,
    rejected: 0,
  };

  for (const row of res.results ?? []) {
    const count = Number(row.count);
    if (row.status === "pending") summary.pending = count;
    else if (row.status === "accepted") summary.accepted = count;
    else if (row.status === "waitlisted") summary.waitlisted = count;
    else if (row.status === "rejected") summary.rejected = count;
    summary.total += count;
  }

  return summary;
}
