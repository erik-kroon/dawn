import { createFileRoute } from "@tanstack/react-router";
import { HandshakeIcon } from "lucide-react";

import { ensureCurrentTeam } from "../-team-routing";
import { PlannedSurface } from "./-planned-surface";

export const Route = createFileRoute("/_auth/deals")({
  component: DealsRoute,
  loaderDeps: ({ search }) => ({ teamId: search.teamId }),
  loader: async ({ context, deps }) => {
    await ensureCurrentTeam(context, deps.teamId);
  },
  head: () => ({
    meta: [{ title: "Deals | Dawn" }],
  }),
});

function DealsRoute() {
  return (
    <PlannedSurface
      description="Deals will guide a qualified opportunity through quote preparation, signing, trust review, Fortnox invoice handoff, and payment follow-up."
      icon={HandshakeIcon}
      title="Deals"
    />
  );
}
