import type { DawnCloudflareBindings } from "@dawn/infra/cloudflare";
import type { DawnQueueMessage } from "@dawn/jobs";

import { createDawnWorkerRuntime, handleDawnWorkerQueueBatch } from "./worker-runtime";

export default {
  fetch(_request, env) {
    return Response.json(createDawnWorkerRuntime(env).health());
  },
  async queue(batch, env) {
    await handleDawnWorkerQueueBatch(batch, env);
  },
} satisfies ExportedHandler<DawnCloudflareBindings, DawnQueueMessage>;
