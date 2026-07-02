import { z } from "zod";

/**
 * Artist application — text fields only. Files (portfolio document + optional
 * insurance certificate) are validated separately in the submit route since
 * they require multipart/R2 handling.
 *
 * Yes/no and dropdown answers (applied-before, categories, stall preferences,
 * insurance, etc.) are validated as non-empty strings — the option lists are
 * owned by the public form, not this API. Stall preferences are stall slugs and
 * are resolved against `stall_options` at read time.
 */
export const ArtistFieldsSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(320),
  appliedBefore: z.string().trim().min(1).max(50),
  brandName: z.string().trim().min(1).max(200),
  website: z.string().trim().min(1).max(300),
  instagram: z.string().trim().min(1).max(120),
  bio: z.string().trim().min(1).max(5000),
  primaryCategory: z.string().trim().min(1).max(100),
  secondaryCategory: z.string().trim().min(1).max(100),
  productDescription: z.string().trim().min(1).max(2000),
  additionalNotes: z.string().trim().max(5000).optional(),
  firstStallPreference: z.string().trim().min(1).max(100),
  secondStallPreference: z.string().trim().min(1).max(100),
  offerMiniIfUnavailable: z.string().trim().min(1).max(50),
  sharingStall: z.string().trim().min(1).max(50),
  hasInsurance: z.string().trim().min(1).max(50),
  // The three stall agreements must all be ticked.
  consentDebut: z.literal(true),
  consentSharing: z.literal(true),
  consentSetupGuide: z.literal(true),
  // Shared-stall second artist ("buddy") — the form's conditional section only
  // sends these when `sharingStall` is "Yes", so all are optional here. Mirrors
  // the main applicant's text fields.
  secondFirstName: z.string().trim().min(1).max(100).optional(),
  secondLastName: z.string().trim().min(1).max(100).optional(),
  secondEmail: z.string().trim().email().max(320).optional(),
  secondAppliedBefore: z.string().trim().min(1).max(50).optional(),
  secondBrandName: z.string().trim().min(1).max(200).optional(),
  secondWebsite: z.string().trim().min(1).max(300).optional(),
  secondInstagram: z.string().trim().min(1).max(120).optional(),
  secondBio: z.string().trim().min(1).max(5000).optional(),
  secondPrimaryCategory: z.string().trim().min(1).max(100).optional(),
  secondSecondaryCategory: z.string().trim().min(1).max(100).optional(),
  secondProductDescription: z.string().trim().min(1).max(2000).optional(),
});

export type ArtistFields = z.infer<typeof ArtistFieldsSchema>;

export const BIO_MIN_WORDS = 200;
export const BIO_MAX_WORDS = 400;

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function isBioWordCountValid(bio: string): boolean {
  const n = wordCount(bio);
  return n >= BIO_MIN_WORDS && n <= BIO_MAX_WORDS;
}

// File upload constraints. The portfolio is a single 1-page A4 document and the
// insurance certificate is an optional single document — both may be a PDF or an
// image export.
export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_DOC_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
];
