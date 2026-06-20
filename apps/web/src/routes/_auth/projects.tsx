import { createFileRoute } from "@tanstack/react-router";
import { BriefcaseBusinessIcon } from "lucide-react";

import { ensureCurrentTeam } from "../-team-routing";
import { requireParkedSurfaceFlag } from "./-parked-surface";
import { PlannedSurface } from "./-planned-surface";

export const Route = createFileRoute("/_auth/projects")({
  component: ProjectsRoute,
  loaderDeps: ({ search }) => ({ teamId: search.teamId }),
  loader: async ({ context, deps }) => {
    requireParkedSurfaceFlag(deps.teamId);
    await ensureCurrentTeam(context, deps.teamId);
  },
  head: () => ({
    meta: [{ title: "Projects | Dawn" }],
  }),
});

function ProjectsRoute() {
  return (
    <PlannedSurface
      description="Projects will organize customers, billable work, time entries, invoice creation, and project reporting in one route."
      icon={BriefcaseBusinessIcon}
      title="Projects"
    />
  );
}
