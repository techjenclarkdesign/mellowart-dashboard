import { env } from "cloudflare:workers";

import type { Route } from "./+types/activity";
import { requireAdmin } from "~/lib/auth.server";
import { listActivity } from "~/lib/activity.server";
import { activityDot, activityLabel, formatRelative } from "~/lib/activity";
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

      <Card>
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Type</th>
                    <th className="pb-2 pr-4 font-medium">Activity</th>
                    <th className="pb-2 pr-4 font-medium">By</th>
                    <th className="pb-2 font-medium">When</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((a) => (
                    <tr key={a.id} className="border-t">
                      <td className="py-2.5 pr-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="size-2 shrink-0 rounded-full"
                            style={{ background: activityDot(a.type) }}
                          />
                          {activityLabel(a.type)}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4">
                        {a.subject && a.message.startsWith(a.subject) ? (
                          <>
                            <span className="font-medium">{a.subject}</span>
                            {a.message.slice(a.subject.length)}
                          </>
                        ) : (
                          a.message
                        )}
                      </td>
                      <td className="py-2.5 pr-4 text-muted-foreground">
                        {a.actorEmail ?? "—"}
                      </td>
                      <td className="py-2.5 whitespace-nowrap text-muted-foreground">
                        {formatRelative(a.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
