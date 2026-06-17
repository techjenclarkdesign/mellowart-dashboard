import { describe, expect, it } from "vitest";

import { computeXeroSignature, verifyXeroSignature } from "./xero.server";

const KEY = "test-signing-key";
const BODY = JSON.stringify({ events: [], lastEventSequence: 0 });

describe("xero webhook signature", () => {
  it("computes a deterministic base64 HMAC", async () => {
    const a = await computeXeroSignature(BODY, KEY);
    const b = await computeXeroSignature(BODY, KEY);
    expect(a).toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
  });

  it("verifies a valid signature", async () => {
    const sig = await computeXeroSignature(BODY, KEY);
    expect(await verifyXeroSignature(BODY, sig, KEY)).toBe(true);
  });

  it("rejects a tampered body", async () => {
    const sig = await computeXeroSignature(BODY, KEY);
    expect(await verifyXeroSignature(BODY + " ", sig, KEY)).toBe(false);
  });

  it("rejects a wrong signing key", async () => {
    const sig = await computeXeroSignature(BODY, KEY);
    expect(await verifyXeroSignature(BODY, sig, "other-key")).toBe(false);
  });

  it("rejects a missing signature", async () => {
    expect(await verifyXeroSignature(BODY, null, KEY)).toBe(false);
  });
});
