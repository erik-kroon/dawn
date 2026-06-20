import { Button } from "@dawn/ui/components/button";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  Clock3Icon,
  FileSignatureIcon,
  FileTextIcon,
  HandshakeIcon,
  LandmarkIcon,
  RefreshCwIcon,
  SendIcon,
  SettingsIcon,
  ShieldCheckIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { ensureCurrentTeam } from "../-team-routing";

export const Route = createFileRoute("/_auth/dashboard")({
  component: RouteComponent,
  loaderDeps: ({ search }) => ({ teamId: search.teamId }),
  loader: async ({ context, deps }) => {
    const { currentTeamId } = await ensureCurrentTeam(context, deps.teamId);
    return { currentTeamId };
  },
  head: () => ({
    meta: [{ title: "Home | Dawn" }],
  }),
});

type ProductPath = "/deals" | "/customers" | "/documents" | "/invoices" | "/settings";

type ActionItem = {
  count: string;
  description: string;
  icon: LucideIcon;
  label: string;
  tone: "default" | "warning" | "muted";
  to: ProductPath;
};

type FlowStep = {
  description: string;
  icon: LucideIcon;
  label: string;
  status: string;
  to: ProductPath;
};

const actionItems = [
  {
    count: "0",
    description: "Qualified deals without a sent commercial document.",
    icon: HandshakeIcon,
    label: "Awaiting quote",
    tone: "default",
    to: "/deals",
  },
  {
    count: "0",
    description: "Sent documents waiting for external BankID signature.",
    icon: FileSignatureIcon,
    label: "Awaiting signature",
    tone: "default",
    to: "/documents",
  },
  {
    count: "0",
    description: "Signer/company checks that need a team decision.",
    icon: ShieldCheckIcon,
    label: "Needs trust review",
    tone: "warning",
    to: "/documents",
  },
  {
    count: "0",
    description: "Signed documents not yet linked to a Fortnox invoice.",
    icon: LandmarkIcon,
    label: "Pending invoice",
    tone: "warning",
    to: "/invoices",
  },
  {
    count: "0",
    description: "Provider sync or handoff failures requiring retry.",
    icon: AlertTriangleIcon,
    label: "Integration failures",
    tone: "muted",
    to: "/settings",
  },
] as const satisfies readonly ActionItem[];

const flowSteps = [
  {
    description: "Accounts, contacts, Fortnox mappings.",
    icon: UsersIcon,
    label: "Customer",
    status: "Ready for CRM slice",
    to: "/customers",
  },
  {
    description: "Opportunity, value, owner, next action.",
    icon: HandshakeIcon,
    label: "Deal",
    status: "Ready for CRM slice",
    to: "/deals",
  },
  {
    description: "Quote or contract, PDF hash, terms version.",
    icon: FileTextIcon,
    label: "Document",
    status: "Planned after CRM",
    to: "/documents",
  },
  {
    description: "TIC BankID request and evidence package.",
    icon: FileSignatureIcon,
    label: "Signature",
    status: "Planned after documents",
    to: "/documents",
  },
  {
    description: "CompanyRoles evidence and manual review.",
    icon: ShieldCheckIcon,
    label: "Trust",
    status: "Planned after signing",
    to: "/documents",
  },
  {
    description: "Fortnox invoice creation and payment projection.",
    icon: LandmarkIcon,
    label: "Invoice",
    status: "Planned after signing",
    to: "/invoices",
  },
] as const satisfies readonly FlowStep[];

const integrationStatuses = [
  {
    description: "OAuth, company info, customer sync, article sync.",
    icon: LandmarkIcon,
    label: "Fortnox",
    status: "Connection foundation next",
  },
  {
    description: "BankID signing, webhooks, CompanyRoles enrichment.",
    icon: ShieldCheckIcon,
    label: "TIC Identity",
    status: "Signing package pending",
  },
  {
    description: "Quote sent, reminders, signed, invoice failures.",
    icon: SendIcon,
    label: "Transactional email",
    status: "Pilot readiness slice",
  },
] as const;

