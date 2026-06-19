import { createRequestHandler } from "react-router";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request) {
    // Answer CORS preflight requests directly — allow all origins.
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
          "Access-Control-Allow-Headers":
            request.headers.get("Access-Control-Request-Headers") ??
            "Content-Type, X-Client-Key",
          "Access-Control-Max-Age": "86400",
        },
      });
    }
    return requestHandler(request);
  },
} satisfies ExportedHandler<Env>;
