import { basename, extname } from "node:path";

export type DesktopRecordType =
  | "transaction"
  | "invoice"
  | "customer"
  | "product"
  | "document"
  | "inbox_item"
  | "project"
  | "time_entry";

export type DesktopContext =
  | {
      kind: "record";
      recordType: DesktopRecordType;
      recordId: string;
      teamId?: string | null;
    }
  | {
      kind: "capture";
      filePath: string;
      teamId?: string | null;
    }
  | {
      kind: "dashboard";
      section?: string | null;
      teamId?: string | null;
    };

export type DesktopCapturePayload = {
  fileName: string;
  contentType: string;
  bodyBase64: string;
  byteSize: number;
  teamId?: string | null;
};

const captureMimeTypes: Record<string, string> = {
  ".csv": "text/csv",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".txt": "text/plain",
};

export function parseDesktopUrl(rawUrl: string): DesktopContext | null {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (url.protocol === "file:") {
    return {
      kind: "capture",
      filePath: decodeURIComponent(url.pathname),
      teamId: null,
    };
  }

  if (url.protocol !== "dawn:") {
    return null;
  }

  const teamId = url.searchParams.get("teamId");
  const parts = [url.hostname, ...url.pathname.split("/")].filter(Boolean);
  const action = parts[0];

  if (action === "capture") {
    const filePath = url.searchParams.get("path") ?? parts.slice(1).join("/");

    return filePath
      ? {
          kind: "capture",
          filePath,
          teamId,
        }
      : null;
  }

  if (action === "open") {
    const recordType = parts[1] as DesktopRecordType | undefined;
    const recordId = parts[2];

    return recordType && recordId && isDesktopRecordType(recordType)
      ? {
          kind: "record",
          recordType,
          recordId,
          teamId,
        }
      : null;
  }

  if (action === "dashboard") {
    return {
      kind: "dashboard",
      section: url.searchParams.get("section") ?? parts[1] ?? null,
      teamId,
    };
  }

  return null;
}

export function dashboardUrlForContext(baseUrl: string, context: DesktopContext): string {
  const section =
    context.kind === "record"
      ? sectionForRecordType(context.recordType)
      : context.kind === "dashboard"
        ? context.section
        : "inbox";
  const search = new URLSearchParams();

  if (context.teamId) {
    search.set("teamId", context.teamId);
  }

  if (context.kind === "record") {
    search.set("desktopFocusType", context.recordType);
    search.set("desktopFocusId", context.recordId);
  }

  if (context.kind === "capture") {
    search.set("desktopCapture", "pending");
  }

  const suffix = `${search.size ? `?${search}` : ""}${section ? `#${section}` : ""}`;

  if (baseUrl.startsWith("http://") || baseUrl.startsWith("https://")) {
    const url = new URL("/dashboard", baseUrl);
    url.search = search.toString();
    url.hash = section ? section : "";
    return url.toString();
  }

  return `${baseUrl}${suffix}`;
}

export function notificationForContext(context: DesktopContext) {
  if (context.kind === "capture") {
    return {
      title: "Dawn capture ready",
      body: `${basename(context.filePath)} is ready to upload into the inbox.`,
    };
  }

  if (context.kind === "record") {
    return {
      title: "Dawn opened",
      body: `Opened ${context.recordType.replace("_", " ")} ${context.recordId}.`,
    };
  }

  return {
    title: "Dawn opened",
    body: "Dashboard is ready.",
  };
}

export function supportedCaptureContentType(filePath: string): string | null {
  return captureMimeTypes[extname(filePath).toLowerCase()] ?? null;
}

export async function capturePayloadFromFile(
  filePath: string,
  teamId?: string | null,
): Promise<DesktopCapturePayload> {
  const contentType = supportedCaptureContentType(filePath);

  if (!contentType) {
    throw new Error(`Unsupported capture file type: ${extname(filePath) || "unknown"}`);
  }

  const file = Bun.file(filePath);
  const bytes = await file.arrayBuffer();

  return {
    fileName: basename(filePath),
    contentType,
    bodyBase64: Buffer.from(bytes).toString("base64"),
    byteSize: bytes.byteLength,
    teamId: teamId ?? null,
  };
}

function sectionForRecordType(recordType: DesktopRecordType) {
  if (recordType === "transaction") {
    return "transactions";
  }

  if (recordType === "invoice" || recordType === "customer" || recordType === "product") {
    return "billing";
  }

  if (recordType === "document") {
    return "documents";
  }

  if (recordType === "project" || recordType === "time_entry") {
    return "projects";
  }

  return "inbox";
}

function isDesktopRecordType(value: string): value is DesktopRecordType {
  return [
    "transaction",
    "invoice",
    "customer",
    "product",
    "document",
    "inbox_item",
    "project",
    "time_entry",
  ].includes(value);
}
