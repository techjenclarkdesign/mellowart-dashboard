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

  describe("card surcharge tolerance", () => {
    const au = {
      total: 440,
      currency: "AUD",
      reference: "ART-8F5550F2",
      status: "AUTHORISED",
    };

    it("does not flag a 1.70% surcharge when a rate is given", () => {
      // 440 * 1.017 = 447.48 — the exact total a card payer is charged.
      expect(
        reconcile(
          au,
          { total: 447.48, currency: "AUD", reference: "ART-8F5550F2" },
          { surchargeRate: 0.017 },
        ),
      ).toEqual([]);
    });

    it("still flags a surcharge when no rate is configured", () => {
      expect(
        reconcile(au, {
          total: 447.48,
          currency: "AUD",
          reference: "ART-8F5550F2",
        }),
      ).toContain("total 447.48 != snapshot 440");
    });

    it("flags overage beyond the surcharge ceiling", () => {
      // 460 > 440 * 1.017 + 0.01 — too high to be the expected surcharge.
      expect(
        reconcile(
          au,
          { total: 460, currency: "AUD", reference: "ART-8F5550F2" },
          { surchargeRate: 0.017 },
        ),
      ).toContain("total 460 != snapshot 440");
    });

    it("flags a total below the snapshot even with a surcharge rate", () => {
      expect(
        reconcile(
          au,
          { total: 400, currency: "AUD", reference: "ART-8F5550F2" },
          { surchargeRate: 0.017 },
        ),
      ).toContain("total 400 != snapshot 440");
    });
  });
});
