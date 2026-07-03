import { describe, expect, it } from "vitest";

import { escapeCsvCell, rowsToCsv } from "./csv";

describe("escapeCsvCell", () => {
  it("leaves plain values untouched", () => {
    expect(escapeCsvCell("hello")).toBe("hello");
    expect(escapeCsvCell(42)).toBe("42");
  });

  it("renders null/undefined as empty strings", () => {
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(undefined)).toBe("");
  });

  it("quotes and escapes commas, quotes and newlines", () => {
    expect(escapeCsvCell("a,b")).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("neutralises formula-injection prefixes", () => {
    expect(escapeCsvCell("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)");
    expect(escapeCsvCell("+1")).toBe("'+1");
    expect(escapeCsvCell("-1")).toBe("'-1");
    expect(escapeCsvCell("@ref")).toBe("'@ref");
  });

  it("guards a formula that also needs quoting", () => {
    expect(escapeCsvCell("=1,2")).toBe('"\'=1,2"');
  });
});

describe("rowsToCsv", () => {
  it("joins a header row and data rows with CRLF", () => {
    const csv = rowsToCsv(
      ["Name", "Email"],
      [
        ["Ada", "ada@example.com"],
        ["Grace, the", "grace@example.com"],
      ],
    );
    expect(csv).toBe(
      'Name,Email\r\nAda,ada@example.com\r\n"Grace, the",grace@example.com',
    );
  });
});
