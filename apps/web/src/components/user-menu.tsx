import { Button } from "@dawn/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@dawn/ui/components/dropdown-menu";
import { Skeleton } from "@dawn/ui/components/skeleton";
import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";

import { authClient } from "@/lib/auth-client";

export default function UserMenu() {
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return <Skeleton className="size-8 rounded-full" />;
  }

  if (!session) {
    return (
      <Link to="/login">
        <Button variant="outline">Sign In</Button>
      </Link>
    );
  }

  const initials =
    session.user.name
      ?.split(" ")
      .map((part) => part.at(0))
      .join("")
      .slice(0, 2)
      .toUpperCase() ||
    session.user.email?.at(0)?.toUpperCase() ||
    "D";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label="Open user menu"
            className="size-8 rounded-full border-border bg-card p-0 text-[11px] text-foreground hover:bg-accent active:scale-[0.97]"
            size="icon"
            variant="outline"
          />
        }
      >
        {initials}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 border border-border bg-popover">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <span className="block text-foreground">{session.user.name ?? "Dawn user"}</span>
            <span className="block truncate font-normal">{session.user.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              authClient.signOut({
                fetchOptions: {
                  onSuccess: () => {
                    navigate({
                      to: "/",
                    });
                  },
                },
              });
            }}
          >
            <LogOut aria-hidden="true" className="size-4" />
            Sign Out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
