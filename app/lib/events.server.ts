/** Events + per-event stall options: reads, counts, and stall CRUD. */

import type {
  EventSummary,
  EventWithCounts,
  StallOption,
} from "~/lib/events";

const EVENT_COLUMNS =
  "id, webflow_id AS webflowId, name, slug, location, " +
  "starts_at AS startsAt, ends_at AS endsAt";

const STALL_COLUMNS =
  "id, event_id AS eventId, tier, unit_amount AS unitAmount, currency, " +
  "frontage, furniture, sharing, sort_order AS sortOrder";

/** All events with applicant + awaiting-review counts, newest first. */
export async function listEventsWithCounts(
  db: D1Database,
): Promise<EventWithCounts[]> {
  const res = await db
    .prepare(
      `SELECT e.id, e.webflow_id AS webflowId, e.name, e.slug, e.location,
              e.starts_at AS startsAt, e.ends_at AS endsAt,
              COUNT(s.id) AS applicants,
              COALESCE(SUM(CASE WHEN s.status = 'pending' THEN 1 ELSE 0 END), 0) AS awaitingReview
         FROM events e
         LEFT JOIN submissions s ON s.event_id = e.id
        GROUP BY e.id
        ORDER BY e.starts_at DESC, e.created_at DESC`,
    )
    .all<EventWithCounts>();
  return res.results ?? [];
}

export async function getEvent(
  db: D1Database,
  id: string,
): Promise<EventSummary | null> {
  return db
    .prepare(`SELECT ${EVENT_COLUMNS} FROM events WHERE id = ?`)
    .bind(id)
    .first<EventSummary>();
}

export async function listStallOptions(
  db: D1Database,
  eventId: string,
): Promise<StallOption[]> {
  const res = await db
    .prepare(
      `SELECT ${STALL_COLUMNS} FROM stall_options
        WHERE event_id = ?
        ORDER BY sort_order, unit_amount`,
    )
    .bind(eventId)
    .all<StallOption>();
  return res.results ?? [];
}

export async function getStallOption(
  db: D1Database,
  id: string,
): Promise<StallOption | null> {
  return db
    .prepare(`SELECT ${STALL_COLUMNS} FROM stall_options WHERE id = ?`)
    .bind(id)
    .first<StallOption>();
}

export interface StallOptionInput {
  tier: string;
  unitAmount: number;
  currency: string;
  frontage?: string | null;
  furniture?: string | null;
  sharing?: string | null;
  sortOrder?: number;
}

export async function createStallOption(
  db: D1Database,
  eventId: string,
  input: StallOptionInput,
): Promise<string> {
  const id = `STL-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  await db
    .prepare(
      `INSERT INTO stall_options
         (id, event_id, tier, unit_amount, currency, frontage, furniture, sharing, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      eventId,
      input.tier,
      input.unitAmount,
      input.currency,
      input.frontage ?? null,
      input.furniture ?? null,
      input.sharing ?? null,
      input.sortOrder ?? 0,
    )
    .run();
  return id;
}

export async function updateStallOption(
  db: D1Database,
  id: string,
  input: StallOptionInput,
): Promise<boolean> {
  const res = await db
    .prepare(
      `UPDATE stall_options
         SET tier = ?, unit_amount = ?, currency = ?, frontage = ?,
             furniture = ?, sharing = ?, sort_order = ?, updated_at = datetime('now')
       WHERE id = ?`,
    )
    .bind(
      input.tier,
      input.unitAmount,
      input.currency,
      input.frontage ?? null,
      input.furniture ?? null,
      input.sharing ?? null,
      input.sortOrder ?? 0,
      id,
    )
    .run();
  return (res.meta.changes ?? 0) > 0;
}

export async function deleteStallOption(
  db: D1Database,
  id: string,
): Promise<boolean> {
  const res = await db
    .prepare("DELETE FROM stall_options WHERE id = ?")
    .bind(id)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

/** Resolve a Webflow CMS slug/id to a local event id (for the submit endpoint). */
export async function findEventByWebflowRef(
  db: D1Database,
  ref: string,
): Promise<string | null> {
  const row = await db
    .prepare(
      "SELECT id FROM events WHERE slug = ? OR webflow_id = ? OR id = ? LIMIT 1",
    )
    .bind(ref, ref, ref)
    .first<{ id: string }>();
  return row?.id ?? null;
}

/**
 * Mirror events from the Webflow CMS into the local `events` table.
 *
 * STUB — Phase 2 wiring. The real implementation fetches the Webflow CMS
 * "Events" collection and upserts each item by `webflow_id` (name, slug,
 * location, start/end dates). Events are managed in Webflow; the dashboard only
 * mirrors them, so until this is wired, seed the `events` table directly.
 */
export async function syncEventsFromWebflow(
  _env: Env,
): Promise<{ synced: number }> {
  // TODO(phase-2): call Webflow CMS API and upsert by webflow_id.
  return { synced: 0 };
}
