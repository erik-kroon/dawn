import { Button } from "@dawn/ui/components/button";
import { Link, useRouterState } from "@tanstack/react-router";
import { Search, SlidersHorizontal } from "lucide-react";

import { ModeToggle } from "./mode-toggle";
import UserMenu from "./user-menu";

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

export default function Header() {
  const teamId = useRouterState({
    select: (state) =>
      typeof state.location.search.teamId === "string" ? state.location.search.teamId : undefined,
  });
  const teamSearch = teamId ? { teamId } : {};

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex h-[70px] border-b border-border bg-background text-foreground">
      <Link
        aria-label="Dawn overview"
        className="hidden w-[70px] shrink-0 items-center justify-center border-r border-border md:flex"
        search={teamSearch}
        to="/dashboard"
      >
        <DawnMark />
      </Link>

      <div className="flex min-w-0 flex-1 items-center justify-between px-4 md:px-8">
        <button
          aria-label="Find anything"
          className="group flex h-9 min-w-0 flex-1 items-center gap-3 text-left text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring/50 sm:max-w-md"
          type="button"
        >
          <Search aria-hidden="true" className="size-4 shrink-0" />
          <span className="truncate">Find anything</span>
        </button>

        <div className="ml-4 flex items-center gap-2">
          <Button
            aria-label="Filter workspace"
            className="hidden border-border text-muted-foreground hover:text-foreground sm:inline-flex"
            size="icon-sm"
            variant="ghost"
          >
            <SlidersHorizontal aria-hidden="true" className="size-4" />
          </Button>
          <ModeToggle />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
