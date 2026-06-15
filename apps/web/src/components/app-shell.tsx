import { Button } from "@dawn/ui/components/button";
import { cn } from "@dawn/ui/lib/utils";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  BriefcaseBusiness,
  FileText,
  Inbox,
  LayoutGrid,
  Settings,
  Table2,
  Timer,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";

import Header from "@/components/header";

type AppShellProps = {
  children: ReactNode;
};

const navItems = [
  { label: "Overview", to: "/dashboard", icon: LayoutGrid },
  { label: "Reports", to: "/reports", icon: BarChart3 },
  { label: "Transactions", to: "/transactions", icon: Table2 },
  { label: "Inbox", to: "/inbox", icon: Inbox },
  { label: "Invoices", to: "/invoices", icon: FileText },
  { label: "Tracker", to: "/tracker", icon: Timer },
  { label: "Customers", to: "/customers", icon: Users },
  { label: "Projects", to: "/projects", icon: BriefcaseBusiness },
  { label: "Operations", to: "/operations", icon: Settings },
] as const;

function DawnMark() {
  return (
    <div aria-hidden="true" className="relative size-7">
      {Array.from({ length: 12 }).map((_, index) => (
        <span
          className="absolute left-1/2 top-1/2 h-[11px] w-[2px] origin-[50%_13px] rounded-full bg-foreground"
          key={index}
          style={{ transform: `translate(-50%, -100%) rotate(${index * 30}deg)` }}
        />
      ))}
    </div>
  );
}

function AppSidebar() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const teamId = useRouterState({
    select: (state) =>
      typeof state.location.search.teamId === "string" ? state.location.search.teamId : undefined,
  });
  const teamSearch = teamId ? { teamId } : {};

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[70px] border-r border-border bg-background md:flex md:flex-col">
      <Link
        aria-label="Dawn overview"
        className="flex h-[70px] items-center justify-center border-b border-border"
        search={teamSearch}
        to="/dashboard"
      >
        <DawnMark />
      </Link>

      <nav aria-label="Primary" className="flex flex-1 flex-col items-center gap-2 py-7">
        {navItems.map(({ to, icon: Icon, label }) => {
          const isActive = pathname === to || (to !== "/dashboard" && pathname.startsWith(to));

          return (
            <Button
              aria-label={label}
              className={cn(
                "size-10 text-muted-foreground transition-[background-color,border-color,color,transform] duration-150 ease-out hover:border-border hover:bg-card hover:text-foreground active:scale-[0.97]",
                isActive && "border-border bg-card text-foreground",
              )}
              key={to}
              nativeButton={false}
              render={<Link search={teamSearch} title={label} to={to} />}
              size="icon"
              variant="ghost"
            >
              <Icon aria-hidden="true" className="size-4" />
            </Button>
          );
        })}
      </nav>

      <div className="flex items-center justify-center border-t border-border p-4">
        <div className="flex size-8 items-center justify-center border border-border bg-card text-[9px] font-medium text-foreground">
          Acme
        </div>
      </div>
    </aside>
  );
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <AppSidebar />
      <div className="min-h-svh md:pl-[70px]">
        <Header />
        <main className="min-h-[calc(100svh-70px)] px-4 md:px-8">{children}</main>
      </div>
    </div>
  );
}
