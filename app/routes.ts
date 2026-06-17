import {
  type RouteConfig,
  index,
  route,
  layout,
} from "@react-router/dev/routes";

export default [
  // Public
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("logout", "routes/logout.tsx"),

  // Admin area — wrapped in the sidebar shell
  layout("routes/dashboard-layout.tsx", [
    route("dashboard", "routes/dashboard.tsx"),
    route("inquiry", "routes/inquiry.tsx"),
    route("invoice-settings", "routes/invoice-settings.tsx"),
  ]),

  // JSON APIs (resource routes)
  route("api/inquiries", "routes/api.inquiries.tsx"), // admin-only list
  route("api/inquiries/:id", "routes/api.inquiry.$id.tsx"), // admin-only detail
  route("api/summary", "routes/api.summary.tsx"), // admin-only dashboard counts
  route("api/submit", "routes/api.submit.tsx"), // public, CLIENT_KEY-protected
  route("api/files/*", "routes/api.files.$.tsx"), // admin-only R2 image streamer
] satisfies RouteConfig;
