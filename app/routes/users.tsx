import { env } from "cloudflare:workers";
import { useEffect, useRef } from "react";
import { Form, useNavigation } from "react-router";
import { toast } from "sonner";

import type { Route } from "./+types/users";
import { requireAdmin } from "~/lib/auth.server";
import {
  createAdmin,
  deleteAdmin,
  listAdmins,
} from "~/lib/admins.server";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Users · Mellow" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const session = await requireAdmin(request);
  const admins = await listAdmins(env.DB);
  return { admins, currentId: session.sub };
}

export async function action({ request }: Route.ActionArgs) {
  const session = await requireAdmin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "create") {
    const res = await createAdmin(env.DB, {
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    return res.ok
      ? { ok: true, message: "User added." }
      : { ok: false, message: res.error };
  }

  if (intent === "delete") {
    const id = String(form.get("id") ?? "");
    const res = await deleteAdmin(env.DB, id, session.sub);
    return res.ok
      ? { ok: true, message: "User removed." }
      : { ok: false, message: res.error };
  }

  return { ok: false, message: "Unknown action." };
}

function fmtDate(iso: string): string {
  const ms = Date.parse(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  return Number.isNaN(ms)
    ? iso
    : new Date(ms).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

export default function Users({ loaderData, actionData }: Route.ComponentProps) {
  const { admins, currentId } = loaderData;
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!actionData) return;
    if (actionData.ok) {
      toast.success(actionData.message);
      formRef.current?.reset();
    } else {
      toast.error(actionData.message);
    }
  }, [actionData]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground">
          Everyone here has full access to the dashboard. There are no roles.
        </p>
      </div>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Add a user</CardTitle>
          <CardDescription>
            They sign in with this email and password. They can change nothing
            about other accounts except via this page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form method="post" ref={formRef} className="grid gap-5">
            <input type="hidden" name="intent" value="create" />
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="name">Name (optional)</Label>
                <Input id="name" name="name" placeholder="Jane Doe" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  placeholder="jane@example.com"
                />
              </div>
            </div>
            <div className="grid gap-2 sm:max-w-xs">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                placeholder="At least 8 characters"
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : "Add user"}
              </Button>
            </div>
          </Form>
        </CardContent>
      </Card>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Members ({admins.length})</CardTitle>
          <CardDescription>
            The primary (seeded) admin and your own account can't be removed.
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          {admins.map((a) => {
            const isSelf = a.id === currentId;
            const removable = !a.protected && !isSelf;
            return (
              <div
                key={a.id}
                className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {a.name || a.email}
                    {a.protected && (
                      <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                        Primary
                      </span>
                    )}
                    {isSelf && (
                      <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                        You
                      </span>
                    )}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {a.email} · added {fmtDate(a.createdAt)}
                  </p>
                </div>
                {removable ? (
                  <Form method="post">
                    <input type="hidden" name="intent" value="delete" />
                    <input type="hidden" name="id" value={a.id} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      disabled={busy}
                    >
                      Remove
                    </Button>
                  </Form>
                ) : (
                  <span className="text-xs text-muted-foreground">Protected</span>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
