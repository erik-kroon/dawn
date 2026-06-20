import { createFileRoute } from "@tanstack/react-router";
import { SettingsIcon } from "lucide-react";

import { ensureCurrentTeam } from "../-team-routing";
import { PlannedSurface } from "./-planned-surface";

export const Route = createFileRoute("/_auth/settings")({
  component: SettingsRoute,
  loaderDeps: ({ search }) => ({ teamId: search.teamId }),
  loader: async ({ context, deps }) => {
    await ensureCurrentTeam(context, deps.teamId);
  },
  head: () => ({
    meta: [{ title: "Settings | Dawn" }],
  }),
});

function SettingsRoute() {
  return (
    <PlannedSurface
      description="Settings will manage team access, Fortnox connection, TIC configuration, document defaults, invoice handoff policy, trust-check policy, notifications, retention, and audit access."
      icon={SettingsIcon}
      title="Settings"
    />
  );
}
