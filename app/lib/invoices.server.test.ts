import { describe, expect, it } from "vitest";

import { reconcile } from "./invoices.server";

const snapshot = {
  total: 250000,
  currency: "IDR",
  reference: "ART-1024",
  status: "AUTHORISED",
};

describe("reconcile", () => {
  it("returns no issues when the live invoice matches the snapshot", () => {
    expect(
      reconcile(snapshot, {
        total: 250000,
        currency: "IDR",
        reference: "ART-1024",
      }),
    ).toEqual([]);
  });

  it("flags total, currency and reference mismatches", () => {
    const issues = reconcile(snapshot, {
      total: 99,
      currency: "USD",
      reference: "ART-9999",
    });
    expect(issues).toHaveLength(3);
  });

  it("ignores fields that are null in the snapshot", () => {
    expect(
      reconcile(
        { total: null, currency: null, reference: null, status: null },
        { total: 1, currency: "USD", reference: "X" },
      ),
    ).toEqual([]);
  });
});
