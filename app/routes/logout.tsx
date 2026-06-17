import { redirect } from "react-router";

import { destroySession } from "~/lib/auth.server";

export async function action() {
  return redirect("/login", {
    headers: { "Set-Cookie": await destroySession() },
  });
}

export async function loader() {
  return redirect("/login");
}
