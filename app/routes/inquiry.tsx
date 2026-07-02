import { env } from "cloudflare:workers";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Copy, Loader2, MoreHorizontal, Paperclip, StickyNote } from "lucide-react";
import { Link, useFetcher, useFetchers, useSearchParams } from "react-router";
import { toast } from "sonner";

import type { Route } from "./+types/inquiry";
import { BaseTable, type FilterDef } from "~/components/base-table";
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
} from "~/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";
import { Textarea } from "~/components/ui/textarea";
import { requireAdmin } from "~/lib/auth.server";
import {
  listQueryToSearchParams,
  type ListQuery,
  type Paginated,
} from "~/lib/data-table";
import { listEventsWithCounts, listStallOptions } from "~/lib/events.server";
import type { EventWithCounts, StallOption } from "~/lib/events";
import {
  createInvoiceForSubmission,
  sendRejectionEmail,
  sendWaitlistEmail,
} from "~/lib/jobs.server";
import {
  assignStall,
  cancelInvoicing,
  setApplicationStatus,
  setPaymentStatus,
  startInvoicing,
} from "~/lib/payments.server";
import { setArchived, setInternalNotes } from "~/lib/submissions.server";
import { logActivity } from "~/lib/activity.server";
import {
  APPLICATION_LABEL,
  APPLICATION_STATUSES,
  applicationToneClass,
  isApplicationStatus,
  isManualPaymentStatus,
  MANUAL_PAYMENT_STATUSES,
  PAYMENT_LABEL,
  paymentToneClass,
  type ApplicationStatus,
  type PaymentStatus,
} from "~/lib/status";
import { cn } from "~/lib/utils";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Artist submissions · Mellow" }];
}

type StallsByEvent = Record<string, StallOption[]>;

// List row (from /api/inquiries).
type Artist = {
  id: string;
  name: string;
  email: string;
  brandName: string | null;
  primaryCategory: string | null;
  secondaryCategory: string | null;
  sharingStall: string | null;
  eventId: string | null;
  status: ApplicationStatus;
  stallOptionId: string | null;
  paymentStatus: PaymentStatus;
  invoiceUrl: string | null;
  rejectReason: string | null;
  internalNotes: string | null;
  archivedAt: string | null;
  submittedAt: string;
};

// Full record (from /api/inquiries/:id).
type DetailImage = {
  id: string;
  kind: "profile" | "portfolio" | "insurance" | "second_portfolio";
  key: string;
  sortOrder: number;
};
type ArtistDetail = Artist & {
  firstName: string;
  lastName: string;
  appliedBefore: string | null;
  website: string | null;
  instagram: string | null;
  bio: string;
  productDescription: string | null;
  eventName: string | null;
  stallTier: string | null;
  firstStallPreference: string | null;
  secondStallPreference: string | null;
  offerMiniIfUnavailable: string | null;
  sharingStall: string | null;
  hasInsurance: string | null;
  additionalNotes: string | null;
  waitlistReason: string | null;
  // Shared-stall second artist ("buddy").
  secondFirstName: string | null;
  secondLastName: string | null;
  secondEmail: string | null;
  secondAppliedBefore: string | null;
  secondBrandName: string | null;
  secondWebsite: string | null;
  secondInstagram: string | null;
  secondBio: string | null;
  secondPrimaryCategory: string | null;
  secondSecondaryCategory: string | null;
  secondProductDescription: string | null;
  images: DetailImage[];
};

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const events = await listEventsWithCounts(env.DB);
  const stalls: StallsByEvent = {};
  for (const e of events) {
    stalls[e.id] = await listStallOptions(env.DB, e.id);
  }
  return { events, stalls };
}

async function fetchArtists(query: ListQuery): Promise<Paginated<Artist>> {
  const res = await fetch(`/api/inquiries?${listQueryToSearchParams(query)}`);
  if (!res.ok) throw new Error("Failed to load submissions");
  return res.json();
}

/** Artist name (or reference) + medium for the activity feed. */
async function submissionSubject(
  id: string,
): Promise<{ name: string; medium: string | null }> {
  const r = await env.DB.prepare(
    "SELECT first_name, last_name, primary_category FROM submissions WHERE id = ?",
  )
    .bind(id)
    .first<{ first_name: string; last_name: string; primary_category: string | null }>();
  const name = r ? `${r.first_name} ${r.last_name}`.trim() : id;
  return { name, medium: r?.primary_category ?? null };
}

