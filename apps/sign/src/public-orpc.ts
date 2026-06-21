import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { AppRouterClient } from "@dawn/api/routers/index";
import { env } from "@dawn/env/web";

export const link = new RPCLink({
  url: `${env.VITE_SERVER_URL}/rpc`,
  fetch(url, options) {
    return fetch(url, {
      ...options,
      credentials: "omit",
    });
  },
});

export const client: AppRouterClient = createORPCClient(link);
