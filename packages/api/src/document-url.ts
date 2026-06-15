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

export function createDocumentUrlSigner(input: {
  baseUrl: string;
  secret: string;
  uploadTtlSeconds?: number;
  downloadTtlSeconds?: number;
}): DocumentUrlSigner {
  return {
    async createUploadUrl(payload) {
      const expiresAt = expiresAtIso(input.uploadTtlSeconds ?? 900);
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
      const expiresAt = expiresAtIso(input.downloadTtlSeconds ?? 300);
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

  if (payload.kind !== input.kind) {
    throw new Error("Invalid document URL token");
  }

  if (new Date(payload.expiresAt).getTime() <= Date.now()) {
    throw new Error("Document URL has expired");
  }

  return payload;
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
