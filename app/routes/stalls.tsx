import { env } from "cloudflare:workers";
import { Link } from "react-router";

import type { Route } from "./+types/stalls";
import { Card, CardContent } from "~/components/ui/card";
import { StallOptionsManager } from "~/components/stall-options-manager";
import { requireAdmin } from "~/lib/auth.server";
import type { StallOption } from "~/lib/events";
import {
  createStallOption,
  deleteStallOption,
  listEventsWithCounts,
  listStallOptions,
  parseStallOptionForm,
  updateStallOption,
} from "~/lib/events.server";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Stall options · Mellow" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const events = await listEventsWithCounts(env.DB);
  const stalls: Record<string, StallOption[]> = {};
  for (const e of events) {
    stalls[e.id] = await listStallOptions(env.DB, e.id);
  }
  return { events, stalls };
}

export async function action({ request }: Route.ActionArgs) {
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

  // Stalls are event-scoped — the event comes from the form here (not a param).
  const eventId = String(form.get("eventId") ?? "");
  if (!eventId) return { ok: false, message: "Missing event." };

  const parsed = parseStallOptionForm(form);
  if ("error" in parsed) return { ok: false, message: parsed.error };

  try {
    if (intent === "create") {
      await createStallOption(env.DB, eventId, parsed);
      return { ok: true, message: "Stall option added." };
    }
    if (intent === "update") {
      const id = String(form.get("stallId") ?? "");
      const ok = await updateStallOption(env.DB, id, parsed);
      return ok
        ? { ok: true, message: "Stall option updated." }
        : { ok: false, message: "Could not update stall option." };
    }
  } catch (err) {
    if (String(err).includes("UNIQUE")) {
      return { ok: false, message: "That slug is already used in this event." };
    }
    return { ok: false, message: "Could not save stall option." };
  }

  return { ok: false, message: "Unknown action." };
}

export default function Stalls({ loaderData }: Route.ComponentProps) {
  const { events, stalls } = loaderData;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Stall options</h1>
        <p className="text-sm text-muted-foreground">
          Stall tiers and prices for every event. Prices are GST-inclusive and
          set the Xero invoice amount when a stall is assigned.
        </p>
      </div>

      {events.length === 0 ? (
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">
              No events yet.{" "}
              <Link to="/events" className="text-primary hover:underline">
                Add an event
              </Link>{" "}
              first — stall options are scoped to an event.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-8">
          {events.map((e) => (
            <section key={e.id} className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-3 border-b pb-2">
                <h2 className="text-lg font-medium">{e.name}</h2>
                <Link
                  to={`/inquiry?event=${e.id}`}
                  className="text-sm text-muted-foreground hover:text-foreground hover:underline"
                >
                  {e.applicants} applicant{e.applicants === 1 ? "" : "s"}
                </Link>
              </div>
              <StallOptionsManager eventId={e.id} stalls={stalls[e.id] ?? []} />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
