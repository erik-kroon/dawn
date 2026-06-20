import { createFileRoute } from "@tanstack/react-router";
import { FileTextIcon } from "lucide-react";

import { ensureCurrentTeam } from "../-team-routing";
import { PlannedSurface } from "./-planned-surface";

export const Route = createFileRoute("/_auth/documents")({
  component: DocumentsRoute,
  loaderDeps: ({ search }) => ({ teamId: search.teamId }),
  loader: async ({ context, deps }) => {
    await ensureCurrentTeam(context, deps.teamId);
  },
  head: () => ({
    meta: [{ title: "Documents | Dawn" }],
  }),
});

function DocumentsRoute() {
  return (
    <PlannedSurface
      description="Documents will collect quote and contract drafts, finalised PDF versions, recipient links, signing state, declines, evidence packages, and revision history."
      icon={FileTextIcon}
      title="Documents"
    />
  );
}
