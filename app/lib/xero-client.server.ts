/**
 * Xero API client for a single organisation via the OAuth2 authorization-code
 * (web app) flow. The admin authorizes once (/xero/authorize → /xero/callback);
 * tokens are stored in D1. Access tokens last ~30 min and are refreshed on
 * demand using the stored refresh token, which Xero rotates on every refresh —
 * so the new refresh token must be persisted each time.
 *
 * Pure payload/response helpers stay free of bindings (unit-tested); network
 * functions take `env` so they can read/refresh the token store.
 */

import {
  getXeroTokens,
  saveXeroTokens,
  type XeroTokenRow,
} from "~/lib/xero-tokens.server";

const AUTHORIZE_URL = "https://login.xero.com/identity/connect/authorize";
const TOKEN_URL = "https://identity.xero.com/connect/token";
const API_BASE = "https://api.xero.com";
const CONNECTIONS_URL = `${API_BASE}/connections`;

/**
 * Xero rejects accounting-only scope sets (invalid_scope) — the OpenID Connect
 * scopes must be present. `offline_access` yields the refresh token; the
 * `accounting.*` scopes cover the invoice + contact calls we make.
 */
export const XERO_SCOPES =
  "openid profile email offline_access accounting.transactions accounting.contacts";

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

function basicAuth(env: Env): string {
  return btoa(`${env.XERO_CLIENT_ID}:${env.XERO_CLIENT_SECRET}`);
}

/** Build the Xero consent URL the admin is redirected to. */
export function buildAuthorizeUrl(
  env: Env,
  params: { state: string; redirectUri: string },
): string {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: env.XERO_CLIENT_ID,
    redirect_uri: params.redirectUri,
    scope: XERO_SCOPES,
    state: params.state,
  });
  // URLSearchParams encodes spaces as "+"; Xero reads "+" literally and rejects
  // the scope (invalid_scope). Force "%20" between scopes. (Real "+" chars are
  // already "%2B" here, so this only touches encoded spaces.)
  return `${AUTHORIZE_URL}?${q.toString().replace(/\+/g, "%20")}`;
}

async function postToken(env: Env, body: URLSearchParams): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth(env)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(
      `Xero token request failed: ${res.status} ${await res.text()}`,
    );
  }
  return (await res.json()) as TokenResponse;
}

/** Exchange an authorization code for tokens (called from /xero/callback). */
export function exchangeCodeForTokens(
  env: Env,
  code: string,
  redirectUri: string,
): Promise<TokenResponse> {
  return postToken(
    env,
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  );
}

/** Organisations the connected user granted this app access to. */
export async function getConnections(
  accessToken: string,
): Promise<{ tenantId: string; tenantName: string | null }[]> {
  const res = await fetch(CONNECTIONS_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`Xero connections failed: ${res.status}`);
  const conns = (await res.json()) as {
    tenantId: string;
    tenantName?: string;
  }[];
  return conns.map((c) => ({
    tenantId: c.tenantId,
    tenantName: c.tenantName ?? null,
  }));
}

/**
 * Valid access token + tenant id, refreshing (and persisting the rotated
 * refresh token) when the stored access token is within 60s of expiry.
 * Throws when the app has never been connected.
 */
async function getValidAccessToken(
  env: Env,
): Promise<{ token: string; tenantId: string }> {
  const row = await getXeroTokens(env.DB);
  if (!row) {
    throw new Error("Xero is not connected — authorize the app first.");
  }
  if (row.expiresAt > Date.now() + 60_000) {
    return { token: row.accessToken, tenantId: row.tenantId };
  }

  const refreshed = await postToken(
    env,
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: row.refreshToken,
    }),
  );
  const updated: XeroTokenRow = {
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token, // rotated — must persist
    expiresAt: Date.now() + refreshed.expires_in * 1000,
    tenantId: row.tenantId,
    tenantName: row.tenantName,
  };
  await saveXeroTokens(env.DB, updated);
  return { token: updated.accessToken, tenantId: updated.tenantId };
}

async function xeroFetch(
  env: Env,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const { token, tenantId } = await getValidAccessToken(env);
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Xero-tenant-id": tenantId,
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });
}

// ---------- pure helpers (unit-tested) ----------

