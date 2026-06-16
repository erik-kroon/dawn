import { testActor, testRequestId, testTeamId } from "@dawn/app/testkit/fixtures";
import type { TransactionImportPayloadStorage } from "@dawn/app";
import type { Context } from "../context";

export type ApiTestUser = {
  id: string;
  email: string;
  name?: string;
  emailVerified?: boolean;
  image?: string | null;
};

export const testApiUser: ApiTestUser = {
  id: testActor.id,
  email: "owner@example.com",
};

export function createApiTestContext(user?: ApiTestUser | null) {
  const session = user
    ? {
        session: {
          id: `session_${user.id}`,
          userId: user.id,
          token: `token_${user.id}`,
          createdAt: new Date("2026-06-15T10:00:00.000Z"),
          updatedAt: new Date("2026-06-15T10:00:00.000Z"),
          expiresAt: new Date("2026-06-16T10:00:00.000Z"),
        },
        user: {
          id: user.id,
          email: user.email,
          emailVerified: user.emailVerified ?? true,
          name: user.name ?? user.email,
          image: user.image ?? null,
          createdAt: new Date("2026-06-15T10:00:00.000Z"),
          updatedAt: new Date("2026-06-15T10:00:00.000Z"),
        },
      }
    : null;

  return {
    auth: null,
    requestId: testRequestId,
    session,
    transactionImportPayloadStorage: undefined as TransactionImportPayloadStorage | undefined,
  } satisfies Context;
}

export function createApiTestSessionContext(user: ApiTestUser = testApiUser) {
  const context = createApiTestContext(user);

  if (!context.session) {
    throw new Error("Expected authenticated test context");
  }

  return {
    requestId: context.requestId,
    session: context.session,
  };
}

export function createUnauthenticatedApiTestContext() {
  return createApiTestContext(null);
}

export function createAuthenticatedApiTestContext(user: ApiTestUser = testApiUser) {
  return createApiTestContext(user);
}

export function createScopedActorApiTestContext(overrides: Partial<ApiTestUser> = {}) {
  return createAuthenticatedApiTestContext({
    ...testApiUser,
    ...overrides,
  });
}

export function withSelectedTeam<TInput extends Record<string, unknown>>(
  input: TInput,
  teamId = testTeamId,
) {
  return {
    ...input,
    teamId,
  };
}
