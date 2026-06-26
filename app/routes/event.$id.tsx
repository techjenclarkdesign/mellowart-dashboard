import { env } from "cloudflare:workers";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { Link, useFetcher } from "react-router";
import { toast } from "sonner";

import type { Route } from "./+types/event.$id";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { requireAdmin } from "~/lib/auth.server";
import type { StallOption } from "~/lib/events";
import {
  createStallOption,
  deleteStallOption,
  getEvent,
  listStallOptions,
  updateStallOption,
  type StallOptionInput,
} from "~/lib/events.server";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `${data?.event?.name ?? "Event"} · Mellow` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAdmin(request);
  const event = await getEvent(env.DB, params.id);
  if (!event) throw new Response("Not found", { status: 404 });
  const stalls = await listStallOptions(env.DB, params.id);
  return { event, stalls };
}

function parseStallForm(form: FormData): StallOptionInput | { error: string } {
  const tier = String(form.get("tier") ?? "").trim();
  const unitAmount = Number(form.get("unitAmount"));
  const currency = String(form.get("currency") ?? "").trim().toUpperCase();
  if (!tier) return { error: "Tier name is required." };
  if (!Number.isFinite(unitAmount) || unitAmount < 0) {
    return { error: "Price must be a positive number." };
  }
  if (currency.length !== 3) {
    return { error: "Currency must be a 3-letter code." };
  }
  const sortOrder = Number(form.get("sortOrder"));
  return {
    tier,
    unitAmount,
    currency,
    frontage: String(form.get("frontage") ?? "").trim() || null,
    furniture: String(form.get("furniture") ?? "").trim() || null,
    sharing: String(form.get("sharing") ?? "").trim() || null,
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "delete") {
    const id = String(form.get("stallId") ?? "");
    const ok = await deleteStallOption(env.DB, id);
    return ok
      ? { ok: true, message: "Stall option deleted." }
      : { ok: false, message: "Could not delete stall option." };
  }

  const parsed = parseStallForm(form);
  if ("error" in parsed) return { ok: false, message: parsed.error };

  if (intent === "create") {
    await createStallOption(env.DB, params.id, parsed);
    return { ok: true, message: "Stall option added." };
  }
  if (intent === "update") {
    const id = String(form.get("stallId") ?? "");
    const ok = await updateStallOption(env.DB, id, parsed);
    return ok
      ? { ok: true, message: "Stall option updated." }
      : { ok: false, message: "Could not update stall option." };
  }

  return { ok: false, message: "Unknown action." };
}

export default function EventDetail({ loaderData }: Route.ComponentProps) {
  const { event, stalls } = loaderData;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
            <Link to="/events">
              <ArrowLeft className="size-4" />
              Events
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">
            {event.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            Stall options for this event. Prices feed the Xero invoice when a
            stall is assigned.
          </p>
        </div>
        <StallDialog
          eventId={event.id}
          trigger={
            <Button size="sm">
              <Plus className="size-4" />
              Add stall option
            </Button>
          }
        />
      </div>

      {stalls.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No stall options yet</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Add at least one stall option so accepted applicants can be
              assigned a stall and invoiced.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {stalls.map((s) => (
            <StallRow key={s.id} eventId={event.id} stall={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function StallRow({
  eventId,
  stall,
}: {
  eventId: string;
  stall: StallOption;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4 py-4">
        <div className="min-w-0">
          <p className="font-medium">
            {stall.tier}{" "}
            <span className="font-normal text-muted-foreground">
              · ${stall.unitAmount} {stall.currency}
            </span>
          </p>
          <p className="truncate text-sm text-muted-foreground">
            {[stall.frontage, stall.furniture, stall.sharing]
              .filter(Boolean)
              .join(" · ") || "No details"}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <StallDialog
            eventId={eventId}
            stall={stall}
            trigger={
              <Button variant="ghost" size="icon" className="size-8">
                <Pencil className="size-4" />
                <span className="sr-only">Edit</span>
              </Button>
            }
          />
          <DeleteStallButton stall={stall} />
        </div>
      </CardContent>
    </Card>
  );
}

// Toast + auto-close once a fetcher settles successfully.
function useStallFetcher(onSuccess: () => void) {
  const fetcher = useFetcher<typeof action>();
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.ok) {
      toast.success(fetcher.data.message);
      onSuccess();
    } else {
      toast.error(fetcher.data.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);
  return fetcher;
}

function StallDialog({
  eventId,
  stall,
  trigger,
}: {
  eventId: string;
  stall?: StallOption;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const fetcher = useStallFetcher(() => setOpen(false));
  const busy = fetcher.state !== "idle";
  const editing = stall != null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit stall option" : "Add stall option"}
          </DialogTitle>
          <DialogDescription>
            Event-scoped. The price is GST-inclusive and drives the Xero
            invoice amount.
          </DialogDescription>
        </DialogHeader>
        <fetcher.Form method="post" className="grid gap-4">
          <input type="hidden" name="intent" value={editing ? "update" : "create"} />
          <input type="hidden" name="eventId" value={eventId} />
          {editing && <input type="hidden" name="stallId" value={stall.id} />}

          <div className="grid gap-2">
            <Label htmlFor="tier">Tier</Label>
            <Input
              id="tier"
              name="tier"
              defaultValue={stall?.tier}
              placeholder="e.g. Standard – Debut"
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="unitAmount">Price</Label>
              <Input
                id="unitAmount"
                name="unitAmount"
                type="number"
                min={0}
                step="0.01"
                defaultValue={stall?.unitAmount}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="currency">Currency</Label>
              <Input
                id="currency"
                name="currency"
                maxLength={3}
                defaultValue={stall?.currency ?? "AUD"}
                className="uppercase"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sortOrder">Order</Label>
              <Input
                id="sortOrder"
                name="sortOrder"
                type="number"
                step="1"
                defaultValue={stall?.sortOrder ?? 0}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="frontage">Frontage / space</Label>
            <Input
              id="frontage"
              name="frontage"
              defaultValue={stall?.frontage ?? ""}
              placeholder="e.g. 2m frontage"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="furniture">Furniture</Label>
            <Input
              id="furniture"
              name="furniture"
              defaultValue={stall?.furniture ?? ""}
              placeholder="e.g. 1.8m trestle + 2 chairs"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sharing">Sharing</Label>
            <Input
              id="sharing"
              name="sharing"
              defaultValue={stall?.sharing ?? ""}
              placeholder="e.g. Max 2 brands"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : editing ? "Save changes" : "Add stall option"}
            </Button>
          </DialogFooter>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteStallButton({ stall }: { stall: StallOption }) {
  const [open, setOpen] = useState(false);
  const fetcher = useStallFetcher(() => setOpen(false));
  const busy = fetcher.state !== "idle";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8">
          <Trash2 className="size-4 text-destructive" />
          <span className="sr-only">Delete</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete stall option</DialogTitle>
          <DialogDescription>
            Delete{" "}
            <span className="font-medium text-foreground">{stall.tier}</span>?
            Applicants currently assigned this stall will have it cleared.
          </DialogDescription>
        </DialogHeader>
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="delete" />
          <input type="hidden" name="stallId" value={stall.id} />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={busy}>
              {busy ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  );
}
