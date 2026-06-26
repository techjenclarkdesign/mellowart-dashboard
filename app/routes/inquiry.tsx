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
import { Copy, Loader2, MoreHorizontal, StickyNote } from "lucide-react";
import { Link, useFetcher, useSearchParams } from "react-router";
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
} from "~/lib/jobs.server";
import {
  assignStall,
  cancelInvoicing,
  setApplicationStatus,
  setPaymentStatus,
  startInvoicing,
} from "~/lib/payments.server";
import { setInternalNotes } from "~/lib/submissions.server";
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
  primaryMedium: string;
  styleCategory: string;
  location: string;
  eventId: string | null;
  status: ApplicationStatus;
  stallOptionId: string | null;
  paymentStatus: PaymentStatus;
  invoiceUrl: string | null;
  rejectReason: string | null;
  internalNotes: string | null;
  submittedAt: string;
};

// Full record (from /api/inquiries/:id).
type DetailImage = {
  id: string;
  kind: "profile" | "portfolio";
  key: string;
  sortOrder: number;
};
type ArtistDetail = Artist & {
  firstName: string;
  lastName: string;
  phone: string;
  bio: string;
  eventName: string | null;
  stallTier: string | null;
  socialLink: string | null;
  customOrders: string | null;
  additionalNotes: string | null;
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
      const reason = String(form.get("reason") ?? "").trim();
      if (status === "rejected" && reason.length < 3) {
        return { ok: false, message: "A reason is required to reject." };
      }
      const changed = await setApplicationStatus(
        env.DB,
        id,
        status,
        session.email,
        status === "rejected" ? reason : null,
      );
      if (changed && status === "rejected") {
        await sendRejectionEmail(env, id, reason);
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
      return { ok: true, message: `${id} invoiced via Xero.` };
    }

    case "set_payment": {
      const payment = String(form.get("payment") ?? "");
      if (!isManualPaymentStatus(payment)) {
        return { ok: false, message: "Unknown payment status." };
      }
      const changed = await setPaymentStatus(env.DB, id, payment);
      return changed
        ? { ok: true, message: `${id} payment set to ${PAYMENT_LABEL[payment]}.` }
        : { ok: false, message: `${id} has no invoice to update.` };
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

// Shared fetcher that toasts + refreshes the table after any row mutation.
function useRowAction() {
  const fetcher = useFetcher<typeof action>();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.ok) {
      toast.success(fetcher.data.message);
      queryClient.invalidateQueries({ queryKey: ["inquiries"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["inquiry"] });
    } else {
      toast.error(fetcher.data.message);
    }
  }, [fetcher.state, fetcher.data, queryClient]);
  return fetcher;
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

function ApplicationStatusCell({ artist }: { artist: Artist }) {
  const fetcher = useRowAction();
  const [rejectOpen, setRejectOpen] = useState(false);
  const busy = fetcher.state !== "idle";
  // While a change is in flight, show the value being submitted (optimistic),
  // so the dropdown doesn't snap back to the old status mid-request.
  const pending =
    busy && fetcher.formData?.get("intent") === "set_status"
      ? (fetcher.formData.get("status") as string)
      : null;
  const value = pending ?? artist.status;

  function onChange(value: string) {
    if (value === artist.status) return;
    if (value === "rejected") {
      setRejectOpen(true);
      return;
    }
    fetcher.submit(
      { intent: "set_status", id: artist.id, status: value },
      { method: "post" },
    );
  }

  return (
    <>
      <Select value={value} onValueChange={onChange} disabled={busy}>
        <SelectTrigger
          size="sm"
          className={cn("w-[132px] border-0", applicationToneClass(value))}
        >
          {busy ? (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              {APPLICATION_LABEL[value as ApplicationStatus]}
            </span>
          ) : (
            <SelectValue />
          )}
        </SelectTrigger>
        <SelectContent>
          {APPLICATION_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {APPLICATION_LABEL[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject submission</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting{" "}
              <span className="font-medium text-foreground">{artist.name}</span>
              . It is included in the notification email.
            </DialogDescription>
          </DialogHeader>
          <fetcher.Form
            method="post"
            className="grid gap-4"
            onSubmit={() => setRejectOpen(false)}
          >
            <input type="hidden" name="intent" value="set_status" />
            <input type="hidden" name="id" value={artist.id} />
            <input type="hidden" name="status" value="rejected" />
            <div className="grid gap-2">
              <Label htmlFor={`reason-${artist.id}`}>Reason</Label>
              <Textarea
                id={`reason-${artist.id}`}
                name="reason"
                required
                minLength={3}
                rows={4}
                placeholder="e.g. Portfolio below the minimum image count"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRejectOpen(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={busy}>
                {busy ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Rejecting…
                  </>
                ) : (
                  "Confirm reject"
                )}
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
  const fetcher = useRowAction();

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

  const busy = fetcher.state !== "idle";
  const pending =
    busy && fetcher.formData?.get("intent") === "assign_stall"
      ? (fetcher.formData.get("stallOptionId") as string)
      : null;
  const value = pending ?? artist.stallOptionId ?? "";

  return (
    <Select
      value={value}
      disabled={busy}
      onValueChange={(v) =>
        fetcher.submit(
          { intent: "assign_stall", id: artist.id, stallOptionId: v },
          { method: "post" },
        )
      }
    >
      <SelectTrigger size="sm" className="w-[168px]">
        {busy ? (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Saving…
          </span>
        ) : (
          <SelectValue placeholder="Assign stall" />
        )}
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
  const fetcher = useRowAction();
  const busy = fetcher.state !== "idle";

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
    <fetcher.Form method="post">
      <input type="hidden" name="intent" value="send_invoice" />
      <input type="hidden" name="id" value={artist.id} />
      <Button type="submit" size="sm" disabled={busy}>
        {busy ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Sending…
          </>
        ) : (
          "Send invoice"
        )}
      </Button>
    </fetcher.Form>
  );
}

function PaymentStatusCell({ artist }: { artist: Artist }) {
  const fetcher = useRowAction();
  const busy = fetcher.state !== "idle";

  // Manual statuses are only valid once an invoice exists.
  if (artist.paymentStatus === "none" || artist.paymentStatus === "invoicing") {
    return (
      <Pill className={paymentToneClass(artist.paymentStatus)}>
        {PAYMENT_LABEL[artist.paymentStatus]}
      </Pill>
    );
  }

  const pending =
    busy && fetcher.formData?.get("intent") === "set_payment"
      ? (fetcher.formData.get("payment") as PaymentStatus)
      : null;
  const value = pending ?? artist.paymentStatus;

  return (
    <Select
      value={value}
      disabled={busy}
      onValueChange={(v) =>
        fetcher.submit(
          { intent: "set_payment", id: artist.id, payment: v },
          { method: "post" },
        )
      }
    >
      <SelectTrigger
        size="sm"
        className={cn("w-[168px] border-0", paymentToneClass(value))}
      >
        {busy ? (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            {PAYMENT_LABEL[value]}
          </span>
        ) : (
          <SelectValue />
        )}
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
  const fetcher = useRowAction();
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
      accessorKey: "primaryMedium",
      header: "Medium",
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.primaryMedium}</span>
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

  const filters: FilterDef[] = useMemo(
    () => [
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
    ],
    [events],
  );

  // Track the live table query so Copy emails can reproduce the filtered set.
  const queryRef = useRef<ListQuery>({ page: 1, pageSize: 10 });
  const onQueryChange = useCallback((q: ListQuery) => {
    queryRef.current = q;
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
        searchPlaceholder="Search name or email…"
        filters={filters}
        defaultMode="table"
        initialFilters={eventParam ? { event_id: eventParam } : undefined}
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
          <p>{artist.primaryMedium}</p>
          <p>{artist.location}</p>
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
          {artist.primaryMedium} · {artist.email}
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

  const profile = data?.images.find((i) => i.kind === "profile");
  const portfolio = data?.images.filter((i) => i.kind === "portfolio") ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
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
            <div className="flex items-center gap-4">
              {profile ? (
                <img
                  src={`/api/files/${profile.key}`}
                  alt={`${artist.name} profile`}
                  className="size-20 rounded-lg object-cover"
                />
              ) : (
                <div className="size-20 rounded-lg bg-muted" />
              )}
              <StatusPills artist={data} />
            </div>

            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <Detail label="Email" value={data.email} />
              <Detail label="Phone" value={data.phone} />
              <Detail label="Event" value={data.eventName ?? "—"} />
              <Detail label="Stall" value={data.stallTier ?? "—"} />
              <Detail label="Primary medium" value={data.primaryMedium} />
              <Detail label="Style / category" value={data.styleCategory} />
              <Detail label="Location" value={data.location} />
              <Detail label="Custom orders" value={data.customOrders ?? "—"} />
              <Detail label="Social" value={data.socialLink ?? "—"} />
              <Detail label="Payment" value={PAYMENT_LABEL[data.paymentStatus]} />
            </dl>

            <Field label="Artist statement">
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {data.bio}
              </p>
            </Field>

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

            <Field label={`Portfolio (${portfolio.length})`}>
              <div className="grid grid-cols-3 gap-2">
                {portfolio.map((img) => (
                  <img
                    key={img.id}
                    src={`/api/files/${img.key}`}
                    alt="Portfolio"
                    className="aspect-square w-full rounded-md object-cover"
                  />
                ))}
              </div>
            </Field>
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <p className="text-sm font-medium">{label}</p>
      {children}
    </div>
  );
}
