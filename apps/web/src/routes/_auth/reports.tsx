import { createFileRoute } from "@tanstack/react-router";
import { BarChart3Icon } from "lucide-react";

import { ensureCurrentTeam } from "../-team-routing";
import { PlannedSurface } from "./-planned-surface";

export const Route = createFileRoute("/_auth/reports")({
  component: ReportsRoute,
  loaderDeps: ({ search }) => ({ teamId: search.teamId }),
  loader: async ({ context, deps }) => {
    await ensureCurrentTeam(context, deps.teamId);
  },
  head: () => ({
    meta: [{ title: "Reports | Dawn" }],
  }),
});

function ReportsRoute() {
  return (
    <PlannedSurface
      description="Reporting will collect operating metrics, finance rollups, and exportable views from the same team context used across Dawn."
      icon={BarChart3Icon}
      title="Reports"
    />
  );
}
