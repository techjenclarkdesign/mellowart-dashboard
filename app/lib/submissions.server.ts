import type { ArtistFields } from "~/lib/artist";

export interface UploadFile {
  kind: "profile" | "portfolio" | "insurance";
  data: ArrayBuffer;
  contentType: string;
  size: number;
  sortOrder: number;
}

const EXT_BY_TYPE: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/avif": ".avif",
  "image/gif": ".gif",
};

/**
 * Upload files to R2, then insert the submission + file rows. Files go up first
 * so a DB failure leaves orphaned objects (cheap to GC) rather than rows
 * pointing at missing files.
 */
export async function createArtistSubmission(
  db: D1Database,
  bucket: R2Bucket,
  fields: ArtistFields,
  files: UploadFile[],
  eventId: string | null = null,
  stallOptionId: string | null = null,
): Promise<string> {
  const id = `ART-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

  const imageRows = [];
  for (const file of files) {
    const imageId = crypto.randomUUID();
    const ext = EXT_BY_TYPE[file.contentType] ?? "";
    const key = `submissions/${id}/${file.kind}/${imageId}${ext}`;
    await bucket.put(key, file.data, {
      httpMetadata: { contentType: file.contentType },
    });
    imageRows.push({
      id: imageId,
      kind: file.kind,
      key,
      contentType: file.contentType,
      size: file.size,
      sortOrder: file.sortOrder,
    });
  }

  await db.batch([
    db
      .prepare(
        `INSERT INTO submissions
          (id, first_name, last_name, email, applied_before, brand_name,
           website, instagram, bio, primary_category, secondary_category,
           product_description, additional_notes, consent_debut, consent_sharing,
           consent_setup_guide, first_stall_preference, second_stall_preference,
           offer_mini_if_unavailable, sharing_stall, has_insurance, event_id,
           stall_option_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        fields.firstName,
        fields.lastName,
        fields.email,
        fields.appliedBefore,
        fields.brandName,
        fields.website,
        fields.instagram,
        fields.bio,
        fields.primaryCategory,
        fields.secondaryCategory,
        fields.productDescription,
        fields.additionalNotes ?? null,
        fields.consentDebut ? 1 : 0,
        fields.consentSharing ? 1 : 0,
        fields.consentSetupGuide ? 1 : 0,
        fields.firstStallPreference,
        fields.secondStallPreference,
        fields.offerMiniIfUnavailable,
        fields.sharingStall,
        fields.hasInsurance,
        eventId,
        stallOptionId,
      ),
    ...imageRows.map((r) =>
      db
        .prepare(
          `INSERT INTO submission_images
            (id, submission_id, kind, r2_key, content_type, size, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(r.id, id, r.kind, r.key, r.contentType, r.size, r.sortOrder),
    ),
  ]);

  return id;
}

export interface SubmissionImage {
  id: string;
  kind: "profile" | "portfolio" | "insurance";
  key: string;
  sortOrder: number;
}

export interface SubmissionDetail {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  appliedBefore: string | null;
  brandName: string | null;
  website: string | null;
  instagram: string | null;
  bio: string;
  primaryCategory: string | null;
  secondaryCategory: string | null;
  productDescription: string | null;
  additionalNotes: string | null;
  internalNotes: string | null;
  consentDebut: number;
  consentSharing: number;
  consentSetupGuide: number;
  // Stall preferences: raw slugs + their resolved tier labels (label falls back
  // to the slug when it can't be matched to a stall option).
  firstStallPreference: string | null;
  secondStallPreference: string | null;
  offerMiniIfUnavailable: string | null;
  sharingStall: string | null;
  hasInsurance: string | null;
  eventId: string | null;
  eventName: string | null;
  status: string;
  rejectReason: string | null;
  waitlistReason: string | null;
  stallOptionId: string | null;
  stallTier: string | null;
  paymentStatus: string;
  submittedAt: string;
  images: SubmissionImage[];
}

export async function getSubmissionDetail(
  db: D1Database,
  id: string,
): Promise<SubmissionDetail | null> {
  const row = await db
    .prepare(
      `SELECT s.id, s.first_name AS firstName, s.last_name AS lastName, s.email,
              s.applied_before AS appliedBefore, s.brand_name AS brandName,
              s.website, s.instagram, s.bio,
              s.primary_category AS primaryCategory,
              s.secondary_category AS secondaryCategory,
              s.product_description AS productDescription,
              s.additional_notes AS additionalNotes, s.internal_notes AS internalNotes,
              s.consent_debut AS consentDebut, s.consent_sharing AS consentSharing,
              s.consent_setup_guide AS consentSetupGuide,
              COALESCE(fp.tier, s.first_stall_preference) AS firstStallPreference,
              COALESCE(sp.tier, s.second_stall_preference) AS secondStallPreference,
              s.offer_mini_if_unavailable AS offerMiniIfUnavailable,
              s.sharing_stall AS sharingStall, s.has_insurance AS hasInsurance,
              s.event_id AS eventId, e.name AS eventName,
              s.status, s.reject_reason AS rejectReason,
              s.waitlist_reason AS waitlistReason,
              s.stall_option_id AS stallOptionId, o.tier AS stallTier,
              s.payment_status AS paymentStatus, s.created_at AS submittedAt
       FROM submissions s
       LEFT JOIN events e ON e.id = s.event_id
       LEFT JOIN stall_options o ON o.id = s.stall_option_id
       LEFT JOIN stall_options fp
              ON fp.event_id = s.event_id AND fp.slug = s.first_stall_preference
       LEFT JOIN stall_options sp
              ON sp.event_id = s.event_id AND sp.slug = s.second_stall_preference
       WHERE s.id = ?`,
    )
    .bind(id)
    .first<Omit<SubmissionDetail, "images">>();

  if (!row) return null;

  const images = await db
    .prepare(
      `SELECT id, kind, r2_key AS key, sort_order AS sortOrder
       FROM submission_images
       WHERE submission_id = ?
       ORDER BY kind, sort_order`,
    )
    .bind(id)
    .all<SubmissionImage>();

  return { ...row, images: images.results ?? [] };
}

/** Set (or clear) the internal, admin-only notes on a submission. */
export async function setInternalNotes(
  db: D1Database,
  id: string,
  notes: string | null,
): Promise<boolean> {
  const res = await db
    .prepare(
      `UPDATE submissions
         SET internal_notes = ?, updated_at = datetime('now')
       WHERE id = ?`,
    )
    .bind(notes, id)
    .run();
  return (res.meta.changes ?? 0) > 0;
}
