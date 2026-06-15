import Electrobun, { BrowserWindow, Tray, Updater, Utils } from "electrobun/bun";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  capturePayloadFromFile,
  dashboardUrlForContext,
  notificationForContext,
  parseDesktopUrl,
  type DesktopCapturePayload,
  type DesktopContext,
} from "./shell";

const DEV_SERVER_PORT = 3001;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

// Check if the web dev server is running for HMR
async function getMainViewUrl(): Promise<string> {
  const channel = await Updater.localInfo.channel();
  if (channel === "dev") {
    try {
      await fetch(DEV_SERVER_URL, { method: "HEAD" });
      console.log(`HMR enabled: Using web dev server at ${DEV_SERVER_URL}`);
      return DEV_SERVER_URL;
    } catch {
      console.log('Web dev server not running. Run "bun run dev:hmr" for HMR support.');
    }
  }

  return "views://mainview/index.html";
}

const url = await getMainViewUrl();
let mainWindow: BrowserWindow;

mainWindow = new BrowserWindow({
  title: "dawn",
  url,
  frame: {
    width: 1280,
    height: 820,
    x: 120,
    y: 120,
  },
});

const tray = new Tray({ title: "Dawn" });
tray.setMenu([
  { type: "normal", label: "Open Dawn", action: "open-dashboard" },
  { type: "normal", label: "Quick capture...", action: "quick-capture" },
  { type: "divider" },
  { type: "normal", label: "Quit", action: "quit" },
]);
tray.on("tray-clicked", (event) => {
  const action = trayAction(event);

  if (action === "open-dashboard") {
    openDesktopContext({ kind: "dashboard", section: null, teamId: null });
  }

  if (action === "quick-capture") {
    void chooseFilesForCapture();
  }

  if (action === "quit") {
    Utils.quit();
  }
});

Electrobun.events.on("open-url", (event) => {
  const rawUrl = openUrlFromEvent(event);
  const context = rawUrl ? parseDesktopUrl(rawUrl) : null;

  if (context) {
    void openDesktopContext(context);
  }
});

for (const arg of process.argv.slice(2)) {
  const context = initialContextFromArg(arg);

  if (context) {
    void openDesktopContext(context);
  }
}

console.log("Electrobun desktop shell started.");

async function chooseFilesForCapture() {
  const paths = (
    await Utils.openFileDialog({
      allowedFileTypes: "pdf,png,jpg,jpeg,txt,csv",
      canChooseFiles: true,
      canChooseDirectory: false,
      allowsMultipleSelection: true,
    })
  ).filter(Boolean);

  for (const filePath of paths) {
    await openDesktopContext({ kind: "capture", filePath, teamId: null });
  }
}

async function openDesktopContext(context: DesktopContext) {
  mainWindow.show();
  mainWindow.activate();
  mainWindow.webview.loadURL(dashboardUrlForContext(url, context));

  if (context.kind === "capture") {
    try {
      const payload = await capturePayloadFromFile(context.filePath, context.teamId);
      dispatchCapturePayload(payload);
    } catch (error) {
      Utils.showNotification({
        title: "Dawn capture failed",
        body: error instanceof Error ? error.message : "The selected file could not be captured.",
      });
      return;
    }
  }

  Utils.showNotification(notificationForContext(context));
}

function dispatchCapturePayload(payload: DesktopCapturePayload) {
  const detail = JSON.stringify(payload).replaceAll("</script", "<\\/script");
  const js = `
    window.dispatchEvent(new CustomEvent("dawn:desktop-capture", {
      detail: ${detail}
    }));
  `;

  setTimeout(() => mainWindow.webview.executeJavascript(js), 600);
}

function openUrlFromEvent(event: unknown) {
  return typeof (event as { data?: { url?: unknown } })?.data?.url === "string"
    ? (event as { data: { url: string } }).data.url
    : null;
}

function trayAction(event: unknown) {
  return typeof (event as { data?: { action?: unknown } })?.data?.action === "string"
    ? (event as { data: { action: string } }).data.action
    : null;
}

function initialContextFromArg(arg: string): DesktopContext | null {
  const parsed = parseDesktopUrl(arg);

  if (parsed) {
    return parsed;
  }

  const filePath = resolve(arg);

  if (existsSync(filePath)) {
    return parseDesktopUrl(pathToFileURL(filePath).toString());
  }

  return null;
}
