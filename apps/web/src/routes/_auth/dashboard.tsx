import { Button } from "@dawn/ui/components/button";
import { Input } from "@dawn/ui/components/input";
import { formatMoney } from "@dawn/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  BarChart3Icon,
  BotIcon,
  FileTextIcon,
  HourglassIcon,
  InboxIcon,
  ReceiptTextIcon,
  SendIcon,
  SlidersHorizontalIcon,
  TimerIcon,
  UploadIcon,
  WalletCardsIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

import { ensureCurrentTeam } from "../-team-routing";

export const Route = createFileRoute("/_auth/dashboard")({
  component: RouteComponent,
  loaderDeps: ({ search }) => ({ teamId: search.teamId }),
  loader: async ({ context, deps }) => {
    const { currentTeamId } = await ensureCurrentTeam(context, deps.teamId);

    if (!currentTeamId) {
      return { currentTeamId };
    }

    await Promise.all([
      context.queryClient.ensureQueryData(
        context.orpc.reports.overview.queryOptions({ input: { teamId: currentTeamId } }),
      ),
      context.queryClient.ensureQueryData(
        context.orpc.billing.list.queryOptions({ input: { teamId: currentTeamId } }),
      ),
      context.queryClient.ensureQueryData(
        context.orpc.documents.list.queryOptions({ input: { teamId: currentTeamId } }),
      ),
      context.queryClient.ensureQueryData(
        context.orpc.inbox.list.queryOptions({ input: { teamId: currentTeamId } }),
      ),
    ]);

    return { currentTeamId };
  },
  head: () => ({
    meta: [{ title: "Dashboard | Dawn" }],
  }),
});

