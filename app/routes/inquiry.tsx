import { env } from "cloudflare:workers";
import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";
import { useFetcher } from "react-router";
import { toast } from "sonner";

import type { Route } from "./+types/inquiry";
import { BaseTable, type FilterDef } from "~/components/base-table";
import { Badge } from "~/components/ui/badge";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Label } from "~/components/ui/label";
import { Skeleton } from "~/components/ui/skeleton";
import { Textarea } from "~/components/ui/textarea";
import { requireAdmin } from "~/lib/auth.server";
import {
  listQueryToSearchParams,
  type ListQuery,
  type Paginated,
} from "~/lib/data-table";
import {
  approveSubmission,
  rejectSubmission,
  startInvoicing,
} from "~/lib/payments.server";
import {
  canApprove,
  canReject,
  deriveStatus,
  PAYMENT_LABEL,
  type PaymentStatus,
  type ReviewStatus,
} from "~/lib/status";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Artist submissions · Mellow" }];
}

// List row (from /api/inquiries).
type Artist = {
  id: string;
  name: string;
  email: string;
  primaryMedium: string;
  styleCategory: string;
  location: string;
  status: ReviewStatus;
  paymentStatus: PaymentStatus;
  rejectReason: string | null;
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
  socialLink: string | null;
  customOrders: string | null;
  additionalNotes: string | null;
  images: DetailImage[];
};

async function fetchArtists(query: ListQuery): Promise<Paginated<Artist>> {
  const res = await fetch(`/api/inquiries?${listQueryToSearchParams(query)}`);
  if (!res.ok) throw new Error("Failed to load submissions");
  return res.json();
}

function StatusBadge({
  status,
  paymentStatus,
}: {
  status: ReviewStatus;
  paymentStatus: PaymentStatus;
}) {
  const { label, variant } = deriveStatus(status, paymentStatus);
  return <Badge variant={variant}>{label}</Badge>;
}

const columns: ColumnDef<Artist>[] = [
  {
    accessorKey: "id",
    header: "Reference",
    enableSorting: false,
    cell: ({ row }) => <span className="font-medium">{row.original.id}</span>,
  },
  { accessorKey: "name", header: "Name" },
  {
    accessorKey: "primaryMedium",
    header: "Medium",
    enableSorting: false,
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.primaryMedium}</span>
    ),
  },
  {
    accessorKey: "location",
    header: "Location",
    enableSorting: false,
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.location}</span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <StatusBadge
        status={row.original.status}
        paymentStatus={row.original.paymentStatus}
      />
    ),
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

const filters: FilterDef[] = [
  {
    id: "status",
    label: "Status",
    options: [
      { label: "Pending", value: "pending" },
      { label: "Approved", value: "approved" },
      { label: "Rejected", value: "rejected" },
    ],
  },
];

export async function action({ request }: Route.ActionArgs) {
  const session = await requireAdmin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const id = String(form.get("id") ?? "");

  if (!id) return { ok: false, message: "Missing reference." };

  switch (intent) {
    case "approve": {
      const changed = await approveSubmission(env.DB, id, session.email);
      if (changed) {
        // Enter the payment machine and create the Xero invoice asynchronously.
        await startInvoicing(env.DB, id);
        await env.QUEUE.send({ type: "create_invoice", submissionId: id });
      }
      return changed
        ? { ok: true, message: `${id} approved — invoice queued.` }
        : { ok: false, message: `${id} is no longer pending.` };
    }

    case "reject": {
      const reason = String(form.get("reason") ?? "").trim();
      if (reason.length < 3) {
        return { ok: false, message: "A reason is required to reject." };
      }
      const changed = await rejectSubmission(env.DB, id, reason, session.email);
      return changed
        ? { ok: true, message: `${id} rejected.` }
        : { ok: false, message: `${id} is no longer pending.` };
    }

    default:
      return { ok: false, message: "Unknown action." };
  }
}

