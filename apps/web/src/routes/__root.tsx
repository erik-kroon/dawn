import { Button } from "@dawn/ui/components/button";
import { AnchoredToastProvider, ToastProvider } from "@dawn/ui/components/toast";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { HeadContent, Link, Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import { ThemeProvider } from "@/components/theme-provider";
import { orpc } from "@/utils/orpc";

import "../index.css";

export interface RouterAppContext {
  orpc: typeof orpc;
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  head: () => ({
    meta: [
      {
        title: "dawn",
      },
      {
        name: "description",
        content: "dawn is a web application",
      },
    ],
    links: [
      {
        rel: "icon",
        href: "/favicon.ico",
      },
    ],
  }),
});

function NotFoundComponent() {
  return (
    <main className="grid min-h-svh place-items-center bg-background px-4 text-foreground">
      <div className="w-full max-w-md border border-border bg-card p-6">
        <p className="text-xs font-medium uppercase text-muted-foreground">404</p>
        <h1 className="mt-3 font-serif text-4xl leading-none tracking-normal">Page not found</h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          This route is not part of Dawn yet. Return to the dashboard or use the app navigation.
        </p>
        <Button className="mt-6" render={<Link to="/dashboard" />} size="sm">
          Go to dashboard
        </Button>
      </div>
    </main>
  );
}

function RootComponent() {
  return (
    <>
      <HeadContent />
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        disableTransitionOnChange
        storageKey="vite-ui-theme"
      >
        <ToastProvider>
          <AnchoredToastProvider>
            <div className="isolate min-h-svh">
              <Outlet />
            </div>
          </AnchoredToastProvider>
        </ToastProvider>
      </ThemeProvider>
      <TanStackRouterDevtools position="bottom-left" />
      <ReactQueryDevtools position="bottom" buttonPosition="bottom-right" />
    </>
  );
}
