import { Outlet, useLocation } from "react-router";

import type { Route } from "./+types/dashboard-layout";
import { requireAdmin } from "~/lib/auth.server";
import { AppSidebar } from "~/components/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "~/components/ui/breadcrumb";
import { Separator } from "~/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "~/components/ui/sidebar";

const titles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/inquiry": "Inquiries",
};

export async function loader({ request }: Route.LoaderArgs) {
  const session = await requireAdmin(request);
  return { email: session.email };
}

export default function DashboardLayout({ loaderData }: Route.ComponentProps) {
  const { pathname } = useLocation();
  const current = titles[pathname] ?? "Admin";

  return (
    <SidebarProvider>
      <AppSidebar email={loaderData.email} />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mr-2 data-[orientation=vertical]:h-4"
          />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>{current}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
