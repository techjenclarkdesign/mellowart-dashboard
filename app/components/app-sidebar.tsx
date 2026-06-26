import {
  CalendarDays,
  Inbox,
  LayoutDashboard,
  LogOut,
  Receipt,
  ShieldCheck,
  Store,
} from "lucide-react";
import { Form, Link, useLocation } from "react-router";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "~/components/ui/sidebar";

const nav = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Inquiries", url: "/inquiry", icon: Inbox },
  { title: "Events", url: "/events", icon: CalendarDays },
  { title: "Stalls", url: "/stalls", icon: Store },
  { title: "Invoice settings", url: "/invoice-settings", icon: Receipt },
];

export function AppSidebar({ email }: { email?: string }) {
  const { pathname } = useLocation();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/dashboard">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <ShieldCheck className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Mellow Admin</span>
                  <span className="truncate text-xs text-muted-foreground">
                    Applications
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {nav.map((item) => {
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === item.url}
                      tooltip={item.title}
                    >
                      <Link to={item.url}>
                        <Icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          {email ? (
            <SidebarMenuItem>
              <div className="truncate px-2 py-1 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                {email}
              </div>
            </SidebarMenuItem>
          ) : null}
          <SidebarMenuItem>
            <Form method="post" action="/logout" className="w-full">
              <SidebarMenuButton
                type="submit"
                tooltip="Sign out"
                className="w-full"
              >
                <LogOut />
                <span>Sign out</span>
              </SidebarMenuButton>
            </Form>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
