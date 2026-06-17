import type { ArtistFields } from "~/lib/artist";

export interface UploadFile {
  kind: "profile" | "portfolio";
  data: ArrayBuffer;
  contentType: string;
  size: number;
  sortOrder: number;
}

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/avif": ".avif",
  "image/gif": ".gif",
};

/**
 * Upload images to R2, then insert the submission + image rows. Files go up
 * first so a DB failure leaves orphaned objects (cheap to GC) rather than rows
 * pointing at missing images.
 */
export async function createArtistSubmission(
  db: D1Database,
  bucket: R2Bucket,
  fields: ArtistFields,
  files: UploadFile[],
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
          (id, first_name, last_name, email, phone, bio, primary_medium,
           style_category, location, social_link, custom_orders,
           additional_notes, consent_images, consent_purpose)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        fields.firstName,
        fields.lastName,
        fields.email,
        fields.phone,
        fields.bio,
        fields.primaryMedium,
        fields.styleCategory,
        fields.location,
        fields.socialLink ?? null,
        fields.customOrders ?? null,
        fields.additionalNotes ?? null,
        fields.consentImages ? 1 : 0,
        fields.consentPurpose ? 1 : 0,
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
  kind: "profile" | "portfolio";
  key: string;
  sortOrder: number;
}

export interface SubmissionDetail {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  bio: string;
  primaryMedium: string;
  styleCategory: string;
  location: string;
  socialLink: string | null;
  customOrders: string | null;
  additionalNotes: string | null;
  consentImages: number;
  consentPurpose: number;
  status: string;
  rejectReason: string | null;
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
      `SELECT id, first_name AS firstName, last_name AS lastName, email, phone,
              bio, primary_medium AS primaryMedium, style_category AS styleCategory,
              location, social_link AS socialLink, custom_orders AS customOrders,
              additional_notes AS additionalNotes, consent_images AS consentImages,
              consent_purpose AS consentPurpose, status, reject_reason AS rejectReason,
              payment_status AS paymentStatus, created_at AS submittedAt
       FROM submissions WHERE id = ?`,
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
