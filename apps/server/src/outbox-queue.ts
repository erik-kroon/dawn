import type { OutboxQueuePublisher } from "@dawn/app";
import type { DawnQueueMessage } from "@dawn/jobs";

export function createCloudflareOutboxQueuePublisher(
  queue: Queue<DawnQueueMessage>,
): OutboxQueuePublisher {
  return {
    async publish(message) {
      await queue.send(message);
    },
  };
}
