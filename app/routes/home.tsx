import { redirect } from "react-router";

// Landing → send straight to the admin dashboard for now.
// Later: redirect to /login when there's no valid session.
export function loader() {
  return redirect("/dashboard");
}

export default function Home() {
  return null;
}
