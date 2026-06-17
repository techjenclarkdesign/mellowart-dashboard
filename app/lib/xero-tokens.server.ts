/** D1-backed store for the single Xero OAuth2 connection (web-app flow). */

export interface XeroTokenRow {
  accessToken: string;
  refreshToken: string;
  /** epoch ms when the access token expires */
  expiresAt: number;
  tenantId: string;
  tenantName: string | null;
}

export async function getXeroTokens(
  db: D1Database,
): Promise<XeroTokenRow | null> {
  const row = await db
    .prepare(
      `SELECT access_token AS accessToken, refresh_token AS refreshToken,
              expires_at AS expiresAt, tenant_id AS tenantId,
              tenant_name AS tenantName
       FROM xero_tokens WHERE id = 1`,
    )
    .first<XeroTokenRow>();
  return row ?? null;
}

/** Upsert the single token row (id = 1). */
export async function saveXeroTokens(
  db: D1Database,
  t: XeroTokenRow,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO xero_tokens
         (id, access_token, refresh_token, expires_at, tenant_id, tenant_name, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         access_token = excluded.access_token,
         refresh_token = excluded.refresh_token,
         expires_at = excluded.expires_at,
         tenant_id = excluded.tenant_id,
         tenant_name = excluded.tenant_name,
         updated_at = datetime('now')`,
    )
    .bind(t.accessToken, t.refreshToken, t.expiresAt, t.tenantId, t.tenantName)
    .run();
}

export async function clearXeroTokens(db: D1Database): Promise<void> {
  await db.prepare("DELETE FROM xero_tokens WHERE id = 1").run();
}
