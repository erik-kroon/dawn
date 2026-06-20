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

function AppSidebar() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const teamId = useRouterState({
    select: (state) =>
      typeof state.location.search.teamId === "string" ? state.location.search.teamId : undefined,
  });
  const teamSearch = teamId ? { teamId } : {};

  return (
    <aside className="fixed bottom-0 left-0 top-[70px] z-40 hidden w-[70px] border-r border-border bg-background md:flex md:flex-col">
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
    <div className="h-svh overflow-hidden bg-background text-foreground">
      <AppSidebar />
      <Header />
      <div className="box-border h-full pt-[70px] md:pl-[70px]">
        <main className="h-full min-h-0 overflow-y-auto px-4 md:px-8">{children}</main>
      </div>
    </div>
  );
}
