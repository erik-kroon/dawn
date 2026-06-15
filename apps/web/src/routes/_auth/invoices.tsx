import { createFileRoute } from "@tanstack/react-router";
import { FileTextIcon } from "lucide-react";

import { ensureCurrentTeam } from "../-team-routing";
import { PlannedSurface } from "./-planned-surface";

export const Route = createFileRoute("/_auth/invoices")({
  component: InvoicesRoute,
  loaderDeps: ({ search }) => ({ teamId: search.teamId }),
  loader: async ({ context, deps }) => {
    await ensureCurrentTeam(context, deps.teamId);
  },
  head: () => ({
    meta: [{ title: "Invoices | Dawn" }],
  }),
});

function InvoicesRoute() {
  return (
    <PlannedSurface
      description="Invoices will connect customers, line items, payments, reminders, and accounting exports inside the authenticated workspace."
      icon={FileTextIcon}
      title="Invoices"
    />
  );
}