function RouteComponent() {
  const { session } = Route.useRouteContext();
  const { currentTeamId } = Route.useLoaderData();
  const firstName = session.data?.user.name?.trim().split(/\s+/)[0] || "Dawn";
  const teamSearch = currentTeamId ? { teamId: currentTeamId } : {};

  return (
    <div className="mx-auto flex w-full max-w-[1368px] flex-col gap-8 py-8 md:py-10">
      <section className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-medium uppercase text-muted-foreground">Home</p>
          <h1 className="mt-3 font-serif text-[38px] leading-none tracking-normal md:text-[52px]">
            Quote to cash <span className="text-muted-foreground">{firstName}</span>
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
            One working lane for customer, deal, commercial document, BankID signature, Fortnox
            invoice, and payment follow-up.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button render={<Link search={teamSearch} to="/settings" />} size="sm" variant="outline">
            <SettingsIcon aria-hidden="true" className="size-3.5" />
            Settings
          </Button>
          <Button render={<Link search={teamSearch} to="/deals" />} size="sm">
            <HandshakeIcon aria-hidden="true" className="size-3.5" />
            New deal
          </Button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {actionItems.map((item) => (
          <ActionCard item={item} key={item.label} teamSearch={teamSearch} />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.45fr_0.85fr]">
        <Panel>
          <PanelHeader
            action={
              <Button
                render={<Link search={teamSearch} to="/documents" />}
                size="sm"
                variant="outline"
              >
                Documents
              </Button>
            }
            eyebrow="Workflow"
            title="Deal to Fortnox invoice"
          />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {flowSteps.map((step) => (
              <FlowCard key={step.label} step={step} teamSearch={teamSearch} />
            ))}
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            action={
              <Button
                render={<Link search={teamSearch} to="/settings" />}
                size="sm"
                variant="outline"
              >
                Configure
              </Button>
            }
            eyebrow="Connections"
            title="Provider readiness"
          />
          <div className="grid gap-3">
            {integrationStatuses.map(({ description, icon: Icon, label, status }) => (
              <div className="border border-border bg-background p-4" key={label}>
                <div className="flex items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center border border-border bg-card">
                    <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium">{label}</h3>
                      <span className="text-xs text-muted-foreground">{status}</span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </section>
    </div>
  );
}

function ActionCard({ item, teamSearch }: { item: ActionItem; teamSearch: { teamId?: string } }) {
  const Icon = item.icon;

  return (
    <Link
      className="group grid min-h-[184px] border border-border bg-card p-4 text-foreground transition-colors duration-150 ease-out hover:bg-background"
      search={teamSearch}
      to={item.to}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-9 place-items-center border border-border bg-background text-muted-foreground group-hover:text-foreground">
          <Icon aria-hidden="true" className="size-4" />
        </span>
        <StatusDot tone={item.tone} />
      </div>
      <div className="mt-auto">
        <p className="text-3xl font-medium">{item.count}</p>
        <h2 className="mt-2 text-sm font-medium">{item.label}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
      </div>
    </Link>
  );
}

function FlowCard({ step, teamSearch }: { step: FlowStep; teamSearch: { teamId?: string } }) {
  const Icon = step.icon;

  return (
    <Link
      className="border border-border bg-background p-4 text-foreground transition-colors duration-150 ease-out hover:bg-card"
      search={teamSearch}
      to={step.to}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center border border-border bg-card text-muted-foreground">
          <Icon aria-hidden="true" className="size-4" />
        </span>
        <div>
          <h3 className="text-sm font-medium">{step.label}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{step.status}</p>
        </div>
      </div>
      <p className="mt-4 text-sm leading-6 text-muted-foreground">{step.description}</p>
    </Link>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return <div className="border border-border bg-card p-4 md:p-5">{children}</div>;
}

function PanelHeader({
  action,
  eyebrow,
  title,
}: {
  action?: ReactNode;
  eyebrow: string;
  title: string;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-xs font-medium uppercase text-muted-foreground">{eyebrow}</p>
        <h2 className="mt-2 text-lg font-medium">{title}</h2>
      </div>
      {action}
    </div>
  );
}

function StatusDot({ tone }: { tone: ActionItem["tone"] }) {
  const className =
    tone === "warning"
      ? "bg-amber-400"
      : tone === "muted"
        ? "bg-muted-foreground/35"
        : "bg-emerald-400";

  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span aria-hidden="true" className={`size-2 ${className}`} />
      {tone === "warning" ? (
        <Clock3Icon aria-hidden="true" className="size-3.5" />
      ) : tone === "muted" ? (
        <RefreshCwIcon aria-hidden="true" className="size-3.5" />
      ) : (
        <CheckCircle2Icon aria-hidden="true" className="size-3.5" />
      )}
    </span>
  );
}
