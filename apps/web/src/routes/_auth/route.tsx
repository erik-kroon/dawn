import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_auth")({
  component: AuthLayout,
  beforeLoad: async () => {
    let session: Awaited<ReturnType<typeof authClient.getSession>>;

    try {
      session = await authClient.getSession();
    } catch {
      throw redirect({
        to: "/login",
      });
    }

    if (!session.data) {
      throw redirect({
        to: "/login",
      });
    }
    const { data: customerState } = await authClient.customer.state().catch(() => ({ data: null }));
    return { session, customerState };
  },
});

function AuthLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
