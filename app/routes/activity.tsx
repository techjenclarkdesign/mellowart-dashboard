import { env } from "cloudflare:workers";

import type { Route } from "./+types/activity";
import { requireAdmin } from "~/lib/auth.server";
import { listActivity } from "~/lib/activity.server";
import { activityDot, formatRelative } from "~/lib/activity";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Activity · Mellow" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const items = await listActivity(env.DB, 200);
  return { items };
}

export default function Activity({ loaderData }: Route.ComponentProps) {
  const { items } = loaderData;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
        <p className="text-sm text-muted-foreground">
          A log of decisions, invoices, and payments across all applications.
        </p>
      </div>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle className="text-base">Activity log</CardTitle>
          <CardDescription>Most recent first</CardDescription>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No activity yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-4">
              {items.map((a) => (
                <li key={a.id} className="flex gap-3">
                  <span
                    className="mt-1.5 size-2 shrink-0 rounded-full"
                    style={{ background: activityDot(a.type) }}
                  />
                  <div className="min-w-0 flex-1">
                    {a.subject && a.message.startsWith(a.subject) ? (
                      <p className="text-sm leading-snug">
                        <span className="font-semibold">{a.subject}</span>
                        {a.message.slice(a.subject.length)}
                      </p>
                    ) : (
                      <p className="text-sm leading-snug">{a.message}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {formatRelative(a.createdAt)}
                      {a.actorEmail ? ` · by ${a.actorEmail}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
