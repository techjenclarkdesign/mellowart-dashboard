import { describe, expect, it } from "vitest";

import {
  buildInvoicePayload,
  extractInvoiceMeta,
  extractOnlineUrl,
  isInvoicePaid,
} from "./xero-client.server";

describe("buildInvoicePayload", () => {
  it("builds an authorised ACCREC invoice from config", () => {
    const payload = buildInvoicePayload({
      contactName: "Aria Putri",
      contactEmail: "aria@example.com",
      reference: "ART-1024",
      description: "Listing",
      unitAmount: 250000,
      accountCode: "200",
      currency: "IDR",
      lineAmountTypes: "Exclusive",
      taxType: "NONE",
      dueDate: "2026-07-01",
    });
    expect(payload.Type).toBe("ACCREC");
    expect(payload.Status).toBe("AUTHORISED");
    expect(payload.CurrencyCode).toBe("IDR");
    expect(payload.LineAmountTypes).toBe("Exclusive");
    expect(payload).toMatchObject({ DueDate: "2026-07-01" });
    expect(payload.Contact).toEqual({
      Name: "Aria Putri",
      EmailAddress: "aria@example.com",
    });
    expect(payload.LineItems).toHaveLength(1);
    expect(payload.LineItems[0]).toMatchObject({
      Quantity: 1,
      UnitAmount: 250000,
      AccountCode: "200",
      TaxType: "NONE",
    });
  });

  it("omits DueDate and TaxType when not provided", () => {
    const payload = buildInvoicePayload({
      contactName: "X",
      contactEmail: "x@y.com",
      reference: "ART-1",
      description: "Listing",
      unitAmount: 0,
      accountCode: "200",
      currency: "USD",
      lineAmountTypes: "NoTax",
    });
    expect("DueDate" in payload).toBe(false);
    expect("TaxType" in payload.LineItems[0]).toBe(false);
  });
});

describe("response parsers", () => {
  it("extracts invoice metadata, or null", () => {
    const meta = extractInvoiceMeta({
      Invoices: [
        {
          InvoiceID: "abc-123",
          InvoiceNumber: "INV-0007",
          Total: 250000,
          AmountDue: 250000,
          Status: "AUTHORISED",
          CurrencyCode: "IDR",
        },
      ],
    });
    expect(meta).toMatchObject({
      invoiceId: "abc-123",
      invoiceNumber: "INV-0007",
      total: 250000,
      amountDue: 250000,
      status: "AUTHORISED",
      currency: "IDR",
    });
    expect(extractInvoiceMeta({ Invoices: [] })).toBeNull();
    expect(extractInvoiceMeta({})).toBeNull();
  });

  it("extracts the online invoice url, or empty", () => {
    expect(
      extractOnlineUrl({
        OnlineInvoices: [{ OnlineInvoiceUrl: "https://pay.xero/abc" }],
      }),
    ).toBe("https://pay.xero/abc");
    expect(extractOnlineUrl({})).toBe("");
  });
});

describe("isInvoicePaid", () => {
  it("is paid when status is PAID or nothing is due", () => {
    expect(isInvoicePaid({ status: "PAID", amountDue: 0 })).toBe(true);
    expect(isInvoicePaid({ status: "AUTHORISED", amountDue: 0 })).toBe(true);
    expect(isInvoicePaid({ status: "AUTHORISED", amountDue: 50 })).toBe(false);
  });
});
