import { ORPCError } from "@orpc/server";
import {
  acceptTeamInvite,
  AppError,
  createTeam,
  inviteTeamMember,
  listTeamDirectory,
  listTeams,
  updateTeamMemberRole,
  type DawnRepository,
} from "@dawn/app";
import { RateLimitError } from "@dawn/app/rate-limit";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { appRequestFromSession } from "../context";

const teamContextInput = z
  .object({
    teamId: z.string().min(1).optional(),
  })
  .optional();

const createTeamInput = z.object({
  name: z.string().min(1),
});

const inviteTeamRoleInput = z.enum(["admin", "member", "accountant", "viewer"]);

const inviteTeamMemberInput = z.object({
  teamId: z.string().min(1),
  email: z.email(),
  role: inviteTeamRoleInput,
  idempotencyKey: z.string().min(1),
});

const acceptTeamInviteInput = z.object({
  inviteId: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

const updateTeamMemberRoleInput = z.object({
  teamId: z.string().min(1),
  userId: z.string().min(1),
  role: inviteTeamRoleInput,
  idempotencyKey: z.string().min(1),
});

function mapAppError(error: unknown): never {
  if (error instanceof RateLimitError) {
    throw new ORPCError("TOO_MANY_REQUESTS", { message: error.message });
  }

  if (error instanceof AppError) {
    throw new ORPCError(error.code, { message: error.message });
  }

  throw error;
}

export type TeamsRouterDependencies = {
  dawnRepository: DawnRepository;
};

export function createTeamsRouter({ dawnRepository }: TeamsRouterDependencies) {
  return {
    list: protectedProcedure.input(teamContextInput).handler(async ({ context, input }) => {
      try {
        return await listTeams(
          dawnRepository,
          appRequestFromSession(context, { teamId: input?.teamId }),
        );
      } catch (error) {
        mapAppError(error);
      }
    }),
    create: protectedProcedure.input(createTeamInput).handler(async ({ context, input }) => {
      try {
        return await createTeam(dawnRepository, appRequestFromSession(context), input);
      } catch (error) {
        mapAppError(error);
      }
    }),
    directory: protectedProcedure.input(teamContextInput).handler(async ({ context, input }) => {
      try {
        return await listTeamDirectory(
          dawnRepository,
          appRequestFromSession(context, { teamId: input?.teamId }),
        );
      } catch (error) {
        mapAppError(error);
      }
    }),
    invite: protectedProcedure.input(inviteTeamMemberInput).handler(async ({ context, input }) => {
      try {
        return await inviteTeamMember(
          dawnRepository,
          appRequestFromSession(context, { teamId: input.teamId }),
          input,
        );
      } catch (error) {
        mapAppError(error);
      }
    }),
    acceptInvite: protectedProcedure.input(acceptTeamInviteInput).handler(async ({ context, input }) => {
      try {
        return await acceptTeamInvite(dawnRepository, appRequestFromSession(context), input);
      } catch (error) {
        mapAppError(error);
      }
    }),
    updateMemberRole: protectedProcedure
      .input(updateTeamMemberRoleInput)
      .handler(async ({ context, input }) => {
        try {
          return await updateTeamMemberRole(
            dawnRepository,
            appRequestFromSession(context, { teamId: input.teamId }),
            input,
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
  };
}
