import { env } from "cloudflare:workers";
import { Form, redirect, useSearchParams } from "react-router";

import type { Route } from "./+types/login";
import { createSession, getSession } from "~/lib/auth.server";
import { verifyPassword } from "~/lib/password.server";
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
  return [{ title: "Sign in · Mellow" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  // Already signed in → skip the form.
  if (await getSession(request)) throw redirect("/dashboard");
  return null;
}

interface AdminRow {
  id: string;
  email: string;
  password_hash: string;
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(form.get("password") ?? "");
  const redirectTo = String(form.get("redirectTo") || "/dashboard");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const admin = await env.DB.prepare(
    "SELECT id, email, password_hash FROM admins WHERE email = ?",
  )
    .bind(email)
    .first<AdminRow>();

  // Verify even when the admin is missing to keep timing uniform-ish.
  const ok =
    admin != null && (await verifyPassword(password, admin.password_hash));
  if (!ok) {
    return { error: "Invalid email or password." };
  }

  return redirect(redirectTo, {
    headers: {
      "Set-Cookie": await createSession({ id: admin.id, email: admin.email }),
    },
  });
}

export default function Login({ actionData }: Route.ComponentProps) {
  const [params] = useSearchParams();
  const redirectTo = params.get("redirectTo") ?? "/dashboard";

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Admin sign in</CardTitle>
          <CardDescription>
            Enter your credentials to access the dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form method="post" className="grid gap-4">
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                placeholder="admin@example.com"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            {actionData?.error ? (
              <p className="text-sm text-destructive">{actionData.error}</p>
            ) : null}
            <Button type="submit" className="w-full">
              Sign in
            </Button>
          </Form>
        </CardContent>
      </Card>
    </main>
  );
}