export async function action({ request }: Route.ActionArgs) {
  const session = await requireAdmin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const id = String(form.get("id") ?? "");

  if (!id) return { ok: false, message: "Missing reference." };

  try {
    switch (intent) {
    case "set_status": {
      const status = String(form.get("status") ?? "");
      if (!isApplicationStatus(status)) {
        return { ok: false, message: "Unknown status." };
      }
      // Optional decision note — attached to rejected/waitlisted only.
      const reason = String(form.get("reason") ?? "").trim() || null;
      const decisionReason =
        status === "rejected" || status === "waitlisted" ? reason : null;
      const changed = await setApplicationStatus(
        env.DB,
        id,
        status,
        session.email,
        decisionReason,
      );
      if (changed) {
        if (status === "rejected") await sendRejectionEmail(env, id, reason);
        if (status === "waitlisted") await sendWaitlistEmail(env, id, reason);
        const { name } = await submissionSubject(id);
        const phrase: Record<string, string> = {
          accepted: `${name} application approved`,
          waitlisted: `${name} application waitlisted`,
          rejected: `${name} application rejected`,
          pending: `${name} moved back to pending`,
        };
        await logActivity(env.DB, {
          actorId: session.sub,
          actorEmail: session.email,
          submissionId: id,
          subject: name,
          type: status === "accepted" ? "approved" : status,
          message: phrase[status] ?? `${name} ${status}`,
        });
      }
      return changed
        ? { ok: true, message: `${id} set to ${APPLICATION_LABEL[status]}.` }
        : { ok: false, message: `Could not update ${id}.` };
    }

    case "assign_stall": {
      const stallOptionId = String(form.get("stallOptionId") ?? "").trim();
      const changed = await assignStall(env.DB, id, stallOptionId || null);
      return changed
        ? { ok: true, message: `Stall updated for ${id}.` }
        : {
            ok: false,
            message: `${id} must be accepted before assigning a stall.`,
          };
    }

    case "send_invoice": {
      const started = await startInvoicing(env.DB, id);
      if (!started) {
        return {
          ok: false,
          message: `${id} needs to be accepted with a stall assigned first.`,
        };
      }
      try {
        await createInvoiceForSubmission(env, id);
      } catch (err) {
        // Roll the row back out of `invoicing` so the admin can retry, and
        // surface the failure instead of leaving it silently stuck.
        console.error("send_invoice failed", { id, err });
        await cancelInvoicing(env.DB, id);
        return {
          ok: false,
          message: `Couldn't create the Xero invoice for ${id}. Check the Xero connection and try again.`,
        };
      }
      {
        const { name } = await submissionSubject(id);
        await logActivity(env.DB, {
          actorId: session.sub,
          actorEmail: session.email,
          submissionId: id,
          subject: name,
          type: "invoice_sent",
          message: `${name} approved — invoice sent`,
        });
      }
      return { ok: true, message: `${id} invoiced via Xero.` };
    }

    case "set_payment": {
      const payment = String(form.get("payment") ?? "");
      if (!isManualPaymentStatus(payment)) {
        return { ok: false, message: "Unknown payment status." };
      }
      const changed = await setPaymentStatus(env.DB, id, payment);
      if (changed) {
        const { name, medium } = await submissionSubject(id);
        const entry: Record<string, { type: string; subject: string; message: string }> = {
          paid: {
            type: "paid",
            subject: name,
            message: `${name} payment received${medium ? ` · ${medium}` : ""}`,
          },
          overdue: { type: "overdue", subject: name, message: `${name} invoice overdue` },
          voided: { type: "voided", subject: id, message: `${id} invoice voided` },
          awaiting_payment: {
            type: "awaiting",
            subject: name,
            message: `${name} awaiting payment`,
          },
        };
        const e = entry[payment];
        if (e) {
          await logActivity(env.DB, {
            actorId: session.sub,
            actorEmail: session.email,
            submissionId: id,
            subject: e.subject,
            type: e.type,
            message: e.message,
          });
        }
      }
      return changed
        ? { ok: true, message: `${id} payment set to ${PAYMENT_LABEL[payment]}.` }
        : { ok: false, message: `${id} has no invoice to update.` };
    }

    case "set_archived": {
      const archived = String(form.get("archived") ?? "") === "1";
      const changed = await setArchived(env.DB, id, archived);
      return changed
        ? {
            ok: true,
            message: archived ? `${id} archived.` : `${id} unarchived.`,
          }
        : { ok: false, message: `Could not update ${id}.` };
    }

    case "set_notes": {
      const notes = String(form.get("notes") ?? "").trim();
      const changed = await setInternalNotes(env.DB, id, notes || null);
      return changed
        ? { ok: true, message: `Notes saved for ${id}.` }
        : { ok: false, message: `Could not save notes for ${id}.` };
    }

    default:
      return { ok: false, message: "Unknown action." };
    }
  } catch (err) {
    // Any unexpected failure (DB, network, Xero) becomes a toast rather than
    // a broken page or a silent no-op.
    console.error("inquiry action failed", { intent, id, err });
    return { ok: false, message: `Something went wrong. Please try again.` };
  }
}

