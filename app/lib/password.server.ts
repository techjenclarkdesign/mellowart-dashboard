/**
 * Password hashing with PBKDF2 via Web Crypto (works on workerd and Bun — no
 * native bcrypt needed). Stored format: `pbkdf2$<iterations>$<saltB64>$<hashB64>`.
 */

const ITERATIONS = 100_000;
const KEY_LEN = 32; // bytes
const encoder = new TextEncoder();

async function deriveBits(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations = ITERATIONS,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    KEY_LEN * 8,
  );
  return new Uint8Array(bits);
}

function toB64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await deriveBits(password, salt);
  return `pbkdf2$${ITERATIONS}$${toB64(salt)}$${toB64(hash)}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [scheme, iterStr, saltB64, hashB64] = stored.split("$");
  if (scheme !== "pbkdf2") return false;
  const iterations = Number(iterStr);
  if (!Number.isFinite(iterations)) return false;
  const hash = await deriveBits(password, fromB64(saltB64), iterations);
  return timingSafeEqual(toB64(hash), hashB64);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
