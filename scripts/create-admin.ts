/**
 * Generate an INSERT for a new admin (PBKDF2-hashed password).
 *
 *   bun run scripts/create-admin.ts admin@example.com 'super-secret'
 *
 * Then apply locally:
 *   bun run scripts/create-admin.ts admin@example.com 'pw' \
 *     | xargs -0 bunx wrangler d1 execute mellow-db --local --command
 *
 * ...or copy the printed statement into a `wrangler d1 execute` call.
 */
import { hashPassword } from "../app/lib/password.server";

const [email, password] = process.argv.slice(2);

if (!email || !password) {
  console.error("Usage: bun run scripts/create-admin.ts <email> <password>");
  process.exit(1);
}

const id = crypto.randomUUID();
const hash = await hashPassword(password);

console.log(
  `INSERT INTO admins (id, email, password_hash) VALUES ('${id}', '${email.toLowerCase()}', '${hash}');`,
);
