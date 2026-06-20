import { env } from "@dawn/env/web";
import { redirect } from "@tanstack/react-router";

export function parkedSurfacesEnabled(value = env.VITE_ENABLE_PARKED_SURFACES) {
  return value === "1" || value === "true";
}

export function requireParkedSurfaceFlag(teamId?: string) {
  if (parkedSurfacesEnabled()) {
    return;
  }

  throw redirect({
    search: teamId ? { teamId } : {},
    to: "/dashboard",
  });
}
