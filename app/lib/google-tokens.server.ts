/** D1-backed store for the single Google (Gmail) OAuth2 connection. */

export interface GoogleTokenRow {
  accessToken: string;
  refreshToken: string;
  /** epoch ms when the access token expires */
  expiresAt: number;
  /** the connected mailbox — used as the From address */
  email: string;
}

export async function getGoogleTokens(
  db: D1Database,
): Promise<GoogleTokenRow | null> {
  const row = await db
    .prepare(
      `SELECT access_token AS accessToken, refresh_token AS refreshToken,
              expires_at AS expiresAt, email
       FROM google_tokens WHERE id = 1`,
    )
    .first<GoogleTokenRow>();
  return row ?? null;
}

/** Upsert the single token row (id = 1). */
export async function saveGoogleTokens(
  db: D1Database,
  t: GoogleTokenRow,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO google_tokens
         (id, access_token, refresh_token, expires_at, email, updated_at)
       VALUES (1, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         access_token = excluded.access_token,
         refresh_token = excluded.refresh_token,
         expires_at = excluded.expires_at,
         email = excluded.email,
         updated_at = datetime('now')`,
    )
    .bind(t.accessToken, t.refreshToken, t.expiresAt, t.email)
    .run();
}

export async function clearGoogleTokens(db: D1Database): Promise<void> {
  await db.prepare("DELETE FROM google_tokens WHERE id = 1").run();
}
