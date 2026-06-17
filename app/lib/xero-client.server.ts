/**
 * Xero API client for a single organisation via a Custom Connection
 * (client_credentials grant — no user login/redirect, no refresh tokens).
 *
 * Network functions take credentials explicitly so this module has no binding
 * imports and its pure helpers stay unit-testable.
 */

const IDENTITY_URL = "https://identity.xero.com/connect/token";
const API_BASE = "https://api.xero.com";
const SCOPES = "accounting.transactions accounting.contacts";

export interface XeroCreds {
  clientId: string;
  clientSecret: string;
}

// Best-effort token + tenant cache (per isolate). client_credentials tokens
// last ~30 min; we re-fetch with a safety margin.
let tokenCache: { token: string; tenantId: string; expiresAt: number } | null =
  null;

async function getToken(creds: XeroCreds): Promise<{
  token: string;
  tenantId: string;
}> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return { token: tokenCache.token, tenantId: tokenCache.tenantId };
  }

  const basic = btoa(`${creds.clientId}:${creds.clientSecret}`);
  const res = await fetch(IDENTITY_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `grant_type=client_credentials&scopes=${encodeURIComponent(SCOPES)}`,
  });
  if (!res.ok) {
    throw new Error(`Xero token request failed: ${res.status}`);
  }
  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };

  const tenantId = await fetchTenantId(json.access_token);
  tokenCache = {
    token: json.access_token,
    tenantId,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return { token: json.access_token, tenantId };
}

async function fetchTenantId(token: string): Promise<string> {
  const res = await fetch(`${API_BASE}/connections`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Xero connections failed: ${res.status}`);
  const conns = (await res.json()) as { tenantId: string }[];
  if (!conns.length) throw new Error("No Xero connections for this app");
  return conns[0].tenantId;
}

async function xeroFetch(
  creds: XeroCreds,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const { token, tenantId } = await getToken(creds);
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
  creds: XeroCreds,
  input: CreateInvoiceInput,
  idempotencyKey: string,
): Promise<CreatedInvoice> {
  const res = await xeroFetch(creds, "/api.xro/2.0/Invoices", {
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

  const onlineUrl = await getOnlineInvoiceUrl(creds, meta.invoiceId);
  return { ...meta, onlineUrl };
}

export async function getOnlineInvoiceUrl(
  creds: XeroCreds,
  invoiceId: string,
): Promise<string> {
  const res = await xeroFetch(
    creds,
    `/api.xro/2.0/Invoices/${invoiceId}/OnlineInvoice`,
  );
  if (!res.ok) return "";
  return extractOnlineUrl(await res.json());
}

export async function getInvoice(
  creds: XeroCreds,
  invoiceId: string,
): Promise<XeroInvoice | null> {
  const res = await xeroFetch(creds, `/api.xro/2.0/Invoices/${invoiceId}`);
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
