import { useQuery } from "@tanstack/react-query";

import type { Route } from "./+types/dashboard";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Dashboard · Mellow" }];
}

type Summary = {
  total: number;
  pending: number;
  accepted: number;
  waitlisted: number;
  rejected: number;
};

const CARDS: { key: keyof Summary; label: string; hint: string }[] = [
  { key: "total", label: "Total inquiries", hint: "All time" },
  { key: "pending", label: "Pending review", hint: "Awaiting decision" },
  { key: "accepted", label: "Accepted", hint: "Accepted applicants" },
  { key: "waitlisted", label: "Waitlisted", hint: "On the waitlist" },
  { key: "rejected", label: "Rejected", hint: "Declined applicants" },
];

async function fetchSummary(): Promise<Summary> {
  const res = await fetch("/api/summary");
  if (!res.ok) throw new Error("Failed to load summary");
  return res.json();
}

export default function Dashboard() {
  const { data, isPending, isError } = useQuery({
    queryKey: ["summary"],
    queryFn: fetchSummary,
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Overview of incoming applications and their status.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {CARDS.map((c) => (
          <Card key={c.key}>
            <CardHeader>
              <CardDescription>{c.label}</CardDescription>
              {isPending ? (
                <Skeleton className="h-9 w-16" />
              ) : (
                <CardTitle className="text-3xl tabular-nums">
                  {isError ? "—" : (data?.[c.key] ?? 0)}
                </CardTitle>
              )}
              <p className="text-xs text-muted-foreground">{c.hint}</p>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
