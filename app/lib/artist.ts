import { z } from "zod";

/**
 * Artist profile submission — text fields only. Files (profile photo +
 * portfolio images) are validated separately in the submit route since they
 * require multipart/R2 handling.
 *
 * Dropdown options ("primary medium", "style", "location", "custom orders") are
 * TBD by the client, so they're validated as non-empty strings for now.
 */
export const ArtistFieldsSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(320),
  phone: z.string().trim().min(3).max(40),
  bio: z.string().trim().min(1).max(5000),
  primaryMedium: z.string().trim().min(1).max(100),
  styleCategory: z.string().trim().min(1).max(100),
  location: z.string().trim().min(1).max(100),
  socialLink: z.string().trim().max(300).optional(),
  customOrders: z.string().trim().max(100).optional(),
  additionalNotes: z.string().trim().max(5000).optional(),
  // Both consent checkboxes are required to be true.
  consentImages: z.literal(true),
  consentPurpose: z.literal(true),
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

// File upload constraints.
export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MIN_PORTFOLIO_IMAGES = 3;
export const MAX_PORTFOLIO_IMAGES = 15;
export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
];
