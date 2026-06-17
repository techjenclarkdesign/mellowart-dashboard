import { describe, expect, it } from "vitest";

import {
  canApprove,
  canReject,
  deriveStatus,
  type PaymentStatus,
} from "./status";

describe("decision guards", () => {
  it("allows approve/reject only from pending", () => {
    expect(canApprove("pending")).toBe(true);
    expect(canReject("pending")).toBe(true);
    expect(canApprove("approved")).toBe(false);
    expect(canApprove("rejected")).toBe(false);
    expect(canReject("approved")).toBe(false);
    expect(canReject("rejected")).toBe(false);
  });
});

describe("deriveStatus", () => {
  it("ignores payment when pending or rejected", () => {
    expect(deriveStatus("pending", "none").label).toBe("Pending");
    expect(deriveStatus("rejected", "none").variant).toBe("destructive");
  });

  it("reflects the payment machine once approved", () => {
    const cases: [PaymentStatus, string][] = [
      ["invoicing", "Approved · Invoicing"],
      ["awaiting_payment", "Approved · Awaiting payment"],
      ["paid", "Approved · Paid"],
      ["overdue", "Approved · Overdue"],
      ["voided", "Approved · Invoice voided"],
    ];
    for (const [payment, label] of cases) {
      expect(deriveStatus("approved", payment).label).toBe(label);
    }
  });

  it("marks paid as the success (default) variant and overdue as destructive", () => {
    expect(deriveStatus("approved", "paid").variant).toBe("default");
    expect(deriveStatus("approved", "overdue").variant).toBe("destructive");
  });
});