export interface CreateInvoiceInput {
  contactName: string;
  contactEmail: string;
  reference: string;
  description: string;
  unitAmount: number;
  accountCode: string;
  currency: string;
  lineAmountTypes: string; // Exclusive | Inclusive | NoTax
  taxType?: string | null;
  date?: string; // YYYY-MM-DD
  dueDate?: string; // YYYY-MM-DD
}

export function buildInvoicePayload(input: CreateInvoiceInput) {
  const line: Record<string, unknown> = {
    Description: input.description,
    Quantity: 1,
    UnitAmount: input.unitAmount,
    AccountCode: input.accountCode,
  };
  if (input.taxType) line.TaxType = input.taxType;

  return {
    Type: "ACCREC",
    Contact: { Name: input.contactName, EmailAddress: input.contactEmail },
    Reference: input.reference,
    CurrencyCode: input.currency,
    LineAmountTypes: input.lineAmountTypes,
    ...(input.date ? { Date: input.date } : {}),
    ...(input.dueDate ? { DueDate: input.dueDate } : {}),
    LineItems: [line],
    Status: "AUTHORISED",
  };
}

export interface InvoiceMeta {
  invoiceId: string;
  invoiceNumber: string | null;
  total: number | null;
  amountDue: number | null;
  status: string | null;
  currency: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractInvoiceMeta(json: any): InvoiceMeta | null {
  const inv = json?.Invoices?.[0];
  if (!inv?.InvoiceID) return null;
  return {
    invoiceId: inv.InvoiceID,
    invoiceNumber: inv.InvoiceNumber ?? null,
    total: inv.Total != null ? Number(inv.Total) : null,
    amountDue: inv.AmountDue != null ? Number(inv.AmountDue) : null,
    status: inv.Status ?? null,
    currency: inv.CurrencyCode ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractOnlineUrl(json: any): string {
  return json?.OnlineInvoices?.[0]?.OnlineInvoiceUrl ?? "";
}

export interface XeroInvoice {
  status: string;
  amountDue: number;
  total: number;
  currency: string;
  reference: string;
  invoiceNumber: string;
}

export function isInvoicePaid(invoice: {
  status: string;
  amountDue: number;
}): boolean {
  return invoice.status === "PAID" || invoice.amountDue === 0;
}

// ---------- network operations ----------

export interface CreatedInvoice extends InvoiceMeta {
  onlineUrl: string;
}

export async function createInvoice(
  env: Env,
  input: CreateInvoiceInput,
  idempotencyKey: string,
): Promise<CreatedInvoice> {
  const res = await xeroFetch(env, "/api.xro/2.0/Invoices", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Prevents a duplicate invoice if the job retries after a partial success.
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({ Invoices: [buildInvoicePayload(input)] }),
  });
  if (!res.ok) {
    throw new Error(`Create invoice failed: ${res.status} ${await res.text()}`);
  }
  const meta = extractInvoiceMeta(await res.json());
  if (!meta) throw new Error("Xero response had no InvoiceID");

  const onlineUrl = await getOnlineInvoiceUrl(env, meta.invoiceId);
  return { ...meta, onlineUrl };
}

export async function getOnlineInvoiceUrl(
  env: Env,
  invoiceId: string,
): Promise<string> {
  const res = await xeroFetch(
    env,
    `/api.xro/2.0/Invoices/${invoiceId}/OnlineInvoice`,
  );
  if (!res.ok) return "";
  return extractOnlineUrl(await res.json());
}

export async function getInvoice(
  env: Env,
  invoiceId: string,
): Promise<XeroInvoice | null> {
  const res = await xeroFetch(env, `/api.xro/2.0/Invoices/${invoiceId}`);
  if (!res.ok) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = (await res.json()) as any;
  const invoice = json?.Invoices?.[0];
  if (!invoice) return null;
  return {
    status: String(invoice.Status ?? ""),
    amountDue: Number(invoice.AmountDue ?? 0),
    total: Number(invoice.Total ?? 0),
    currency: String(invoice.CurrencyCode ?? ""),
    reference: String(invoice.Reference ?? ""),
    invoiceNumber: String(invoice.InvoiceNumber ?? ""),
  };
}
