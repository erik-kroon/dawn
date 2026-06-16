import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { AppRouterClient } from "@dawn/api/routers/index";
import { env } from "@dawn/env/web";
import { toastManager } from "@dawn/ui/components/toast";
import { QueryCache, QueryClient } from "@tanstack/react-query";

export function createQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        toastManager.add({
          actionProps: {
            children: "retry",
            onClick: () => {
              query.invalidate();
            },
          },
          description: error.message,
          title: "Error",
          type: "error",
        });
      },
    }),
  });
}

export const queryClient = createQueryClient();

export const link = new RPCLink({
  url: `${env.VITE_SERVER_URL}/rpc`,
  fetch(url, options) {
    return fetch(url, {
      ...options,
      credentials: "include",
    });
  },
});

export const client: AppRouterClient = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);
