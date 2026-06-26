import { env } from "cloudflare:workers";
import { ArrowRight, CalendarDays, Settings2 } from "lucide-react";
import { Link } from "react-router";

import type { Route } from "./+types/events";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { requireAdmin } from "~/lib/auth.server";
import { listEventsWithCounts } from "~/lib/events.server";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Events · Mellow" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  return { events: await listEventsWithCounts(env.DB) };
}

function dateRange(startsAt: string | null, endsAt: string | null): string {
  if (!startsAt) return "Dates TBC";
  if (!endsAt || endsAt === startsAt) return startsAt;
  return `${startsAt} – ${endsAt}`;
}

export default function Events({ loaderData }: Route.ComponentProps) {
  const { events } = loaderData;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Events</h1>
        <p className="text-sm text-muted-foreground">
          Mirrored from the Webflow CMS. Open an event to review its applicants
          or configure stall options.
        </p>
      </div>

      {events.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No events yet</CardTitle>
            <CardDescription>
              Events sync from the Webflow CMS. Add an event there (or seed the
              local database) and it will appear here.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((e) => (
            <Card key={e.id} className="flex flex-col">
              <CardHeader>
                <CardTitle className="text-base">{e.name}</CardTitle>
                <CardDescription className="flex items-center gap-1.5">
                  <CalendarDays className="size-3.5" />
                  {dateRange(e.startsAt, e.endsAt)}
                  {e.location ? ` · ${e.location}` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <div className="flex items-baseline gap-4">
                  <div>
                    <p className="text-2xl font-semibold tabular-nums">
                      {e.applicants}
                    </p>
                    <p className="text-xs text-muted-foreground">applicants</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                      {e.awaitingReview}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      awaiting review
                    </p>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="gap-2">
                <Button asChild size="sm" className="flex-1">
                  <Link to={`/inquiry?event=${e.id}`}>
                    View applicants
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link to={`/events/${e.id}`} aria-label="Stall options">
                    <Settings2 className="size-4" />
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
