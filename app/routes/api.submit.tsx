import { env } from "cloudflare:workers";

import type { Route } from "./+types/api.submit";
import {
  ALLOWED_DOC_TYPES,
  ArtistFieldsSchema,
  BIO_MAX_WORDS,
  BIO_MIN_WORDS,
  isBioWordCountValid,
  MAX_FILE_BYTES,
} from "~/lib/artist";
import { findEventBySlug } from "~/lib/events.server";
import { sendConfirmationEmail } from "~/lib/jobs.server";
import {
  createArtistSubmission,
  type UploadFile,
} from "~/lib/submissions.server";

/**
 * Public artist-application submission endpoint (multipart/form-data).
 *
 * Auth: shared secret in the `X-Client-Key` header, compared to `env.CLIENT_KEY`.
 * Text fields validated with zod; files (1 portfolio document + an optional
 * insurance certificate) validated here and streamed to R2.
 */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Client-Key",
  "Access-Control-Max-Age": "86400",
} as const;

function json(body: unknown, init?: ResponseInit) {
  return Response.json(body, { ...init, headers: { ...CORS_HEADERS, ...init?.headers } });
}

function bad(status: number, error: string, extra?: unknown) {
  return json({ error, ...(extra ? { issues: extra } : {}) }, { status });
}

function asString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function asOptional(value: FormDataEntryValue | null): string | undefined {
  const s = asString(value).trim();
  return s.length ? s : undefined;
}

function asBool(value: FormDataEntryValue | null): boolean {
  const s = asString(value).toLowerCase();
  return s === "true" || s === "on" || s === "1" || s === "yes";
}

/**
 * First non-empty text value across several field names. Lets us accept both
 * the API name and the native Webflow name (e.g. `secondEmail` / `buddy-email-01`).
 */
function pickOptional(form: FormData, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const s = asOptional(form.get(k));
    if (s) return s;
  }
  return undefined;
}

/** First present form entry (file or text) across several field names. */
function pickEntry(
  form: FormData,
  ...keys: string[]
): FormDataEntryValue | null {
  for (const k of keys) {
    const v = form.get(k);
    if (v instanceof File ? v.size > 0 : typeof v === "string" && v.trim())
      return v;
  }
  return null;
}

