import { describe, expect, it } from "vitest";

import { ArtistFieldsSchema } from "./artist";

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

  it("does not cap the length of free-text fields", () => {
    const huge = "a".repeat(50_000);
    expect(
      ArtistFieldsSchema.safeParse({
        ...valid,
        bio: huge,
        productDescription: huge,
        additionalNotes: huge,
      }).success,
    ).toBe(true);
  });
});
