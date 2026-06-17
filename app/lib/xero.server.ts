/**
 * Xero webhook signature verification.
 *
 * Xero signs each webhook delivery with HMAC-SHA256 over the *raw* request
 * body using your webhook signing key, base64-encoded, in the
 * `x-xero-signature` header. The raw body must be used verbatim — any
 * re-serialization will break the comparison.
 *
 * Docs: https://developer.xero.com/documentation/guides/webhooks/overview/
 */

const encoder = new TextEncoder();

export async function computeXeroSignature(
  rawBody: string,
  signingKey: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  // base64 of the raw HMAC bytes
  return btoa(String.fromCharCode(...new Uint8Array(mac)));
}

export async function verifyXeroSignature(
  rawBody: string,
  signature: string | null,
  signingKey: string,
): Promise<boolean> {
  if (!signature) return false;
  const expected = await computeXeroSignature(rawBody, signingKey);
  return timingSafeEqual(expected, signature);
}

/** Constant-time string comparison to avoid timing leaks. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/** Shape of a single event inside a Xero webhook payload. */
export type XeroWebhookEvent = {
  resourceUrl: string;
  resourceId: string;
  eventDateUtc: string;
  eventType: string; // e.g. "UPDATE", "CREATE"
  eventCategory: string; // e.g. "INVOICE", "CONTACT"
  tenantId: string;
  tenantType: string;
};

export type XeroWebhookPayload = {
  events: XeroWebhookEvent[];
  firstEventSequence: number;
  lastEventSequence: number;
  entropy: string;
};
