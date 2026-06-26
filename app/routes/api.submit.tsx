import { env } from "cloudflare:workers";

import type { Route } from "./+types/api.submit";
import {
  ALLOWED_IMAGE_TYPES,
  ArtistFieldsSchema,
  BIO_MAX_WORDS,
  BIO_MIN_WORDS,
  isBioWordCountValid,
  MAX_FILE_BYTES,
  MAX_PORTFOLIO_IMAGES,
  MIN_PORTFOLIO_IMAGES,
} from "~/lib/artist";
import {
  findEventByWebflowRef,
  findStallByEventSlug,
} from "~/lib/events.server";
import {
  createArtistSubmission,
  type UploadFile,
} from "~/lib/submissions.server";

/**
 * Public artist-profile submission endpoint (multipart/form-data).
 *
 * Auth: shared secret in the `X-Client-Key` header, compared to `env.CLIENT_KEY`.
 * Text fields validated with zod; files (1 profile photo + ≥3 portfolio images)
 * validated here and streamed to R2.
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

function validateImage(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return `Unsupported image type: ${file.type || "unknown"}`;
  }
  if (file.size === 0) return "Empty file";
  if (file.size > MAX_FILE_BYTES) return "Image exceeds 10 MB";
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

  // Text fields → validate.
  const parsed = ArtistFieldsSchema.safeParse({
    firstName: asString(form.get("firstName")),
    lastName: asString(form.get("lastName")),
    email: asString(form.get("email")),
    phone: asString(form.get("phone")),
    bio: asString(form.get("bio")),
    primaryMedium: asString(form.get("primaryMedium")),
    styleCategory: asString(form.get("styleCategory")),
    location: asString(form.get("location")),
    socialLink: asOptional(form.get("socialLink")),
    customOrders: asOptional(form.get("customOrders")),
    additionalNotes: asOptional(form.get("additionalNotes")),
    consentImages: asBool(form.get("consentImages")),
    consentPurpose: asBool(form.get("consentPurpose")),
  });
  if (!parsed.success) {
    return bad(422, "Validation failed", parsed.error.flatten());
  }

  if (!isBioWordCountValid(parsed.data.bio)) {
    return bad(422, `Bio must be ${BIO_MIN_WORDS}–${BIO_MAX_WORDS} words`);
  }

  // Files.
  const profile = form.get("profilePhoto");
  if (!(profile instanceof File) || profile.size === 0) {
    return bad(422, "A profile photo is required");
  }
  const portfolio = form
    .getAll("portfolioImages")
    .filter((f): f is File => f instanceof File && f.size > 0);

  if (portfolio.length < MIN_PORTFOLIO_IMAGES) {
    return bad(422, `At least ${MIN_PORTFOLIO_IMAGES} portfolio images are required`);
  }
  if (portfolio.length > MAX_PORTFOLIO_IMAGES) {
    return bad(422, `At most ${MAX_PORTFOLIO_IMAGES} portfolio images are allowed`);
  }

  for (const file of [profile, ...portfolio]) {
    const err = validateImage(file);
    if (err) return bad(422, `${file.name || "file"}: ${err}`);
  }

  const files: UploadFile[] = [
    {
      kind: "profile",
      data: await profile.arrayBuffer(),
      contentType: profile.type,
      size: profile.size,
      sortOrder: 0,
    },
    ...(await Promise.all(
      portfolio.map(async (file, i): Promise<UploadFile> => ({
        kind: "portfolio",
        data: await file.arrayBuffer(),
        contentType: file.type,
        size: file.size,
        sortOrder: i,
      })),
    )),
  ];

  // Optional event scoping. Webflow forms pass the event's Webflow Item ID as
  // `webflow_id` (slug / local id also accepted; legacy `event` still works).
  // Unknown or absent refs leave the submission unassigned (admin scopes later).
  const eventRef =
    asOptional(form.get("webflow_id")) ?? asOptional(form.get("event"));
  const eventId = eventRef
    ? await findEventByWebflowRef(env.DB, eventRef)
    : null;

  // Optional stall pre-selection. The stall's slug is only unique within its
  // event, so it's resolved against the matched event. A stall_slug with no
  // matching event (or no matching stall) leaves the stall unassigned — the
  // admin assigns it later, same as before. The stall price drives the invoice.
  const stallSlug = asOptional(form.get("stall_slug"));
  const stallOptionId =
    eventId && stallSlug
      ? await findStallByEventSlug(env.DB, eventId, stallSlug)
      : null;

  const id = await createArtistSubmission(
    env.DB,
    env.BUCKET,
    parsed.data,
    files,
    eventId,
    stallOptionId,
  );
  return json({ ok: true, id }, { status: 201 });
}

export async function loader() {
  return bad(405, "Method not allowed");
}
