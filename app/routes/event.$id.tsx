import { env } from "cloudflare:workers";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";

import type { Route } from "./+types/event.$id";
import { Button } from "~/components/ui/button";
import { StallOptionsManager } from "~/components/stall-options-manager";
import { requireAdmin } from "~/lib/auth.server";
import {
  createStallOption,
  deleteStallOption,
  getEvent,
  listStallOptions,
  parseStallOptionForm,
  updateStallOption,
} from "~/lib/events.server";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `${data?.event?.name ?? "Event"} · Mellow` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAdmin(request);
  const event = await getEvent(env.DB, params.id);
  if (!event) throw new Response("Not found", { status: 404 });
  const stalls = await listStallOptions(env.DB, params.id);
  return { event, stalls };
}

export async function action({ request, params }: Route.ActionArgs) {
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

  const parsed = parseStallOptionForm(form);
  if ("error" in parsed) return { ok: false, message: parsed.error };

  try {
    if (intent === "create") {
      await createStallOption(env.DB, params.id, parsed);
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
    // UNIQUE(event_id, slug) collision lands here.
    if (String(err).includes("UNIQUE")) {
      return { ok: false, message: "That slug is already used in this event." };
    }
    return { ok: false, message: "Could not save stall option." };
  }

  return { ok: false, message: "Unknown action." };
}

export default function EventDetail({ loaderData }: Route.ComponentProps) {
  const { event, stalls } = loaderData;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
          <Link to="/events">
            <ArrowLeft className="size-4" />
            Events
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">{event.name}</h1>
        <p className="text-sm text-muted-foreground">
          Stall options for this event. Prices feed the Xero invoice when a
          stall is assigned.
        </p>
      </div>

      <StallOptionsManager eventId={event.id} stalls={stalls} />
    </div>
  );
}
