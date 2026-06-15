import type { DocumentUrlSigner } from "@dawn/app";

export type SignedDocumentUrlPayload = {
  kind: "upload" | "download";
  teamId: string;
  documentId: string;
  versionId: string;
  objectKey: string;
  fileName: string;
  contentType: string;
  byteSize?: number;
  actorId?: string;
  requestId?: string;
  expiresAt: string;
};

const maxUploadTtlSeconds = 15 * 60;
const maxDownloadTtlSeconds = 5 * 60;

export function createDocumentUrlSigner(input: {
  baseUrl: string;
  secret: string;
  uploadTtlSeconds?: number;
  downloadTtlSeconds?: number;
}): DocumentUrlSigner {
  return {
    async createUploadUrl(payload) {
      const expiresAt = expiresAtIso(Math.min(input.uploadTtlSeconds ?? 900, maxUploadTtlSeconds));
      const token = await signDocumentUrlPayload(input.secret, {
        kind: "upload",
        ...payload,
        expiresAt,
      });

      return {
        url: signedUrl(input.baseUrl, "upload", token),
        expiresAt,
      };
    },
    async createDownloadUrl(payload) {
      const expiresAt = expiresAtIso(
        Math.min(input.downloadTtlSeconds ?? 300, maxDownloadTtlSeconds),
      );
      const token = await signDocumentUrlPayload(input.secret, {
        kind: "download",
        ...payload,
        expiresAt,
      });

      return {
        url: signedUrl(input.baseUrl, "download", token),
        expiresAt,
      };
    },
  };
}

export async function verifyDocumentUrlToken(input: {
  secret: string;
  token: string;
  kind: SignedDocumentUrlPayload["kind"];
}) {
  const [encodedPayload, signature] = input.token.split(".");

  if (!encodedPayload || !signature) {
    throw new Error("Invalid document URL token");
  }

  const expectedSignature = await hmacSha256(input.secret, encodedPayload);

  if (signature !== expectedSignature) {
    throw new Error("Invalid document URL token");
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload)) as SignedDocumentUrlPayload;
  assertDocumentUrlPayloadPolicy(payload);

  if (payload.kind !== input.kind) {
    throw new Error("Invalid document URL token");
  }

  if (new Date(payload.expiresAt).getTime() <= Date.now()) {
    throw new Error("Document URL has expired");
  }

  return payload;
}

export function assertDocumentUrlPayloadPolicy(payload: SignedDocumentUrlPayload) {
  const expectedPrefix = `teams/${payload.teamId}/documents/${payload.documentId}/versions/${payload.versionId}/`;

  if (
    !payload.teamId ||
    !payload.documentId ||
    !payload.versionId ||
    !payload.objectKey.startsWith(expectedPrefix)
  ) {
    throw new Error("Document URL object key is out of scope");
  }

  const segments = payload.objectKey.split("/");

  if (
    segments.some((segment) => !segment || segment === "." || segment === "..") ||
    payload.objectKey.includes("\\")
  ) {
    throw new Error("Document URL object key is out of scope");
  }

  if (payload.kind === "upload" && (!payload.actorId || !payload.requestId || !payload.byteSize)) {
    throw new Error("Upload URL is missing required actor metadata");
  }
}

async function signDocumentUrlPayload(secret: string, payload: SignedDocumentUrlPayload) {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = await hmacSha256(secret, encodedPayload);

  return `${encodedPayload}.${signature}`;
}

async function hmacSha256(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));

  return base64UrlEncodeBytes(new Uint8Array(signature));
}

function signedUrl(baseUrl: string, kind: SignedDocumentUrlPayload["kind"], token: string) {
  const url = new URL(baseUrl);
  url.pathname = `/documents/${kind}/${token}`;
  url.search = "";

  return url.toString();
}

function expiresAtIso(ttlSeconds: number) {
  return new Date(Date.now() + ttlSeconds * 1_000).toISOString();
}

function base64UrlEncode(value: string) {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

function base64UrlEncodeBytes(bytes: Uint8Array) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new TextDecoder().decode(bytes);
}