// Shared fetcher: optimistically patches the row in the cache (so the UI
// updates instantly and doesn't snap back), then toasts + reconciles on
// completion. A global overlay (RowActionOverlay) shows the loading state.
function useRowAction() {
  const fetcher = useFetcher<typeof action>();
  const queryClient = useQueryClient();

  // Patch a row in every cached inquiries page right away.
  const patchRow = useCallback(
    (id: string, patch: Partial<Artist>) => {
      queryClient.setQueriesData<Paginated<Artist>>(
        { queryKey: ["inquiries"] },
        (old) =>
          old && Array.isArray(old.data)
            ? {
                ...old,
                data: old.data.map((r) =>
                  r.id === id ? { ...r, ...patch } : r,
                ),
              }
            : old,
      );
    },
    [queryClient],
  );

  // Drop a row from every cached inquiries page (e.g. it no longer matches the
  // current view after archive/unarchive). Reconciled by the invalidate below.
  const removeRow = useCallback(
    (id: string) => {
      queryClient.setQueriesData<Paginated<Artist>>(
        { queryKey: ["inquiries"] },
        (old) =>
          old && Array.isArray(old.data)
            ? { ...old, data: old.data.filter((r) => r.id !== id) }
            : old,
      );
    },
    [queryClient],
  );

  const submit = useCallback(
    (vars: Record<string, string>, patch?: Partial<Artist>) => {
      if (patch) patchRow(vars.id, patch);
      fetcher.submit(vars, { method: "post" });
    },
    [fetcher, patchRow],
  );

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.ok) {
      toast.success(fetcher.data.message);
      queryClient.invalidateQueries({ queryKey: ["inquiries"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["inquiry"] });
    } else {
      toast.error(fetcher.data.message);
      // Roll the optimistic patch back to server truth.
      queryClient.invalidateQueries({ queryKey: ["inquiries"] });
    }
  }, [fetcher.state, fetcher.data, queryClient]);

  return { fetcher, submit, patchRow, removeRow };
}

/** One centered "Saving…" overlay while any row mutation is in flight. */
function RowActionOverlay() {
  const fetchers = useFetchers();
  // Notes have their own in-dialog feedback, so they don't trigger the overlay.
  const busy = fetchers.some(
    (f) =>
      f.state !== "idle" &&
      f.formData != null &&
      f.formData.get("intent") !== "set_notes",
  );
  if (!busy) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/50 backdrop-blur-[1px]">
      <div className="flex items-center gap-3 rounded-xl border bg-background px-5 py-4 shadow-xl">
        <Loader2 className="size-5 animate-spin text-primary" />
        <span className="text-sm font-medium">Saving…</span>
      </div>
    </div>
  );
}

function Pill({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        className,
      )}
    >
      {children}
    </span>
  );
}

// Reject and waitlist both prompt for an optional note before applying.
const REASON_DECISIONS = {
  rejected: {
    title: "Reject submission",
    verb: "rejecting",
    confirm: "Confirm reject",
    variant: "destructive" as const,
    placeholder: "e.g. Portfolio below the minimum image count",
  },
  waitlisted: {
    title: "Waitlist submission",
    verb: "waitlisting",
    confirm: "Confirm waitlist",
    variant: "default" as const,
    placeholder: "e.g. Strong application — holding for a later spot",
  },
} as const;

type ReasonDecision = keyof typeof REASON_DECISIONS;

