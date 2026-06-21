import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const webRoot = fileURLToPath(new URL("./apps/web", import.meta.url));
const webSrc = fileURLToPath(new URL("./apps/web/src", import.meta.url));
const signRoot = fileURLToPath(new URL("./apps/sign", import.meta.url));
const signSrc = fileURLToPath(new URL("./apps/sign/src", import.meta.url));
const uiRoot = fileURLToPath(new URL("./packages/ui", import.meta.url));
const uiSrc = fileURLToPath(new URL("./packages/ui/src", import.meta.url));

export default defineConfig({
  test: {
    projects: [
      {
        root: webRoot,
        resolve: {
          alias: {
            "@": webSrc,
            "@dawn/ui": uiSrc,
          },
        },
        test: {
          name: "web",
          environment: "happy-dom",
          include: ["src/**/*.vitest.test.{ts,tsx}"],
        },
      },
      {
        root: signRoot,
        resolve: {
          alias: {
            "@": signSrc,
            "@dawn/ui": uiSrc,
          },
        },
        test: {
          name: "sign",
          environment: "happy-dom",
          include: ["src/**/*.vitest.test.{ts,tsx}"],
        },
      },
      {
        root: uiRoot,
        resolve: {
          alias: {
            "@dawn/ui": uiSrc,
          },
        },
        test: {
          name: "ui",
          environment: "happy-dom",
          include: ["src/**/*.vitest.test.{ts,tsx}"],
        },
      },
    ],
  },
});
