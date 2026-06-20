import { createFileRoute } from "@tanstack/react-router";
import { UsersIcon } from "lucide-react";

import { ensureCurrentTeam } from "../-team-routing";
import { PlannedSurface } from "./-planned-surface";

export const Route = createFileRoute("/_auth/customers")({
  component: CustomersRoute,
  loaderDeps: ({ search }) => ({ teamId: search.teamId }),
  loader: async ({ context, deps }) => {
    await ensureCurrentTeam(context, deps.teamId);
  },
  head: () => ({
    meta: [{ title: "Customers | Dawn" }],
  }),
});

function CustomersRoute() {
  return (
    <PlannedSurface
      description="Customers will hold account records, contacts, Fortnox customer mappings, open deals, signed documents, invoice state, trust context, and timeline history."
      icon={UsersIcon}
      title="Customers"
    />
  );
}