export default function Inquiry() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Artist submissions
        </h1>
        <p className="text-sm text-muted-foreground">
          Profiles submitted for the artists directory. Review and decide.
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
        renderGridItem={(a) => <ArtistCard artist={a} />}
        renderListItem={(a) => <ArtistRow artist={a} />}
        emptyMessage="No submissions match your filters."
      />
    </div>
  );
}

function ArtistCard({ artist }: { artist: Artist }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{artist.name}</CardTitle>
            <p className="text-xs text-muted-foreground">{artist.id}</p>
          </div>
          <StatusBadge
            status={artist.status}
            paymentStatus={artist.paymentStatus}
          />
        </div>
      </CardHeader>
      <CardContent className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          <p>{artist.primaryMedium}</p>
          <p>{artist.location}</p>
        </div>
        <RowActions artist={artist} />
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
          {artist.primaryMedium} · {artist.location}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <StatusBadge
          status={artist.status}
          paymentStatus={artist.paymentStatus}
        />
        <RowActions artist={artist} />
      </div>
    </div>
  );
}

type DialogKind = "view" | "approve" | "reject" | null;

function RowActions({ artist }: { artist: Artist }) {
  const [dialog, setDialog] = useState<DialogKind>(null);
  const fetcher = useFetcher<typeof action>();
  const queryClient = useQueryClient();
  const busy = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.ok) {
      toast.success(fetcher.data.message);
      setDialog(null);
      queryClient.invalidateQueries({ queryKey: ["inquiries"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
    } else {
      toast.error(fetcher.data.message);
    }
  }, [fetcher.state, fetcher.data, queryClient]);

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
          <DropdownMenuItem onSelect={() => setDialog("view")}>
            View profile
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => setDialog("approve")}
            disabled={!canApprove(artist.status)}
          >
            Approve
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setDialog("reject")}
            disabled={!canReject(artist.status)}
          >
            Reject
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ViewProfileDialog
        artist={artist}
        open={dialog === "view"}
        onOpenChange={(open) => setDialog(open ? "view" : null)}
      />

      {/* Approve confirmation */}
      <Dialog
        open={dialog === "approve"}
        onOpenChange={(open) => setDialog(open ? "approve" : null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve submission</DialogTitle>
            <DialogDescription>
              Approve{" "}
              <span className="font-medium text-foreground">{artist.name}</span>{" "}
              ({artist.id})? Their profile becomes eligible to go live in the
              directory.
            </DialogDescription>
          </DialogHeader>
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="approve" />
            <input type="hidden" name="id" value={artist.id} />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialog(null)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Approving…" : "Confirm approve"}
              </Button>
            </DialogFooter>
          </fetcher.Form>
        </DialogContent>
      </Dialog>

      {/* Reject with reason */}
      <Dialog
        open={dialog === "reject"}
        onOpenChange={(open) => setDialog(open ? "reject" : null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject submission</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting{" "}
              <span className="font-medium text-foreground">{artist.name}</span>
              . This may be included in the notification email.
            </DialogDescription>
          </DialogHeader>
          <fetcher.Form method="post" className="grid gap-4">
            <input type="hidden" name="intent" value="reject" />
            <input type="hidden" name="id" value={artist.id} />
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
                onClick={() => setDialog(null)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={busy}>
                {busy ? "Rejecting…" : "Confirm reject"}
              </Button>
            </DialogFooter>
          </fetcher.Form>
        </DialogContent>
      </Dialog>
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
              <StatusBadge
                status={data.status}
                paymentStatus={data.paymentStatus}
              />
            </div>

            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <Detail label="Email" value={data.email} />
              <Detail label="Phone" value={data.phone} />
              <Detail label="Primary medium" value={data.primaryMedium} />
              <Detail label="Style / category" value={data.styleCategory} />
              <Detail label="Location" value={data.location} />
              <Detail label="Custom orders" value={data.customOrders ?? "—"} />
              <Detail label="Social" value={data.socialLink ?? "—"} />
              {data.status === "approved" && (
                <Detail
                  label="Payment"
                  value={PAYMENT_LABEL[data.paymentStatus]}
                />
              )}
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

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <p className="text-sm font-medium">{label}</p>
      {children}
    </div>
  );
}
