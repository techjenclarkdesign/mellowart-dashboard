import { createRequestHandler } from "react-router";

import { processJob, type Job } from "../app/lib/jobs.server";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request) {
    return requestHandler(request);
  },

  // Async job consumer (Cloudflare Queues): Xero invoice creation + payment checks.
  async queue(batch: MessageBatch<Job>, env) {
    for (const message of batch.messages) {
      try {
        await processJob(env, message.body);
        message.ack();
      } catch (err) {
        console.error("Job failed", message.body, err);
        message.retry();
      }
    }
  },
} satisfies ExportedHandler<Env, Job>;
