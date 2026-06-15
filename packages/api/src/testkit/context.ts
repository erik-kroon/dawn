import { testActor, testRequestId, testTeamId } from "@dawn/app/testkit/fixtures";

export type ApiTestUser = {
  id: string;
  email: string;
};

export const testApiUser: ApiTestUser = {
  id: testActor.id,
  email: "owner@example.com",
};

export function createApiTestContext(user?: ApiTestUser | null) {
  return {
    auth: null,
    requestId: testRequestId,
    session: user ? { user } : null,
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
