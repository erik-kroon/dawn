export type WebhookSignatureInput = {
  secret: string;
  timestamp: string;
  body: string;
};

export async function signWebhookPayload(input: WebhookSignatureInput) {
  const value = `${input.timestamp}.${input.body}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(input.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));

  return `v1=${hex(new Uint8Array(signature))}`;
}

export async function verifyWebhookSignature(
  input: WebhookSignatureInput & {
    signature: string;
    now?: Date;
    toleranceSeconds?: number;
  },
) {
  const timestampMs = Number(input.timestamp) * 1_000;

  if (!Number.isFinite(timestampMs)) {
    return false;
  }

  const now = input.now ?? new Date();
  const toleranceMs = (input.toleranceSeconds ?? 300) * 1_000;

  if (Math.abs(now.getTime() - timestampMs) > toleranceMs) {
    return false;
  }

  const expected = await signWebhookPayload(input);

  return timingSafeEqual(expected, input.signature);
}

function timingSafeEqual(left: string, right: string) {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);

  if (leftBytes.length !== rightBytes.length) {
    return false;
  }

  let diff = 0;

  for (let index = 0; index < leftBytes.length; index += 1) {
    diff |= leftBytes[index]! ^ rightBytes[index]!;
  }

  return diff === 0;
}

function hex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
