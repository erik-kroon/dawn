import type { QueryClient } from "@tanstack/react-query";

import type { orpc } from "@/utils/orpc";

const selectedTeamStorageKey = "dawn:selected-team-id";

type RouterDataContext = {
  orpc: typeof orpc;
  queryClient: QueryClient;
};

type TeamsWorkspace = {
  currentTeamId?: string;
  teams: Array<{ id: string }>;
};

export type TeamSearch = {
  teamId?: string;
};

export function optionalStringSearchParam(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function validateTeamSearch(search: Record<string, unknown>): TeamSearch {
  return {
    teamId: optionalStringSearchParam(search.teamId),
  };
}

export function readStoredTeamId() {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window.localStorage.getItem(selectedTeamStorageKey) ?? undefined;
}

export function rememberSelectedTeam(teamId: string | undefined) {
  if (typeof window === "undefined") {
    return;
  }

  if (teamId) {
    window.localStorage.setItem(selectedTeamStorageKey, teamId);
    return;
  }

  window.localStorage.removeItem(selectedTeamStorageKey);
}

export function currentTeamIdFromWorkspace(
  workspace: TeamsWorkspace,
  preferredTeamId: string | undefined,
) {
  if (preferredTeamId && workspace.teams.some((team) => team.id === preferredTeamId)) {
    return preferredTeamId;
  }

  return workspace.currentTeamId ?? workspace.teams[0]?.id;
}

export async function ensureCurrentTeam(
  context: RouterDataContext,
  requestedTeamId: string | undefined,
) {
  const preferredTeamId = requestedTeamId ?? readStoredTeamId();
  const teams = await context.queryClient.ensureQueryData(
    context.orpc.teams.list.queryOptions({ input: { teamId: preferredTeamId } }),
  );
  const currentTeamId = currentTeamIdFromWorkspace(teams, preferredTeamId);

  rememberSelectedTeam(currentTeamId);

  return {
    currentTeamId,
    preferredTeamId,
    teams,
  };
}
