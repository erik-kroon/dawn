import type { ElectrobunConfig } from "electrobun";

const webBuildDir = "../web/dist";

export default {
  app: {
    name: "dawn",
    identifier: "dev.bettertstack.dawn.desktop",
    version: "0.0.1",
    urlSchemes: ["dawn"],
    fileAssociations: [
      {
        ext: ["pdf", "png", "jpg", "jpeg", "txt", "csv"],
        name: "Dawn inbox capture",
        role: "Editor",
      },
    ],
  },
  runtime: {
    exitOnLastWindowClosed: true,
  },
  build: {
    bun: {
      entrypoint: "src/bun/index.ts",
    },
    copy: {
      [webBuildDir]: "views/mainview",
    },
    watchIgnore: [`${webBuildDir}/**`],
    mac: {
      bundleCEF: true,
      defaultRenderer: "cef",
    },
    linux: {
      bundleCEF: true,
      defaultRenderer: "cef",
    },
    win: {
      bundleCEF: true,
      defaultRenderer: "cef",
    },
  },
} satisfies ElectrobunConfig;
