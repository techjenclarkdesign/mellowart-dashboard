import { describe, expect, it } from "vitest";

import { DEFAULT_BRANDING, type TemplateContent } from "./email-templates";
import { renderContent } from "./email-templates.server";

const content = (blocks: TemplateContent["blocks"]): TemplateContent => ({
  subject: "Hi {{firstName}}",
  preheader: "",
  blocks,
});

describe("renderContent", () => {
  it("interpolates merge tags into subject and body", () => {
    const { subject, html } = renderContent(
      content([{ id: "p", type: "paragraph", text: "Hello {{name}}" }]),
      DEFAULT_BRANDING,
      { firstName: "Ada", name: "Ada Lovelace" },
    );
    expect(subject).toBe("Hi Ada");
    expect(html).toContain("Hello Ada Lovelace");
  });

  it("escapes HTML in literal text and in merge values (no injection)", () => {
    const { html } = renderContent(
      content([{ id: "p", type: "paragraph", text: "Bio: {{bio}} <x>" }]),
      DEFAULT_BRANDING,
      { bio: "<script>alert(1)</script>" },
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;x&gt;");
  });

  it("applies the markup subset (bold, link, newlines)", () => {
    const { html } = renderContent(
      content([
        { id: "p", type: "paragraph", text: "**bold** and [link](https://x.test)\nline2" },
      ]),
      DEFAULT_BRANDING,
      {},
    );
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain('href="https://x.test"');
    expect(html).toContain("line2");
    expect(html).toContain("<br/>");
  });

  it("hides a block whose hideIfEmpty tag resolves empty", () => {
    const blocks = content([
      { id: "b", type: "button", label: "Pay", url: "{{invoiceUrl}}", variant: "solid", hideIfEmpty: "{{invoiceUrl}}" },
    ]);
    const hidden = renderContent(blocks, DEFAULT_BRANDING, {});
    expect(hidden.html).not.toContain(">Pay<");
    const shown = renderContent(blocks, DEFAULT_BRANDING, {
      invoiceUrl: "https://pay.test/1",
    });
    expect(shown.html).toContain(">Pay<");
    expect(shown.html).toContain('href="https://pay.test/1"');
  });

  it("renders bank details from context", () => {
    const { html } = renderContent(
      content([{ id: "bank", type: "bank" }]),
      DEFAULT_BRANDING,
      { bankBsb: "063-000", bankAccountNumber: "1234 5678", amount: "AUD 220.00", reference: "ART-1", name: "Ada" },
    );
    expect(html).toContain("063-000");
    expect(html).toContain("1234 5678");
    expect(html).toContain("AUD 220.00");
    expect(html).toContain("ART-1 – Ada");
  });

  it("collapses newlines in the subject", () => {
    const { subject } = renderContent(
      { subject: "A\n{{firstName}}\nB", preheader: "", blocks: [] },
      DEFAULT_BRANDING,
      { firstName: "Ada" },
    );
    expect(subject).toBe("A Ada B");
  });
});
