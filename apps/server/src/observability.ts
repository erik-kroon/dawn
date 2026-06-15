const sensitiveKeyPattern =
  /(authorization|cookie|password|secret|token|email|ssn|card|iban|routing|accountNumber)/i;
const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const bearerPattern = /Bearer\s+[A-Za-z0-9._~+/-]+=*/g;
const apiTokenPattern = /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9_-]{8,}\b/g;

export type ServerLogContext = {
  operation: string;
  requestId?: string | null;
  teamId?: string | null;
  actorType?: string | null;
};

export function requestIdFromHeaders(headers: Headers) {
  return headers.get("x-request-id") ?? crypto.randomUUID();
}

export function redactServerLogValue(value: unknown): unknown {
  if (typeof value === "string") {
    return redactText(value);
  }

  if (Array.isArray(value)) {
    return value.map(redactServerLogValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
        key,
        sensitiveKeyPattern.test(key) ? "[redacted]" : redactServerLogValue(nested),
      ]),
    );
  }

  return value;
}

export function logServerError(error: unknown, context: ServerLogContext) {
  const message = error instanceof Error ? error.message : String(error);

  console.error(
    JSON.stringify({
      level: "error",
      service: "dawn-server",
      operation: context.operation,
      requestId: context.requestId ?? null,
      teamId: context.teamId ?? null,
      actorType: context.actorType ?? null,
      error: redactText(message),
      stack: error instanceof Error ? redactText(error.stack ?? "") : null,
    }),
  );
}

function redactText(value: string) {
  return value
    .replace(emailPattern, "[redacted-email]")
    .replace(bearerPattern, "Bearer [redacted-token]")
    .replace(apiTokenPattern, "[redacted-token]");
}
