import { useEffect, useState, type ReactNode } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useFetcher } from "react-router";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
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
import type { StallOption } from "~/lib/events";

type ActionResult = { ok: boolean; message: string };

// Toast + auto-close once a fetcher settles successfully. The fetcher posts to
// the host route's action, which must handle create/update/delete intents.
function useStallFetcher(onSuccess: () => void) {
  const fetcher = useFetcher<ActionResult>();
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

/** Add button + list of stall options for one event. */
export function StallOptionsManager({
  eventId,
  stalls,
}: {
  eventId: string;
  stalls: StallOption[];
}) {
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {stalls.length} stall option{stalls.length === 1 ? "" : "s"}
        </p>
        <StallDialog
          eventId={eventId}
          trigger={
            <Button size="sm" variant="outline">
              <Plus className="size-4" />
              Add stall option
            </Button>
          }
        />
      </div>

      {stalls.length === 0 ? (
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">
              No stall options yet. Add at least one so accepted applicants can
              be assigned a stall and invoiced.
            </p>
          </CardContent>
        </Card>
      ) : (
        stalls.map((s) => <StallRow key={s.id} eventId={eventId} stall={s} />)
      )}
    </div>
  );
}

function StallRow({ eventId, stall }: { eventId: string; stall: StallOption }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4 py-4">
        <div className="min-w-0">
          <p className="font-medium">
            {stall.tier}{" "}
            <span className="font-normal text-muted-foreground">
              · ${stall.unitAmount} {stall.currency}
              {stall.slug ? ` · ${stall.slug}` : ""}
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
            Event-scoped. The price is GST-inclusive and drives the Xero invoice
            amount.
          </DialogDescription>
        </DialogHeader>
        <fetcher.Form method="post" className="grid gap-4">
          <input
            type="hidden"
            name="intent"
            value={editing ? "update" : "create"}
          />
          <input type="hidden" name="eventId" value={eventId} />
          {editing && <input type="hidden" name="stallId" value={stall.id} />}

          <div className="grid gap-4 sm:grid-cols-2">
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
            <div className="grid gap-2">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                name="slug"
                defaultValue={stall?.slug ?? ""}
                placeholder="standard-debut"
                className="lowercase"
              />
            </div>
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
