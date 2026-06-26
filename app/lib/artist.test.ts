import { describe, expect, it } from "vitest";

import { ArtistFieldsSchema, isBioWordCountValid, wordCount } from "./artist";

const valid = {
  firstName: "Aria",
  lastName: "Putri",
  email: "aria@example.com",
  appliedBefore: "No",
  brandName: "Aria Studio",
  website: "https://ariastudio.com",
  instagram: "@ariaputri",
  bio: "A short statement.",
  primaryCategory: "Painting",
  secondaryCategory: "Illustration",
  productDescription: "Original paintings and prints.",
  firstStallPreference: "standard",
  secondStallPreference: "mini",
  offerMiniIfUnavailable: "Yes",
  sharingStall: "No",
  hasInsurance: "Yes",
  consentDebut: true as const,
  consentSharing: true as const,
  consentSetupGuide: true as const,
};

describe("ArtistFieldsSchema", () => {
  it("accepts a valid payload", () => {
    expect(ArtistFieldsSchema.safeParse(valid).success).toBe(true);
  });

  it("requires all three agreements to be true", () => {
    expect(
      ArtistFieldsSchema.safeParse({ ...valid, consentDebut: false }).success,
    ).toBe(false);
    expect(
      ArtistFieldsSchema.safeParse({ ...valid, consentSharing: false }).success,
    ).toBe(false);
    expect(
      ArtistFieldsSchema.safeParse({ ...valid, consentSetupGuide: false }).success,
    ).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(
      ArtistFieldsSchema.safeParse({ ...valid, email: "not-an-email" }).success,
    ).toBe(false);
  });

  it("requires the dropdown / category fields", () => {
    expect(
      ArtistFieldsSchema.safeParse({ ...valid, primaryCategory: "" }).success,
    ).toBe(false);
    expect(
      ArtistFieldsSchema.safeParse({ ...valid, firstStallPreference: "" }).success,
    ).toBe(false);
  });

  it("treats optional fields as undefined when omitted", () => {
    const result = ArtistFieldsSchema.safeParse(valid);
    expect(result.success && result.data.additionalNotes).toBeUndefined();
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
