import { Polar } from "@polar-sh/sdk";
import { env } from "@dawn/env/server";

export const polarClient = env.POLAR_ACCESS_TOKEN
  ? new Polar({
      accessToken: env.POLAR_ACCESS_TOKEN,
      server: "sandbox",
    })
  : null;
