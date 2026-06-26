import { useQuery } from "@tanstack/react-query";

import type { Route } from "./+types/dashboard";
import { Donut, Sparkline, TrendChart } from "~/components/charts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Dashboard · Mellow" }];
}

type Metric = "total" | "pending" | "accepted" | "rejected";

type DashboardData = {
  counts: Record<"total" | "pending" | "accepted" | "waitlisted" | "rejected", number>;
  deltas: Record<Metric, number | null>;
  sparks: Record<Metric, number[]>;
  trend: { date: string; count: number }[];
  breakdown: { key: string; label: string; count: number }[];
};

const CARDS: {
  key: Metric;
  label: string;
  color: string;
  /** Up is "bad" (e.g. rejections) → red instead of green. */
  invert?: boolean;
}[] = [
  { key: "total", label: "Total inquiries", color: "hsl(var(--foreground))" },
  { key: "pending", label: "Pending review", color: "hsl(var(--muted-foreground))" },
  { key: "accepted", label: "Approved", color: "#16a34a" },
  { key: "rejected", label: "Rejected", color: "#ef4444", invert: true },
];

const BREAKDOWN_COLOR: Record<string, string> = {
  paid: "#18181b",
  awaiting_payment: "#f472b6",
  invoicing: "#60a5fa",
  accepted: "#34d399",
  pending: "#fbbf24",
  waitlisted: "#c084fc",
  overdue: "#fb923c",
  voided: "#a3a3a3",
  rejected: "#ef4444",
};

async function fetchDashboard(): Promise<DashboardData> {
  const res = await fetch("/api/summary");
  if (!res.ok) throw new Error("Failed to load dashboard");
  return res.json();
}

function DeltaBadge({ delta, invert }: { delta: number | null; invert?: boolean }) {
  if (delta === null) {
    return (
      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:bg-emerald-950/40">
        New
      </span>
    );
  }
  if (delta === 0) {
    return (
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
        — Same
      </span>
    );
  }
  const up = delta > 0;
  const good = invert ? !up : up;
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium",
        good
          ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40"
          : "bg-red-50 text-red-600 dark:bg-red-950/40",
      )}
    >
      {up ? "↑" : "↓"} {Math.abs(delta)}%
    </span>
  );
}

export default function Dashboard() {
  const { data, isPending, isError } = useQuery({
    queryKey: ["summary"],
    queryFn: fetchDashboard,
    refetchInterval: 15000,
  });

  const segments =
    data?.breakdown.map((b) => ({
      label: b.label,
      value: b.count,
      color: BREAKDOWN_COLOR[b.key] ?? "#a3a3a3",
    })) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Overview of incoming applications and their status.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {CARDS.map((c) => (
          <Card key={c.key}>
            <CardHeader className="gap-1 pb-2">
              <CardDescription>{c.label}</CardDescription>
              <div className="flex items-center justify-between gap-2">
                {isPending ? (
                  <Skeleton className="h-9 w-14" />
                ) : (
                  <CardTitle className="text-3xl tabular-nums">
                    {isError ? "—" : data?.counts[c.key] ?? 0}
                  </CardTitle>
                )}
                {!isPending && !isError && data && (
                  <DeltaBadge delta={data.deltas[c.key]} invert={c.invert} />
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {isPending ? (
                <Skeleton className="h-8 w-full" />
              ) : (
                <Sparkline
                  data={data?.sparks[c.key] ?? []}
                  color={c.color}
                  className="h-8 w-full"
                />
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Trend + breakdown */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Application trend</CardTitle>
            <CardDescription>Submissions over the last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            {isPending ? (
              <Skeleton className="h-[220px] w-full" />
            ) : (
              <TrendChart data={data?.trend ?? []} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Status breakdown</CardTitle>
            <CardDescription>Current period</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-5">
            {isPending ? (
              <Skeleton className="size-40 rounded-full" />
            ) : segments.length === 0 ? (
              <p className="py-12 text-sm text-muted-foreground">No data yet.</p>
            ) : (
              <>
                <Donut segments={segments} total={data?.counts.total ?? 0} />
                <div className="flex w-full flex-col gap-2">
                  {data?.breakdown.map((b) => (
                    <div
                      key={b.key}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ background: BREAKDOWN_COLOR[b.key] }}
                        />
                        {b.label}
                      </span>
                      <span className="font-medium tabular-nums">{b.count}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
