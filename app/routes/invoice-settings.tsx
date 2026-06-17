import { env } from "cloudflare:workers";
import { useEffect } from "react";
import { Form, useNavigation, useSearchParams } from "react-router";
import { toast } from "sonner";

import type { Route } from "./+types/invoice-settings";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { requireAdmin } from "~/lib/auth.server";
import { LINE_AMOUNT_TYPES } from "~/lib/invoices";
import {
  getInvoiceSettings,
  updateInvoiceSettings,
} from "~/lib/invoices.server";
import { getGoogleTokens } from "~/lib/google-tokens.server";
import { getXeroTokens } from "~/lib/xero-tokens.server";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Invoice settings · Mellow" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const [settings, xeroTokens, googleTokens] = await Promise.all([
    getInvoiceSettings(env.DB),
    getXeroTokens(env.DB),
    getGoogleTokens(env.DB),
  ]);
  return {
    settings,
    xero: {
      connected: xeroTokens !== null,
      tenantName: xeroTokens?.tenantName ?? null,
    },
    google: {
      connected: googleTokens !== null,
      email: googleTokens?.email ?? null,
    },
  };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();

  const currency = String(form.get("currency") ?? "").trim().toUpperCase();
  const accountCode = String(form.get("accountCode") ?? "").trim();
  const itemDescription = String(form.get("itemDescription") ?? "").trim();
  const lineAmountTypes = String(form.get("lineAmountTypes") ?? "");
  const taxTypeRaw = String(form.get("taxType") ?? "").trim();
  const unitAmount = Number(form.get("unitAmount"));
  const dueDays = Number(form.get("dueDays"));

  if (currency.length !== 3) {
    return { ok: false, message: "Currency must be a 3-letter code." };
  }
  if (!accountCode) {
    return { ok: false, message: "Account code is required." };
  }
  if (!itemDescription) {
    return { ok: false, message: "Item description is required." };
  }
  if (!LINE_AMOUNT_TYPES.includes(lineAmountTypes as never)) {
    return { ok: false, message: "Invalid line amount type." };
  }
  if (!Number.isFinite(unitAmount) || unitAmount < 0) {
    return { ok: false, message: "Unit amount must be a positive number." };
  }
  if (!Number.isInteger(dueDays) || dueDays < 0) {
    return { ok: false, message: "Due days must be a whole number." };
  }

  await updateInvoiceSettings(env.DB, {
    currency,
    unitAmount,
    accountCode,
    taxType: taxTypeRaw || null,
    lineAmountTypes,
    itemDescription,
    dueDays,
  });

  return { ok: true, message: "Invoice settings saved." };
}

export default function InvoiceSettings({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { settings, xero, google } = loaderData;
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (!actionData) return;
    if (actionData.ok) toast.success(actionData.message);
    else toast.error(actionData.message);
  }, [actionData]);

  // One-shot toast after returning from an OAuth round-trip (Xero or Google).
  useEffect(() => {
    const toastFor = (label: string, status: string) => {
      if (status === "connected") toast.success(`${label} connected.`);
      else if (status === "disconnected") toast.success(`${label} disconnected.`);
      else if (status === "error") toast.error(`${label} connection failed.`);
    };
    const xeroStatus = searchParams.get("xero");
    const googleStatus = searchParams.get("google");
    if (!xeroStatus && !googleStatus) return;
    if (xeroStatus) toastFor("Xero", xeroStatus);
    if (googleStatus) toastFor("Gmail", googleStatus);
    setSearchParams(
      (prev) => {
        prev.delete("xero");
        prev.delete("google");
        return prev;
      },
      { replace: true },
    );
  }, [searchParams, setSearchParams]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Invoice settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Defaults forwarded to Xero when an approved submission is invoiced.
        </p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Xero connection</CardTitle>
          <CardDescription>
            Invoices can only be created while connected. Authorizing opens
            Xero's consent screen, then returns here.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <div className="text-sm">
            {xero.connected ? (
              <p>
                <span className="font-medium text-foreground">Connected</span>
                {xero.tenantName ? (
                  <span className="text-muted-foreground">
                    {" "}
                    · {xero.tenantName}
                  </span>
                ) : null}
              </p>
            ) : (
              <p className="text-muted-foreground">Not connected</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {xero.connected ? (
              <>
                <Button asChild variant="outline">
                  <a href="/xero/authorize">Reconnect</a>
                </Button>
                <Form method="post" action="/xero/disconnect">
                  <Button type="submit" variant="destructive">
                    Disconnect
                  </Button>
                </Form>
              </>
            ) : (
              <Button asChild>
                <a href="/xero/authorize">Connect Xero</a>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Email (Gmail)</CardTitle>
          <CardDescription>
            Sends approval emails (with the invoice link) from your Google
            Workspace mailbox. Approval still works while disconnected — the
            email is just skipped.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <div className="text-sm">
            {google.connected ? (
              <p>
                <span className="font-medium text-foreground">Connected</span>
                {google.email ? (
                  <span className="text-muted-foreground"> · {google.email}</span>
                ) : null}
              </p>
            ) : (
              <p className="text-muted-foreground">Not connected</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {google.connected ? (
              <>
                <Button asChild variant="outline">
                  <a href="/google/authorize">Reconnect</a>
                </Button>
                <Form method="post" action="/google/disconnect">
                  <Button type="submit" variant="destructive">
                    Disconnect
                  </Button>
                </Form>
              </>
            ) : (
              <Button asChild>
                <a href="/google/authorize">Connect Gmail</a>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Line item & tax</CardTitle>
          <CardDescription>
            Applied to the single "table fee" line on each generated invoice.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form method="post" className="grid gap-5">
            <div className="grid gap-2">
              <Label htmlFor="itemDescription">Item description</Label>
              <Input
                id="itemDescription"
                name="itemDescription"
                defaultValue={settings.itemDescription}
                required
              />
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="unitAmount">Unit amount</Label>
                <Input
                  id="unitAmount"
                  name="unitAmount"
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={settings.unitAmount}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="currency">Currency</Label>
                <Input
                  id="currency"
                  name="currency"
                  maxLength={3}
                  defaultValue={settings.currency}
                  className="uppercase"
                  required
                />
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="accountCode">Account code</Label>
                <Input
                  id="accountCode"
                  name="accountCode"
                  defaultValue={settings.accountCode}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="dueDays">Due in (days)</Label>
                <Input
                  id="dueDays"
                  name="dueDays"
                  type="number"
                  min={0}
                  step="1"
                  defaultValue={settings.dueDays}
                  required
                />
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="lineAmountTypes">Line amount types</Label>
                <Select
                  name="lineAmountTypes"
                  defaultValue={settings.lineAmountTypes}
                >
                  <SelectTrigger id="lineAmountTypes">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LINE_AMOUNT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="taxType">Tax type</Label>
                <Input
                  id="taxType"
                  name="taxType"
                  defaultValue={settings.taxType ?? ""}
                  placeholder="e.g. OUTPUT (leave blank for none)"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save settings"}
              </Button>
            </div>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
