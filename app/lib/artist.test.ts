import { describe, expect, it } from "vitest";

import { ArtistFieldsSchema, isBioWordCountValid, wordCount } from "./artist";

const valid = {
  firstName: "Aria",
  lastName: "Putri",
  email: "aria@example.com",
  phone: "+62 812-1111-2222",
  bio: "A short statement.",
  primaryMedium: "Painting",
  styleCategory: "Contemporary",
  location: "Bali",
  consentImages: true as const,
  consentPurpose: true as const,
};

describe("ArtistFieldsSchema", () => {
  it("accepts a valid payload", () => {
    expect(ArtistFieldsSchema.safeParse(valid).success).toBe(true);
  });

  it("requires both consents to be true", () => {
    expect(
      ArtistFieldsSchema.safeParse({ ...valid, consentImages: false }).success,
    ).toBe(false);
    expect(
      ArtistFieldsSchema.safeParse({ ...valid, consentPurpose: false }).success,
    ).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(
      ArtistFieldsSchema.safeParse({ ...valid, email: "not-an-email" }).success,
    ).toBe(false);
  });

  it("requires the dropdown fields", () => {
    expect(
      ArtistFieldsSchema.safeParse({ ...valid, primaryMedium: "" }).success,
    ).toBe(false);
    expect(
      ArtistFieldsSchema.safeParse({ ...valid, location: "" }).success,
    ).toBe(false);
  });

  it("treats optional fields as undefined when omitted", () => {
    const result = ArtistFieldsSchema.safeParse(valid);
    expect(result.success && result.data.socialLink).toBeUndefined();
  });
});

describe("bio word count", () => {
  it("counts words ignoring extra whitespace", () => {
    expect(wordCount("one two three")).toBe(3);
    expect(wordCount("  spaced   out  ")).toBe(2);
  });

  it("enforces the 200–400 word range", () => {
    const words = (n: number) => Array(n).fill("w").join(" ");
    expect(isBioWordCountValid(words(199))).toBe(false);
    expect(isBioWordCountValid(words(200))).toBe(true);
    expect(isBioWordCountValid(words(400))).toBe(true);
    expect(isBioWordCountValid(words(401))).toBe(false);
  });
});
