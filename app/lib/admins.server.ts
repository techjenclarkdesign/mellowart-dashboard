/** Admin user management (flat — every admin has equal access, no roles). */

import { hashPassword } from "~/lib/password.server";

export interface AdminListItem {
  id: string;
  name: string | null;
  email: string;
  createdAt: string;
  /** The seeded/root admin (oldest account) — can't be deleted. */
  protected: boolean;
}

/** The seeded/root admin: the oldest account. Protected from deletion. */
export async function getRootAdminId(db: D1Database): Promise<string | null> {
  const row = await db
    .prepare("SELECT id FROM admins ORDER BY created_at, id LIMIT 1")
    .first<{ id: string }>();
  return row?.id ?? null;
}

export async function listAdmins(db: D1Database): Promise<AdminListItem[]> {
  const res = await db
    .prepare(
      "SELECT id, name, email, created_at AS createdAt FROM admins ORDER BY created_at",
    )
    .all<Omit<AdminListItem, "protected">>();
  const rows = res.results ?? [];
  const rootId = await getRootAdminId(db);
  return rows.map((r) => ({ ...r, protected: r.id === rootId }));
}

export async function countAdmins(db: D1Database): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS c FROM admins")
    .first<{ c: number }>();
  return Number(row?.c ?? 0);
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function createAdmin(
  db: D1Database,
  input: { name?: string | null; email: string; password: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Enter a valid email." };
  if (input.password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }
  const exists = await db
    .prepare("SELECT 1 FROM admins WHERE email = ?")
    .bind(email)
    .first();
  if (exists) return { ok: false, error: "That email already has an account." };

  const hash = await hashPassword(input.password);
  await db
    .prepare(
      "INSERT INTO admins (id, name, email, password_hash) VALUES (?, ?, ?, ?)",
    )
    .bind(crypto.randomUUID(), input.name?.trim() || null, email, hash)
    .run();
  return { ok: true };
}

export async function deleteAdmin(
  db: D1Database,
  id: string,
  actorId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (id === actorId) {
    return { ok: false, error: "You can't delete your own account." };
  }
  if (id === (await getRootAdminId(db))) {
    return { ok: false, error: "The primary (seeded) admin can't be deleted." };
  }
  if ((await countAdmins(db)) <= 1) {
    return { ok: false, error: "At least one admin must remain." };
  }
  const res = await db
    .prepare("DELETE FROM admins WHERE id = ?")
    .bind(id)
    .run();
  return (res.meta.changes ?? 0) > 0
    ? { ok: true }
    : { ok: false, error: "Admin not found." };
}

export async function setAdminPassword(
  db: D1Database,
  id: string,
  password: string,
): Promise<boolean> {
  if (password.length < 8) return false;
  const hash = await hashPassword(password);
  const res = await db
    .prepare("UPDATE admins SET password_hash = ? WHERE id = ?")
    .bind(hash, id)
    .run();
  return (res.meta.changes ?? 0) > 0;
}