function validateDoc(file: File): string | null {
  if (!ALLOWED_DOC_TYPES.includes(file.type)) {
    return `Unsupported file type: ${file.type || "unknown"} (PDF or image only)`;
  }
  if (file.size === 0) return "Empty file";
  if (file.size > MAX_FILE_BYTES) return "File exceeds 10 MB";
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") return bad(405, "Method not allowed");

  const provided = request.headers.get("x-client-key");
  if (!env.CLIENT_KEY || !provided || provided !== env.CLIENT_KEY) {
    return bad(401, "Unauthorized");
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return bad(400, "Expected multipart/form-data");
  }

  // Re-enter email is a confirmation field — checked here, never stored. Only
  // enforced when the form actually sends it.
  const email = asString(form.get("email")).trim();
  const confirmEmail = asOptional(form.get("confirmEmail"));
  if (confirmEmail && confirmEmail.toLowerCase() !== email.toLowerCase()) {
    return bad(422, "Email addresses do not match");
  }

  // Text fields → validate.
  const parsed = ArtistFieldsSchema.safeParse({
    firstName: asString(form.get("firstName")),
    lastName: asString(form.get("lastName")),
    email,
    appliedBefore: asString(form.get("appliedBefore")),
    brandName: asString(form.get("brandName")),
    website: asString(form.get("website")),
    instagram: asString(form.get("instagram")),
    bio: asString(form.get("bio")),
    primaryCategory: asString(form.get("primaryCategory")),
    secondaryCategory: asString(form.get("secondaryCategory")),
    productDescription: asString(form.get("productDescription")),
    additionalNotes: asOptional(form.get("additionalNotes")),
    firstStallPreference: asString(form.get("firstStallPreference")),
    secondStallPreference: asString(form.get("secondStallPreference")),
    offerMiniIfUnavailable: asString(form.get("offerMiniIfUnavailable")),
    sharingStall: asString(form.get("sharingStall")),
    hasInsurance: asString(form.get("hasInsurance")),
    consentDebut: asBool(form.get("consentDebut")),
    consentSharing: asBool(form.get("consentSharing")),
    consentSetupGuide: asBool(form.get("consentSetupGuide")),
    // Shared-stall second artist ("buddy") — only present when sharingStall
    // is "Yes". Accept the API name OR the native Webflow `buddy-*` name so the
    // data flows however the form forwards it. buddy-email-02 is a confirm
    // field and is never stored.
    secondFirstName: pickOptional(form, "secondFirstName", "buddy-first-name"),
    secondLastName: pickOptional(form, "secondLastName", "buddy-last-name"),
    secondEmail: pickOptional(form, "secondEmail", "buddy-email-01"),
    secondAppliedBefore: pickOptional(
      form,
      "secondAppliedBefore",
      "buddy-first-timer",
    ),
    secondBrandName: pickOptional(form, "secondBrandName", "buddy-brand-name"),
    secondWebsite: pickOptional(form, "secondWebsite", "buddy-website"),
    secondInstagram: pickOptional(form, "secondInstagram", "buddy-instagram"),
    secondBio: pickOptional(form, "secondBio", "buddy-artist-bio"),
    secondPrimaryCategory: pickOptional(
      form,
      "secondPrimaryCategory",
      "buddy-category-01",
    ),
    secondSecondaryCategory: pickOptional(
      form,
      "secondSecondaryCategory",
      "buddy-category-02",
    ),
    secondProductDescription: pickOptional(
      form,
      "secondProductDescription",
      "buddy-product-info",
    ),
  });
  if (!parsed.success) {
    return bad(422, "Validation failed", parsed.error.flatten());
  }

  if (!isBioWordCountValid(parsed.data.bio)) {
    return bad(422, `Bio must be ${BIO_MIN_WORDS}–${BIO_MAX_WORDS} words`);
  }

  // Files: a single required portfolio document + an optional insurance cert.
  const portfolio = form.get("portfolio");
  if (!(portfolio instanceof File) || portfolio.size === 0) {
    return bad(422, "A portfolio document is required");
  }
  const insurance = form.get("insurance");
  const hasInsuranceFile = insurance instanceof File && insurance.size > 0;

  // Optional second-artist portfolio (shared stall). Same rules as the main one.
  const secondPortfolio = pickEntry(
    form,
    "secondPortfolio",
    "buddy-portfolio-file",
  );
  const hasSecondPortfolio =
    secondPortfolio instanceof File && secondPortfolio.size > 0;

  for (const file of [
    portfolio,
    ...(hasInsuranceFile ? [insurance] : []),
    ...(hasSecondPortfolio ? [secondPortfolio] : []),
  ]) {
    const err = validateDoc(file as File);
    if (err) return bad(422, `${(file as File).name || "file"}: ${err}`);
  }

  const files: UploadFile[] = [
    {
      kind: "portfolio",
      data: await portfolio.arrayBuffer(),
      contentType: portfolio.type,
      size: portfolio.size,
      sortOrder: 0,
    },
    ...(hasInsuranceFile
      ? [
          {
            kind: "insurance" as const,
            data: await insurance.arrayBuffer(),
            contentType: insurance.type,
            size: insurance.size,
            sortOrder: 0,
          },
        ]
      : []),
    ...(hasSecondPortfolio
      ? [
          {
            kind: "second_portfolio" as const,
            data: await secondPortfolio.arrayBuffer(),
            contentType: secondPortfolio.type,
            size: secondPortfolio.size,
            sortOrder: 0,
          },
        ]
      : []),
  ];

  // Optional event scoping. Forms pass the event's `eventSlug` (the event's
  // Webflow Item ID or local id are still accepted; legacy `webflow_id` /
  // `event` field names also work). Unknown or absent refs leave the submission
  // unassigned (admin scopes later).
  const eventRef =
    asOptional(form.get("eventSlug")) ??
    asOptional(form.get("webflow_id")) ??
    asOptional(form.get("event"));
  const eventId = eventRef ? await findEventBySlug(env.DB, eventRef) : null;

  // Stall preferences come in as slugs and are stored as-is; they're resolved
  // against the event's stall options at read time. The admin still assigns the
  // billed stall (stall_option_id) later, so it starts null.
  const id = await createArtistSubmission(
    env.DB,
    env.BUCKET,
    parsed.data,
    files,
    eventId,
    null,
  );

  // Best-effort confirmation email — never fail the submission if mail is down.
  await sendConfirmationEmail(env, id);

  return json({ ok: true, id }, { status: 201 });
}

export async function loader() {
  return bad(405, "Method not allowed");
}
