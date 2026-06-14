import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  const healthCheck = useQuery(orpc.healthCheck.queryOptions());

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10">
      <section className="grid gap-3">
        <p className="text-sm font-medium uppercase text-muted-foreground">Dawn</p>
        <h1 className="max-w-3xl text-4xl font-semibold">
          Business operations, built Cloudflare-first.
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          Finance workflows, team context, automations, and AI-assisted work share one application
          boundary.
        </p>
      </section>

      <section className="grid gap-3 border p-4">
        <div>
          <h2 className="font-medium">Workspace status</h2>
          <p className="text-sm text-muted-foreground">
            The current build is wired through oRPC, application use cases, and Postgres-backed
            domain data.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`h-2 w-2 rounded-full ${healthCheck.data ? "bg-green-500" : "bg-red-500"}`}
          />
          <span className="text-sm text-muted-foreground">
            API {healthCheck.isLoading ? "checking" : healthCheck.data ? "connected" : "offline"}
          </span>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {[
          ["Application layer", "Business mutations enter through use cases."],
          ["Team context", "Actor roles are resolved before product workflows run."],
          ["Transaction review", "Review state persists with audit and outbox records."],
        ].map(([title, description]) => (
          <div className="border p-4" key={title}>
            <h2 className="font-medium">{title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{description}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