function RouteComponent() {
  const { session, customerState } = Route.useRouteContext();
  const { currentTeamId } = Route.useLoaderData();
  const queryClient = useQueryClient();
  const [assistantPrompt, setAssistantPrompt] = useState("");
  const [assistantThreadId, setAssistantThreadId] = useState<string | null>(null);

  const reports = useQuery({
    ...orpc.reports.overview.queryOptions({ input: { teamId: currentTeamId } }),
    enabled: Boolean(currentTeamId),
  });
  const billing = useQuery({
    ...orpc.billing.list.queryOptions({ input: { teamId: currentTeamId } }),
    enabled: Boolean(currentTeamId),
  });
  const documents = useQuery({
    ...orpc.documents.list.queryOptions({ input: { teamId: currentTeamId } }),
    enabled: Boolean(currentTeamId),
  });
  const inbox = useQuery({
    ...orpc.inbox.list.queryOptions({ input: { teamId: currentTeamId } }),
    enabled: Boolean(currentTeamId),
  });

  const assistantAskMutation = useMutation(
    orpc.assistant.ask.mutationOptions({
      onSuccess: async (result) => {
        setAssistantPrompt("");
        setAssistantThreadId(result.thread.id);
        await queryClient.invalidateQueries({ queryKey: orpc.assistant.list.queryKey() });
      },
    }),
  );

  const report = reports.data?.report;
  const latestInsight = reports.data?.insights[0];
  const hasProSubscription = (customerState?.activeSubscriptions?.length ?? 0) > 0;
  const firstName = session.data?.user.name?.trim().split(/\s+/)[0] || "Dawn";
  const greeting = timeBasedGreeting();
  const pendingInboxCount =
    (report?.inboxBacklog.pendingExtraction ?? 0) +
    (report?.inboxBacklog.needsReview ?? 0) +
    (report?.inboxBacklog.suggestedMatches ?? 0);
  const inboxFallbackCount =
    inbox.data?.inboxItems.filter((item) => item.status !== "resolved").length ?? 0;
  const assistantSuggestionPrompts = [
    "know what changed in my cash flow this week",
    "see which invoices need attention",
    "understand where spending increased this month",
  ];
  const softwareExpense = report?.expensesByCategory.find((bucket) =>
    bucket.label.toLowerCase().includes("software"),
  );
  const draftInvoiceCount = billing.data?.draftInvoices.length ?? 0;
  const documentCount = documents.data?.documents.length ?? 0;

  const askAssistant = () => {
    if (!currentTeamId || !assistantPrompt.trim()) {
      return;
    }

    assistantAskMutation.mutate({
      teamId: currentTeamId,
      threadId: assistantThreadId,
      message: assistantPrompt,
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-[1368px] flex-col gap-8 py-8 md:py-10">
      <section className="grid min-h-[calc(100svh-110px)] content-start gap-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <h1 className="font-serif text-[38px] leading-none tracking-normal md:text-[44px]">
              {greeting} <span className="text-muted-foreground">{firstName}</span>
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">
              {latestInsight
                ? latestInsight.summary
                : "Here is a quick look at cash flow, invoices, files, time, and review work."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button aria-label="Customize dashboard" size="icon-sm" variant="outline">
              <SlidersHorizontalIcon aria-hidden="true" className="size-3.5" />
            </Button>
            <Button className="border-border text-muted-foreground" size="sm" variant="outline">
              1 year
            </Button>
            <div className="hidden border border-border sm:flex">
              <Button className="border-0" size="sm" variant="ghost">
                Overview
              </Button>
              <Button className="border-0 text-muted-foreground" size="sm" variant="ghost">
                Metrics
              </Button>
            </div>
            <Button
              className="border-border text-muted-foreground"
              onClick={async () => await authClient.customer.portal()}
              size="sm"
              variant="ghost"
            >
              Plan: {hasProSubscription ? "Pro" : "Free"}
            </Button>
            {hasProSubscription ? (
              <Button onClick={async () => await authClient.customer.portal()} size="sm">
                Manage plan
              </Button>
            ) : (
              <Button onClick={async () => await authClient.checkout({ slug: "pro" })} size="sm">
                Upgrade
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <DashboardWidget className="relative bg-card shadow-[6px_6px_0_0_hsl(var(--card))]">
            <div className="flex items-start justify-between gap-3">
              <WidgetLabel label="Weekly Summary" />
              <span className="text-[11px] text-muted-foreground">Just now</span>
            </div>
            <p className="mt-8 max-w-[260px] text-sm leading-6 text-foreground">
              Revenue {formatMoney(report?.totals.revenue ?? { amountMinor: 0, currency: "USD" })}.
              Expenses {formatMoney(report?.totals.expenses ?? { amountMinor: 0, currency: "USD" })}
              . Net {formatMoney(report?.totals.profit ?? { amountMinor: 0, currency: "USD" })}.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">A quick operating snapshot.</p>
            <div className="mt-auto flex items-center justify-between gap-3 pt-10 text-xs text-muted-foreground">
              <span>Listen to breakdown</span>
              <span>Dismiss</span>
            </div>
          </DashboardWidget>

          <DashboardWidget>
            <WidgetLabel icon={BarChart3Icon} label="Profit" />
            <p className="mt-7 text-sm leading-6 text-muted-foreground">
              Your average profit during this period is{" "}
              <span className="text-foreground">
                {formatMoney(report?.totals.profit ?? { amountMinor: 0, currency: "USD" })}
              </span>
            </p>
            <MiniBars />
            <WidgetFoot to="/transactions">See detailed graph</WidgetFoot>
          </DashboardWidget>

          <DashboardWidget>
            <WidgetLabel icon={HourglassIcon} label="Burnrate & Runway" />
            <p className="mt-7 text-sm leading-6 text-muted-foreground">
              Your current burnrate is{" "}
              <span className="text-foreground">
                {formatMoney(report?.totals.expenses ?? { amountMinor: 0, currency: "USD" })}
              </span>{" "}
              and runway is
            </p>
            <p className="mt-auto pb-5 text-2xl font-medium">n/a</p>
            <WidgetFoot to="/operations">See burnrate</WidgetFoot>
          </DashboardWidget>

          <DashboardWidget>
            <WidgetLabel icon={FileTextIcon} label="Files" />
            <p className="mt-7 text-sm leading-6 text-muted-foreground">
              <span className="text-foreground">{documentCount} uploaded files</span> available for
              review and extraction
            </p>
            <WidgetFoot to="/inbox">Show documents</WidgetFoot>
          </DashboardWidget>

          <DashboardWidget>
            <WidgetLabel icon={WalletCardsIcon} label="Expenses" />
            <p className="mt-7 text-sm text-muted-foreground">Spending this period</p>
            <p className="mt-auto pb-5 text-2xl font-medium">
              {formatMoney(report?.totals.expenses ?? { amountMinor: 0, currency: "USD" })}
            </p>
            <WidgetFoot to="/transactions">See biggest cost</WidgetFoot>
          </DashboardWidget>

          <DashboardWidget>
            <WidgetLabel icon={ReceiptTextIcon} label="Invoices" />
            <p className="mt-7 text-sm leading-6 text-muted-foreground">
              You currently have{" "}
              <span className="text-foreground">{report?.unpaidInvoices.length ?? 0} unpaid</span>{" "}
              and <span className="text-foreground">{draftInvoiceCount} draft</span> invoices
            </p>
            <WidgetFoot to="/operations">See unpaid invoices</WidgetFoot>
          </DashboardWidget>

          <DashboardWidget>
            <WidgetLabel icon={InboxIcon} label="Inbox" />
            <p className="mt-7 text-sm leading-6 text-muted-foreground">
              <span className="text-foreground">{pendingInboxCount || inboxFallbackCount}</span>{" "}
              items need document or transaction review
            </p>
            <WidgetFoot to="/inbox">Review inbox</WidgetFoot>
          </DashboardWidget>

          <DashboardWidget>
            <WidgetLabel icon={WalletCardsIcon} label="Software" />
            <p className="mt-7 text-sm leading-6 text-muted-foreground">
              Your software costs are{" "}
              <span className="text-foreground">
                {formatMoney(softwareExpense?.amount ?? { amountMinor: 0, currency: "USD" })}
              </span>{" "}
              this period
            </p>
            <MiniLine />
            <WidgetFoot to="/transactions">See which subscriptions went up?</WidgetFoot>
          </DashboardWidget>
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          {[
            { to: "/transactions", label: "Revenue", icon: BarChart3Icon },
            { to: "/operations", label: "Duplicate invoice", icon: ReceiptTextIcon },
            { to: "/transactions", label: "Expenses", icon: WalletCardsIcon },
            { to: "/tracker", label: "Time track", icon: TimerIcon },
            { to: "/inbox", label: "Upload", icon: UploadIcon },
          ].map(({ to, icon: Icon, label }) => (
            <Button
              className="border-border"
              key={label}
              render={<Link to={to} />}
              size="sm"
              variant="outline"
            >
              <Icon aria-hidden="true" className="size-3.5" />
              {label}
            </Button>
          ))}
        </div>

        <div className="mx-auto grid w-full max-w-3xl gap-0 border border-border bg-card">
          <div className="border-b border-border">
            {assistantSuggestionPrompts.map((prompt) => (
              <button
                className="block w-full px-4 py-3 text-left text-sm text-muted-foreground transition-colors duration-150 ease-out hover:bg-background hover:text-foreground active:scale-[0.995]"
                key={prompt}
                onClick={() => setAssistantPrompt(prompt)}
                type="button"
              >
                <span className="text-foreground">I want to</span> {prompt}
              </button>
            ))}
          </div>
          <div className="grid gap-3 p-4">
            <div className="flex items-center gap-2 text-sm">
              <BotIcon aria-hidden="true" className="size-4 text-muted-foreground" />
              <span>I want to</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <Input
                aria-label="Assistant question"
                className="h-10 border-transparent bg-background px-0 text-sm focus-visible:border-transparent focus-visible:ring-0"
                onChange={(event) => setAssistantPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    askAssistant();
                  }
                }}
                placeholder="Ask about cashflow, invoices, documents, projects, or suggestions"
                value={assistantPrompt}
              />
              <Button
                aria-label="Ask assistant"
                disabled={
                  !currentTeamId || !assistantPrompt.trim() || assistantAskMutation.isPending
                }
                onClick={askAssistant}
                size="icon"
              >
                <SendIcon aria-hidden="true" className="size-4" />
              </Button>
            </div>
            {assistantAskMutation.data ? (
              <div className="border-t border-border pt-3 text-sm text-muted-foreground">
                {assistantAskMutation.data.messages.at(-1)?.content}
              </div>
            ) : null}
            {assistantAskMutation.error ? (
              <p className="text-sm text-destructive">{errorMessage(assistantAskMutation.error)}</p>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function timeBasedGreeting() {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 12) {
    return "Morning";
  }

  if (hour >= 12 && hour < 17) {
    return "Afternoon";
  }

  return "Evening";
}

function DashboardWidget({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex min-h-[210px] flex-col border border-border bg-background p-4 ${className}`}
    >
      {children}
    </div>
  );
}

function WidgetLabel({ icon: Icon, label }: { icon?: typeof BarChart3Icon; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      {Icon ? <Icon aria-hidden="true" className="size-3.5" /> : null}
      <span>{label}</span>
    </div>
  );
}

function WidgetFoot({
  children,
  to,
}: {
  children: ReactNode;
  to: "/inbox" | "/operations" | "/transactions";
}) {
  return (
    <Link
      className="mt-auto pt-6 text-xs text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground"
      to={to}
    >
      {children}
    </Link>
  );
}

function MiniBars() {
  const bars = [18, 32, 50, 38, 24, 44, 54, 16, 28, 42, 22, 15];

  return (
    <div className="mt-auto flex h-14 items-end gap-3 pb-1">
      {bars.map((height, index) => (
        <span
          className={index % 3 === 0 ? "w-2 bg-muted-foreground/25" : "w-2 bg-foreground"}
          key={`${height}:${index}`}
          style={{ height }}
        />
      ))}
    </div>
  );
}

function MiniLine() {
  return (
    <div className="mt-auto h-16 py-4">
      <div
        aria-hidden="true"
        className="h-full w-full"
        style={{
          background:
            "linear-gradient(160deg, transparent 42%, hsl(var(--foreground)) 43%, hsl(var(--foreground)) 45%, transparent 46%), linear-gradient(20deg, transparent 48%, hsl(var(--foreground)) 49%, hsl(var(--foreground)) 51%, transparent 52%)",
          backgroundSize: "54px 100%, 76px 100%",
          backgroundPosition: "0 0, 36px 0",
        }}
      />
    </div>
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Assistant request failed";
}
