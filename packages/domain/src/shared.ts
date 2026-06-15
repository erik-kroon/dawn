export function assertIsoDate(value: string, label: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} is invalid`);
  }
}

export function multiplyMinorByQuantity(amountMinor: number, quantityMilli: number) {
  const product = BigInt(amountMinor) * BigInt(quantityMilli);
  const quotient = product / 1_000n;
  const remainder = product % 1_000n;
  const rounded = quotient + (remainder >= 500n ? 1n : 0n);

  return Number(rounded);
}

export function roundBasisPoints(amountMinor: number, basisPoints: number) {
  return roundRatio(amountMinor, basisPoints, 10_000);
}

export function roundRatio(amountMinor: number, numerator: number, denominator: number) {
  const product = BigInt(amountMinor) * BigInt(numerator);
  const divisor = BigInt(denominator);
  const quotient = product / divisor;
  const remainder = product % divisor;
  const rounded = quotient + (remainder * 2n >= divisor ? 1n : 0n);

  return Number(rounded);
}

export function assertBasisPoints(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0 || value > 10_000) {
    throw new Error(`${label} basis points must be between 0 and 10000`);
  }
}

export function assertCurrencyCode(currency: string) {
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error("Invoice currency must be an ISO 4217 code");
  }
}
