import { Button } from "@dawn/ui/components/button";
import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";

type PlannedSurfaceProps = {
  description: string;
  icon: LucideIcon;
  title: string;
};

export function PlannedSurface({ description, icon: Icon, title }: PlannedSurfaceProps) {
  return (
    <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-6 py-8 md:py-10">
      <section className="grid min-h-[calc(100svh-150px)] content-center gap-6">
        <div className="flex items-center gap-3 text-xs font-medium uppercase text-muted-foreground">
          <span className="grid size-8 place-items-center border border-border bg-card text-foreground">
            <Icon aria-hidden="true" className="size-4" />
          </span>
          <span>{title}</span>
        </div>
        <div>
          <h1 className="max-w-3xl font-serif text-[42px] leading-none tracking-normal md:text-[60px]">
            {title}
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button render={<Link to="/dashboard" />} size="sm" variant="outline">
            Dashboard
          </Button>
          <Button render={<Link to="/operations" />} size="sm">
            Operations
          </Button>
        </div>
      </section>
    </div>
  );
}
