export function resolveCorsOrigin(input: { origin: string; configuredOrigin: string }) {
  if (input.origin === input.configuredOrigin) {
    return input.origin;
  }

  if (isLocalOrigin(input.origin) && isLocalOrigin(input.configuredOrigin)) {
    return input.origin;
  }

  return null;
}

function isLocalOrigin(origin: string) {
  try {
    const url = new URL(origin);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1")
    );
  } catch {
    return false;
  }
}
