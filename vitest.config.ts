import { defineConfig } from "vitest/config";

// Standalone config (does NOT load vite.config.ts) so unit tests run in plain
// Node without the React Router / Cloudflare plugins. These suites cover pure
// logic only; binding-level tests can later use @cloudflare/vitest-pool-workers.
export default defineConfig({
  test: {
    environment: "node",
    include: ["app/**/*.test.ts"],
  },
});
