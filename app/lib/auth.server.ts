import { env } from "cloudflare:workers";
import { SignJWT, jwtVerify } from "jose";
import { createCookie, redirect } from "react-router";

/**
 * Custom JWT auth. The signed JWT is carried in an httpOnly session cookie.
 * Set `JWT_SECRET` via `.dev.vars` (local) and `wrangler secret put JWT_SECRET`
 * (production).
 */

const SESSION_MAX_AGE = 60 * 60 * 8; // 8 hours

export const sessionCookie = createCookie("__session", {
  httpOnly: true,
  secure: import.meta.env.PROD,
  sameSite: "lax",
  path: "/",
  maxAge: SESSION_MAX_AGE,
});

export interface SessionData {
  /** admin id */
  sub: string;
  email: string;
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env.JWT_SECRET);
}

/** Sign a session JWT and return a `Set-Cookie` string. */
export async function createSession(admin: {
  id: string;
  email: string;
}): Promise<string> {
  const jwt = await new SignJWT({ email: admin.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(admin.id)
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secretKey());
  return sessionCookie.serialize(jwt);
}

/** Read + verify the session from a request. Returns null when absent/invalid. */
export async function getSession(
  request: Request,
): Promise<SessionData | null> {
  const jwt = (await sessionCookie.parse(request.headers.get("Cookie"))) as
    | string
    | null;
  if (!jwt) return null;
  try {
    const { payload } = await jwtVerify(jwt, secretKey());
    if (!payload.sub) return null;
    return { sub: String(payload.sub), email: String(payload.email ?? "") };
  } catch {
    return null;
  }
}

/** Guard a loader/action — throws a redirect to /login when not signed in. */
export async function requireAdmin(request: Request): Promise<SessionData> {
  const session = await getSession(request);
  if (!session) {
    const url = new URL(request.url);
    const redirectTo = url.pathname + url.search;
    throw redirect(`/login?redirectTo=${encodeURIComponent(redirectTo)}`);
  }
  return session;
}

/** `Set-Cookie` string that clears the session. */
export function destroySession(): Promise<string> {
  return sessionCookie.serialize("", { maxAge: 0 });
}