function ApplicationStatusCell({ artist }: { artist: Artist }) {
  const { fetcher, submit, patchRow } = useRowAction();
  // Rejecting or waitlisting opens a dialog for an optional note first.
  const [reasonFor, setReasonFor] = useState<ReasonDecision | null>(null);

  function onChange(value: string) {
    if (value === artist.status) return;
    if (value === "rejected" || value === "waitlisted") {
      setReasonFor(value);
      return;
    }
    submit(
      { intent: "set_status", id: artist.id, status: value },
      { status: value as ApplicationStatus },
    );
  }

  // Keep the closed dialog rendered with the last decision's copy so it doesn't
  // flicker while animating out; `copy` is only visible when reasonFor is set.
  const copy = REASON_DECISIONS[reasonFor ?? "rejected"];

  return (
    <>
      <Select value={artist.status} onValueChange={onChange}>
        <SelectTrigger
          size="sm"
          className={cn(
            "w-[132px] border-0",
            applicationToneClass(artist.status),
          )}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {APPLICATION_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {APPLICATION_LABEL[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Dialog
        open={reasonFor !== null}
        onOpenChange={(open) => !open && setReasonFor(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogDescription>
              Optionally add a reason for {copy.verb}{" "}
              <span className="font-medium text-foreground">{artist.name}</span>
              . If provided, it's included in the notification email.
            </DialogDescription>
          </DialogHeader>
          <fetcher.Form
            method="post"
            className="grid gap-4"
            onSubmit={() => {
              if (reasonFor) patchRow(artist.id, { status: reasonFor });
              setReasonFor(null);
            }}
          >
            <input type="hidden" name="intent" value="set_status" />
            <input type="hidden" name="id" value={artist.id} />
            <input type="hidden" name="status" value={reasonFor ?? ""} />
            <div className="grid gap-2">
              <Label htmlFor={`reason-${artist.id}`}>Reason (optional)</Label>
              <Textarea
                id={`reason-${artist.id}`}
                name="reason"
                rows={4}
                placeholder={copy.placeholder}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setReasonFor(null)}
              >
                Cancel
              </Button>
              <Button type="submit" variant={copy.variant}>
                {copy.confirm}
              </Button>
            </DialogFooter>
          </fetcher.Form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StallCell({
  artist,
  stalls,
}: {
  artist: Artist;
  stalls: StallsByEvent;
}) {
  const { submit } = useRowAction();

  if (artist.status !== "accepted") {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  const options = artist.eventId ? stalls[artist.eventId] ?? [] : [];
  if (options.length === 0) {
    return artist.eventId ? (
      <Link
        to={`/events/${artist.eventId}`}
        className="text-sm text-primary underline-offset-2 hover:underline"
      >
        Configure stall options
      </Link>
    ) : (
      <span className="text-sm text-muted-foreground">No event</span>
    );
  }

  // Once an invoice exists (payment machine started), the stall is locked in.
  const locked = artist.paymentStatus !== "none";

  return (
    <Select
      value={artist.stallOptionId ?? ""}
      disabled={locked}
      onValueChange={(v) =>
        submit(
          { intent: "assign_stall", id: artist.id, stallOptionId: v },
          { stallOptionId: v },
        )
      }
    >
      <SelectTrigger
        size="sm"
        className="w-[168px]"
        title={locked ? "Locked once the invoice is sent" : undefined}
      >
        <SelectValue placeholder="Assign stall" />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.tier} — ${o.unitAmount} {o.currency}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function XeroCell({ artist }: { artist: Artist }) {
  const { submit } = useRowAction();

  // Already in the payment machine — link to the invoice if we have it.
  if (artist.paymentStatus !== "none") {
    return artist.invoiceUrl ? (
      <a
        href={artist.invoiceUrl}
        target="_blank"
        rel="noreferrer"
        className="text-sm text-primary underline-offset-2 hover:underline"
      >
        View invoice
      </a>
    ) : (
      <span className="text-sm text-muted-foreground">Sent</span>
    );
  }

  const sendable =
    artist.status === "accepted" && artist.stallOptionId != null;
  if (!sendable) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  return (
    <Button
      size="sm"
      onClick={() =>
        submit(
          { intent: "send_invoice", id: artist.id },
          { paymentStatus: "invoicing" },
        )
      }
    >
      Send invoice
    </Button>
  );
}

function PaymentStatusCell({ artist }: { artist: Artist }) {
  const { submit } = useRowAction();

  // Manual statuses are only valid once an invoice exists.
  if (artist.paymentStatus === "none" || artist.paymentStatus === "invoicing") {
    return (
      <Pill className={paymentToneClass(artist.paymentStatus)}>
        {PAYMENT_LABEL[artist.paymentStatus]}
      </Pill>
    );
  }

  return (
    <Select
      value={artist.paymentStatus}
      onValueChange={(v) =>
        submit(
          { intent: "set_payment", id: artist.id, payment: v },
          { paymentStatus: v as PaymentStatus },
        )
      }
    >
      <SelectTrigger
        size="sm"
        className={cn(
          "w-[168px] border-0",
          paymentToneClass(artist.paymentStatus),
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {MANUAL_PAYMENT_STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            {PAYMENT_LABEL[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function NotesCell({ artist }: { artist: Artist }) {
  const { fetcher } = useRowAction();
  const [open, setOpen] = useState(false);
  const busy = fetcher.state !== "idle";
  const hasNotes = (artist.internalNotes ?? "").trim().length > 0;

  // Close the dialog only after a real save cycle completes successfully —
  // tracking the busy→idle transition so reopening doesn't auto-close on the
  // stale `fetcher.data` from a previous save.
  const wasBusy = useRef(false);
  useEffect(() => {
    if (busy) {
      wasBusy.current = true;
    } else if (wasBusy.current) {
      wasBusy.current = false;
      if (fetcher.data?.ok) setOpen(false);
    }
  }, [busy, fetcher.data]);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        onClick={() => setOpen(true)}
        title={hasNotes ? "Edit notes" : "Add notes"}
      >
        <StickyNote
          className={cn(
            "size-4",
            hasNotes ? "text-primary" : "text-muted-foreground",
          )}
          fill={hasNotes ? "currentColor" : "none"}
        />
        <span className="sr-only">
          {hasNotes ? "Edit internal notes" : "Add internal notes"}
        </span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Internal notes</DialogTitle>
            <DialogDescription>
              Private staff notes for{" "}
              <span className="font-medium text-foreground">{artist.name}</span>.
              Never shown to the applicant.
            </DialogDescription>
          </DialogHeader>
          <fetcher.Form method="post" className="grid gap-4">
            <input type="hidden" name="intent" value="set_notes" />
            <input type="hidden" name="id" value={artist.id} />
            <Textarea
              name="notes"
              rows={5}
              defaultValue={artist.internalNotes ?? ""}
              placeholder="e.g. Strong portfolio — follow up about table sharing."
            />
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
                {busy ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  "Save notes"
                )}
              </Button>
            </DialogFooter>
          </fetcher.Form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Human-friendly submission date, e.g. "2 Jul 2026". */
function formatSubmittedAt(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function makeColumns(stalls: StallsByEvent): ColumnDef<Artist>[] {
  return [
    {
      accessorKey: "id",
      header: "Reference",
      enableSorting: false,
      cell: ({ row }) => <span className="font-medium">{row.original.id}</span>,
    },
    { accessorKey: "name", header: "Name" },
    {
      accessorKey: "email",
      header: "Email",
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.email}</span>
      ),
    },
    {
      accessorKey: "brandName",
      header: "Brand",
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.brandName ?? "—"}</span>
      ),
    },
    {
      accessorKey: "sharingStall",
      header: "Sharing table",
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.sharingStall ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "submittedAt",
      header: "Submitted",
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {formatSubmittedAt(row.original.submittedAt)}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Application",
      cell: ({ row }) => <ApplicationStatusCell artist={row.original} />,
    },
    {
      id: "stall",
      header: "Stall assigned",
      enableSorting: false,
      cell: ({ row }) => <StallCell artist={row.original} stalls={stalls} />,
    },
    {
      id: "xero",
      header: "Invoice",
      enableSorting: false,
      cell: ({ row }) => <XeroCell artist={row.original} />,
    },
    {
      accessorKey: "paymentStatus",
      header: "Payment",
      cell: ({ row }) => <PaymentStatusCell artist={row.original} />,
    },
    {
      id: "notes",
      header: () => <span className="sr-only">Notes</span>,
      enableSorting: false,
      cell: ({ row }) => <NotesCell artist={row.original} />,
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      enableSorting: false,
      cell: ({ row }) => (
        <div className="text-right">
          <RowActions artist={row.original} />
        </div>
      ),
    },
  ];
}

export default function Inquiry({ loaderData }: Route.ComponentProps) {
  const { events, stalls } = loaderData;
  const [searchParams] = useSearchParams();
  const eventParam = searchParams.get("event") ?? undefined;

  const columns = useMemo(() => makeColumns(stalls), [stalls]);

  // The stall filter is scoped to the currently selected event, so we mirror
  // that filter's value here to build the right stall options.
  const [selectedEvent, setSelectedEvent] = useState<string | null>(
    eventParam ?? null,
  );

  const filters: FilterDef[] = useMemo(() => {
    const defs: FilterDef[] = [
      {
        id: "status",
        label: "Application",
        options: APPLICATION_STATUSES.map((s) => ({
          label: APPLICATION_LABEL[s],
          value: s,
        })),
      },
      {
        id: "payment_status",
        label: "Payment",
        options: (
          [
            "awaiting_payment",
            "paid",
            "overdue",
            "voided",
            "none",
          ] as PaymentStatus[]
        ).map((s) => ({ label: PAYMENT_LABEL[s], value: s })),
      },
      {
        id: "event_id",
        label: "Event",
        options: events.map((e: EventWithCounts) => ({
          label: e.name,
          value: e.id,
        })),
      },
      {
        // "All views" (the cleared state) shows both active + archived.
        id: "view",
        label: "views",
        options: [
          { label: "Active", value: "active" },
          { label: "Archived", value: "archived" },
        ],
      },
    ];

    // Only meaningful once a single event is selected — stalls are per-event.
    const stallOptions = selectedEvent ? stalls[selectedEvent] ?? [] : [];
    if (stallOptions.length > 0) {
      defs.push({
        id: "stall_option_id",
        label: "Stall",
        options: stallOptions.map((o) => ({
          label: `${o.tier} — $${o.unitAmount} ${o.currency}`,
          value: o.id,
        })),
      });
    }

    return defs;
  }, [events, stalls, selectedEvent]);

  // Track the live table query so Copy emails can reproduce the filtered set
  // and so the stall filter can follow the selected event.
  const queryRef = useRef<ListQuery>({ page: 1, pageSize: 10 });
  const onQueryChange = useCallback((q: ListQuery) => {
    queryRef.current = q;
    setSelectedEvent(q.filters?.event_id ?? null);
  }, []);

  const copyEmails = useCallback(async () => {
    const sp = listQueryToSearchParams(queryRef.current);
    sp.set("emails", "1");
    try {
      const res = await fetch(`/api/inquiries?${sp}`);
      if (!res.ok) throw new Error();
      const { emails } = (await res.json()) as { emails: string[] };
      if (!emails.length) {
        toast.message("No emails match the current filters.");
        return;
      }
      await navigator.clipboard.writeText(emails.join(", "));
      toast.success(`Copied ${emails.length} email${emails.length === 1 ? "" : "s"}.`);
    } catch {
      toast.error("Could not copy emails.");
    }
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <RowActionOverlay />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Artist submissions
        </h1>
        <p className="text-sm text-muted-foreground">
          Review applications, assign stalls, and trigger Xero invoices.
        </p>
      </div>

      <BaseTable
        queryKey={["inquiries"]}
        queryFn={fetchArtists}
        columns={columns}
        getRowId={(a) => a.id}
        refetchInterval={15000}
        searchPlaceholder="Search name or email…"
        filters={filters}
        defaultMode="table"
        initialFilters={{
          view: "active",
          ...(eventParam ? { event_id: eventParam } : {}),
        }}
        onQueryChange={onQueryChange}
        toolbarExtra={
          <Button variant="outline" size="sm" onClick={copyEmails}>
            <Copy className="size-4" />
            Copy emails
          </Button>
        }
        renderGridItem={(a) => <ArtistCard artist={a} stalls={stalls} />}
        renderListItem={(a) => <ArtistRow artist={a} />}
        emptyMessage="No submissions match your filters."
      />
    </div>
  );
}

function StatusPills({ artist }: { artist: Artist }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Pill className={applicationToneClass(artist.status)}>
        {APPLICATION_LABEL[artist.status]}
      </Pill>
      <Pill className={paymentToneClass(artist.paymentStatus)}>
        {PAYMENT_LABEL[artist.paymentStatus]}
      </Pill>
    </div>
  );
}

function ArtistCard({
  artist,
  stalls,
}: {
  artist: Artist;
  stalls: StallsByEvent;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{artist.name}</CardTitle>
            <p className="text-xs text-muted-foreground">{artist.id}</p>
          </div>
          <StatusPills artist={artist} />
        </div>
      </CardHeader>
      <CardContent className="flex items-end justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          <p>{artist.brandName ?? "—"}</p>
          <p>{artist.primaryCategory ?? "—"}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StallCell artist={artist} stalls={stalls} />
          <RowActions artist={artist} />
        </div>
      </CardContent>
    </Card>
  );
}

function ArtistRow({ artist }: { artist: Artist }) {
  return (
    <div className="flex items-center justify-between gap-3 p-3">
      <div className="min-w-0">
        <p className="truncate font-medium">
          {artist.name}{" "}
          <span className="font-normal text-muted-foreground">
            · {artist.id}
          </span>
        </p>
        <p className="truncate text-sm text-muted-foreground">
          {artist.brandName ?? artist.primaryCategory ?? "—"} · {artist.email}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <StatusPills artist={artist} />
        <RowActions artist={artist} />
      </div>
    </div>
  );
}

function RowActions({ artist }: { artist: Artist }) {
  const [viewOpen, setViewOpen] = useState(false);
  const { submit, removeRow } = useRowAction();
  const archived = artist.archivedAt != null;

  function toggleArchive() {
    // Optimistically drop it from the current view; the refetch reconciles.
    removeRow(artist.id);
    submit({
      intent: "set_archived",
      id: artist.id,
      archived: archived ? "0" : "1",
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8">
            <MoreHorizontal className="size-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => setViewOpen(true)}>
            View profile
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={toggleArchive}>
            {archived ? "Unarchive" : "Archive"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ViewProfileDialog
        artist={artist}
        open={viewOpen}
        onOpenChange={setViewOpen}
      />
    </>
  );
}

function ViewProfileDialog({
  artist,
  open,
  onOpenChange,
}: {
  artist: Artist;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isPending, isError } = useQuery({
    queryKey: ["inquiry", artist.id],
    queryFn: async (): Promise<ArtistDetail> => {
      const res = await fetch(`/api/inquiries/${artist.id}`);
      if (!res.ok) throw new Error("Failed to load profile");
      return res.json();
    },
    enabled: open,
  });

  const portfolio = data?.images.filter((i) => i.kind === "portfolio") ?? [];
  const insurance = data?.images.filter((i) => i.kind === "insurance") ?? [];
  const secondPortfolio =
    data?.images.filter((i) => i.kind === "second_portfolio") ?? [];
  // Show the second-artist block whenever any buddy data came through.
  const secondName = [data?.secondFirstName, data?.secondLastName]
    .filter(Boolean)
    .join(" ");
  const hasSecondArtist = Boolean(
    data &&
      (secondName ||
        data.secondEmail ||
        data.secondBrandName ||
        secondPortfolio.length),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>{artist.name}</DialogTitle>
          <DialogDescription>{artist.id}</DialogDescription>
        </DialogHeader>

        {isPending ? (
          <div className="grid gap-3">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : isError || !data ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Could not load this profile.
          </p>
        ) : (
          <div className="grid gap-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-lg font-medium">{data.brandName ?? data.name}</p>
                {data.instagram && (
                  <p className="text-sm text-muted-foreground">{data.instagram}</p>
                )}
              </div>
              <StatusPills artist={data} />
            </div>

            <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <Detail label="Email" value={data.email || "—"} />
              <Detail label="Applied before" value={data.appliedBefore ?? "—"} />
              <Detail label="Brand" value={data.brandName ?? "—"} />
              <Detail label="Website" value={data.website ?? "—"} />
              <Detail label="Instagram" value={data.instagram ?? "—"} />
              <Detail label="Primary category" value={data.primaryCategory ?? "—"} />
              <Detail label="Secondary category" value={data.secondaryCategory ?? "—"} />
              <Detail label="Event" value={data.eventName ?? "—"} />
              <Detail label="1st stall preference" value={data.firstStallPreference ?? "—"} />
              <Detail label="2nd stall preference" value={data.secondStallPreference ?? "—"} />
              <Detail label="Take paired Mini?" value={data.offerMiniIfUnavailable ?? "—"} />
              <Detail label="Sharing a stall?" value={data.sharingStall ?? "—"} />
              <Detail label="$10M insurance?" value={data.hasInsurance ?? "—"} />
              <Detail label="Stall assigned" value={data.stallTier ?? "—"} />
              <Detail label="Payment" value={PAYMENT_LABEL[data.paymentStatus]} />
            </dl>

            <Field label="Artist bio">
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {data.bio}
              </p>
            </Field>

            {data.productDescription && (
              <Field label="Product description">
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {data.productDescription}
                </p>
              </Field>
            )}

            {data.additionalNotes && (
              <Field label="Additional notes">
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {data.additionalNotes}
                </p>
              </Field>
            )}

            {data.internalNotes && (
              <Field label="Internal notes (staff only)">
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {data.internalNotes}
                </p>
              </Field>
            )}

            {data.rejectReason && (
              <Field label="Rejection reason">
                <p className="text-sm text-destructive">{data.rejectReason}</p>
              </Field>
            )}

            {data.waitlistReason && (
              <Field label="Waitlist reason">
                <p className="text-sm text-muted-foreground">
                  {data.waitlistReason}
                </p>
              </Field>
            )}

            <Field label="Documents">
              <div className="flex flex-wrap gap-2">
                {portfolio.map((doc, i) => (
                  <DocLink
                    key={doc.id}
                    href={`/api/files/${doc.key}`}
                    label={portfolio.length > 1 ? `Portfolio ${i + 1}` : "Portfolio"}
                  />
                ))}
                {insurance.map((doc, i) => (
                  <DocLink
                    key={doc.id}
                    href={`/api/files/${doc.key}`}
                    label={insurance.length > 1 ? `Insurance ${i + 1}` : "Insurance"}
                  />
                ))}
                {portfolio.length === 0 && insurance.length === 0 && (
                  <span className="text-sm text-muted-foreground">
                    No documents uploaded.
                  </span>
                )}
              </div>
            </Field>

            {hasSecondArtist && data && (
              <div className="grid gap-4 rounded-lg border border-dashed p-4">
                <div>
                  <p className="text-sm font-semibold">Second artist</p>
                  <p className="text-xs text-muted-foreground">
                    Sharing a stall with the main applicant.
                  </p>
                </div>

                <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  <Detail label="Name" value={secondName || "—"} />
                  <Detail label="Email" value={data.secondEmail ?? "—"} />
                  <Detail
                    label="Applied before"
                    value={data.secondAppliedBefore ?? "—"}
                  />
                  <Detail label="Brand" value={data.secondBrandName ?? "—"} />
                  <Detail label="Website" value={data.secondWebsite ?? "—"} />
                  <Detail label="Instagram" value={data.secondInstagram ?? "—"} />
                  <Detail
                    label="Primary category"
                    value={data.secondPrimaryCategory ?? "—"}
                  />
                  <Detail
                    label="Secondary category"
                    value={data.secondSecondaryCategory ?? "—"}
                  />
                </dl>

                {data.secondBio && (
                  <Field label="Artist bio">
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                      {data.secondBio}
                    </p>
                  </Field>
                )}

                {data.secondProductDescription && (
                  <Field label="Product description">
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                      {data.secondProductDescription}
                    </p>
                  </Field>
                )}

                <Field label="Documents">
                  <div className="flex flex-wrap gap-2">
                    {secondPortfolio.length > 0 ? (
                      secondPortfolio.map((doc, i) => (
                        <DocLink
                          key={doc.id}
                          href={`/api/files/${doc.key}`}
                          label={
                            secondPortfolio.length > 1
                              ? `Portfolio ${i + 1}`
                              : "Portfolio"
                          }
                        />
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        No portfolio uploaded.
                      </span>
                    )}
                  </div>
                </Field>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Detail({ label, value }: { label: string; value?: string }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="col-span-2 break-words">{value ?? "—"}</dd>
    </div>
  );
}

function DocLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm text-primary underline-offset-2 hover:bg-muted hover:underline"
    >
      <Paperclip className="size-3.5" />
      {label}
    </a>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <p className="text-sm font-medium">{label}</p>
      {children}
    </div>
  );
}
