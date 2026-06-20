import { auth } from "@dawn/auth";
import {
  type DispatchOutboxCommand,
  type DispatchOutboxResult,
  resolveSessionAppRequest,
  type ResolvedAppRequest,
  type TransactionImportPayloadStorage,
} from "@dawn/app";
import type { Context as HonoContext } from "hono";

export type CreateContextOptions = {
  context: HonoContext;
};

export type OutboxDispatcher = (command?: DispatchOutboxCommand) => Promise<DispatchOutboxResult>;

export async function createContext({ context }: CreateContextOptions) {
  const session = await auth.api.getSession({
    headers: context.req.raw.headers,
  });
  return {
    auth: null,
    requestId:
      context.req.header("x-request-id") ??
      context.res.headers.get("x-request-id") ??
      crypto.randomUUID(),
    session,
    outboxDispatcher: undefined as OutboxDispatcher | undefined,
    transactionImportPayloadStorage: undefined as TransactionImportPayloadStorage | undefined,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;

export function appRequestFromSession(
  context: {
    requestId: string;
    session: NonNullable<Context["session"]>;
  },
  input: {
    teamId?: string | null;
    idempotencyKey?: string | null;
    locale?: string | null;
    timezone?: string | null;
  } = {},
): ResolvedAppRequest {
  return resolveSessionAppRequest({
    user: {
      id: context.session.user.id,
      email: context.session.user.email,
    },
    requestId: context.requestId,
    teamId: input.teamId,
    idempotencyKey: input.idempotencyKey,
    locale: input.locale,
    timezone: input.timezone,
  });
}
