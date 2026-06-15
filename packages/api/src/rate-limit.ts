import { InMemoryRateLimiter } from "@dawn/app/rate-limit";

export const assistantRouteRateLimiter = new InMemoryRateLimiter();

export function enforceAssistantRateLimit(input: {
  actorId: string;
  teamId?: string | null;
  now?: number;
}) {
  assistantRouteRateLimiter.check({
    key: `assistant:${input.actorId}:${input.teamId ?? "default"}`,
    limit: 30,
    windowMs: 60_000,
    now: input.now,
  });
}
