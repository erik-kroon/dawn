import { Button } from "@dawn/ui/components/button";
import { Search, SlidersHorizontal } from "lucide-react";

import { ModeToggle } from "./mode-toggle";
import UserMenu from "./user-menu";

export default function Header() {
  return (
    <header className="sticky top-0 z-30 flex h-[70px] items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur md:px-8 md:backdrop-blur-none">
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
    </header>
  );
}
