import { env } from "cloudflare:workers";

import type { Route } from "./+types/webhooks.xero";
import { findByInvoiceId } from "~/lib/payments.server";
import {
  verifyXeroSignature,
  type XeroWebhookPayload,
} from "~/lib/xero.server";

/**
 * Xero webhook receiver (resource route — no UI).
 *
 * Handles both:
 *  - "Intent to Receive" validation: Xero sends a payload and expects 200 when
 *    the signature matches, 401 when it does not.
 *  - Live events: verify signature, parse events, then return 200 quickly.
 *
 * Configure the signing key as a secret:
 *   bunx wrangler secret put XERO_WEBHOOK_KEY
 */
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const signingKey = env.XERO_WEBHOOK_KEY;
  if (!signingKey) {
    // Misconfiguration — don't leak details.
    return new Response("Webhook not configured", { status: 500 });
  }

  // Raw body is required for HMAC verification — read it before parsing.
  const rawBody = await request.text();
  const signature = request.headers.get("x-xero-signature");

  const valid = await verifyXeroSignature(rawBody, signature, signingKey);
  if (!valid) {
    // Xero's Intent-to-Receive check requires exactly 401 on mismatch.
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: XeroWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as XeroWebhookPayload;
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  for (const event of payload.events ?? []) {
    if (event.eventCategory !== "INVOICE") continue;

    // Map the invoice back to our submission via the stored join key.
    const submission = await findByInvoiceId(env.DB, event.resourceId);
    if (!submission) continue; // not one of ours

    // The webhook only carries IDs (not the amount/status), and we must respond
    // within 5s — so offload the Xero API call to the queue consumer, which
    // fetches the invoice and flips to `paid` when settled.
    await env.QUEUE.send({
      type: "verify_payment",
      invoiceId: event.resourceId,
    });
  }

  // Acknowledge fast — Xero expects a 2xx within ~5 seconds.
  return new Response(null, { status: 200 });
}
