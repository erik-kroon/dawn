import { Button } from "@dawn/ui/components/button";
import { cn } from "@dawn/ui/lib/utils";
import { useRouterState } from "@tanstack/react-router";
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
  { label: "Overview", href: "/dashboard", icon: LayoutGrid },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Transactions", href: "/transactions", icon: Table2 },
  { label: "Inbox", href: "/inbox", icon: Inbox },
  { label: "Invoices", href: "/invoices", icon: FileText },
  { label: "Tracker", href: "/tracker", icon: Timer },
  { label: "Customers", href: "/customers", icon: Users },
  { label: "Projects", href: "/projects", icon: BriefcaseBusiness },
  { label: "Operations", href: "/operations", icon: Settings },
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

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[70px] border-r border-border bg-background md:flex md:flex-col">
      <a
        aria-label="Dawn overview"
        className="flex h-[70px] items-center justify-center border-b border-border"
        href="/dashboard"
      >
        <DawnMark />
      </a>

      <nav aria-label="Primary" className="flex flex-1 flex-col items-center gap-2 py-7">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive =
            pathname === href || (href !== "/dashboard" && pathname.startsWith(href));

          return (
            <Button
              aria-label={label}
              className={cn(
                "size-10 text-muted-foreground transition-[background-color,border-color,color,transform] duration-150 ease-out hover:border-border hover:bg-card hover:text-foreground active:scale-[0.97]",
                isActive && "border-border bg-card text-foreground",
              )}
              key={href}
              nativeButton={false}
              render={<a href={href} title={label} />}
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
