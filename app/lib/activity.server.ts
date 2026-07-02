/** Activity log: who did what to which submission, for the dashboard feed. */

export interface ActivityEntry {
  id: string;
  actorEmail: string | null;
  submissionId: string | null;
  subject: string | null;
  type: string;
  message: string;
  createdAt: string;
}

export async function logActivity(
  db: D1Database,
  e: {
    actorId?: string | null;
    actorEmail?: string | null;
    submissionId?: string | null;
    subject?: string | null;
    type: string;
    message: string;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO activity_log
         (id, actor_id, actor_email, submission_id, subject, type, message)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      e.actorId ?? null,
      e.actorEmail ?? null,
      e.submissionId ?? null,
      e.subject ?? null,
      e.type,
      e.message,
    )
    .run();
}

export async function listActivity(
  db: D1Database,
  limit = 50,
  eventId?: string | null,
): Promise<ActivityEntry[]> {
  // Scoped to an event, only entries tied to that event's submissions qualify.
  if (eventId) {
    const res = await db
      .prepare(
        `SELECT a.id, a.actor_email AS actorEmail, a.submission_id AS submissionId,
                a.subject, a.type, a.message, a.created_at AS createdAt
           FROM activity_log a
           JOIN submissions s ON s.id = a.submission_id
          WHERE s.event_id = ?
          ORDER BY a.created_at DESC, a.id DESC
          LIMIT ?`,
      )
      .bind(eventId, limit)
      .all<ActivityEntry>();
    return res.results ?? [];
  }

  const res = await db
    .prepare(
      `SELECT id, actor_email AS actorEmail, submission_id AS submissionId,
              subject, type, message, created_at AS createdAt
         FROM activity_log
        ORDER BY created_at DESC, id DESC
        LIMIT ?`,
    )
    .bind(limit)
    .all<ActivityEntry>();
  return res.results ?? [];
}
