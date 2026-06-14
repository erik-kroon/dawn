import { polarClient } from "@polar-sh/better-auth/client";
import { env } from "@dawn/env/web";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: env.VITE_SERVER_URL,
  plugins: [polarClient()],
});
