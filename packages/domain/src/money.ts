export type Money = {
  amountMinor: number;
  currency: string;
};

export function assertValidMoney(money: Money) {
  if (!Number.isSafeInteger(money.amountMinor)) {
    throw new Error("Money amount must use safe integer minor units");
  }

  if (!/^[A-Z]{3}$/.test(money.currency)) {
    throw new Error("Money currency must be an ISO 4217 code");
  }
}

export function parseMoneyAmountMinor(amount: string, currency: string) {
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error("Money currency must be an ISO 4217 code");
  }

  const trimmedAmount = amount.trim();

  if (!trimmedAmount) {
    throw new Error("Money amount is required");
  }

  const isParenthesizedNegative = /^\(.*\)$/.test(trimmedAmount);
  const normalizedAmount = trimmedAmount
    .replace(/^\((.*)\)$/, "-$1")
    .replace(/[$€£¥\s_]/g, "")
    .replace(/[’']/g, "");
  const sign = normalizedAmount.startsWith("-") ? -1 : 1;
  const unsignedAmount = normalizedAmount.replace(/^[+-]/, "");

  const minorUnitDigits = currencyMinorUnitDigits(currency);
  const { majorUnits, minorUnits } = parseMoneyMajorAndMinorUnits(unsignedAmount, minorUnitDigits);

  if (minorUnits.length > minorUnitDigits) {
    throw new Error("Money amount has too many decimal places for currency");
  }

  const amountMinor =
    sign *
    Number(
      `${majorUnits}${minorUnits.padEnd(minorUnitDigits, "0")}`.replace(/^0+(?=\d)/, "") || "0",
    );
  const money = {
    amountMinor: isParenthesizedNegative ? -Math.abs(amountMinor) : amountMinor,
    currency,
  };

  assertValidMoney(money);

  return money.amountMinor;
}

function parseMoneyMajorAndMinorUnits(unsignedAmount: string, minorUnitDigits: number) {
  const lastDot = unsignedAmount.lastIndexOf(".");
  const lastComma = unsignedAmount.lastIndexOf(",");
  const decimalSeparator =
    lastDot >= 0 && lastComma >= 0
      ? lastDot > lastComma
        ? "."
        : ","
      : lastComma >= 0
        ? decimalCommaSeparator(unsignedAmount, minorUnitDigits)
        : lastDot >= 0
          ? "."
          : null;

  if (!decimalSeparator) {
    const majorUnits = unsignedAmount.replace(/,/g, "");

    if (!/^\d+$/.test(majorUnits)) {
      throw new Error("Money amount must be a decimal number");
    }

    return { majorUnits, minorUnits: "" };
  }

  const decimalIndex = unsignedAmount.lastIndexOf(decimalSeparator);
  const groupingSeparator = decimalSeparator === "." ? "," : ".";
  const majorUnits = unsignedAmount
    .slice(0, decimalIndex)
    .replaceAll(groupingSeparator, "")
    .replace(/,/g, "");
  const minorUnits = unsignedAmount.slice(decimalIndex + 1);

  if (!/^\d+$/.test(majorUnits || "0") || !/^\d*$/.test(minorUnits)) {
    throw new Error("Money amount must be a decimal number");
  }

  return { majorUnits: majorUnits || "0", minorUnits };
}

function decimalCommaSeparator(unsignedAmount: string, minorUnitDigits: number) {
  if (minorUnitDigits === 0) {
    return null;
  }

  const commaParts = unsignedAmount.split(",");
  const decimalDigits = commaParts.at(-1) ?? "";

  if (
    commaParts.length === 2 &&
    decimalDigits.length > 0 &&
    decimalDigits.length <= minorUnitDigits
  ) {
    return ",";
  }

  return null;
}

export function assertSameCurrency(left: Money, right: Money) {
  assertValidMoney(left);
  assertValidMoney(right);

  if (left.currency !== right.currency) {
    throw new Error("Money currency mismatch");
  }
}

export function addMoney(left: Money, right: Money): Money {
  assertSameCurrency(left, right);

  const result = {
    amountMinor: left.amountMinor + right.amountMinor,
    currency: left.currency,
  };

  assertValidMoney(result);

  return result;
}

export function subtractMoney(left: Money, right: Money): Money {
  return addMoney(left, negateMoney(right));
}

export function negateMoney(money: Money): Money {
  assertValidMoney(money);

  const result = {
    amountMinor: -money.amountMinor,
    currency: money.currency,
  };

  assertValidMoney(result);

  return result;
}

export function zeroMoney(currency: string): Money {
  const money = { amountMinor: 0, currency };
  assertValidMoney(money);
  return money;
}

export function sumMoney(values: readonly Money[], currency: string): Money {
  return values.reduce((total, money) => addMoney(total, money), zeroMoney(currency));
}

export function assertBalancedSplits(transactionMoney: Money, splits: readonly { money: Money }[]) {
  if (splits.length === 0) {
    return;
  }

  const splitTotal = sumMoney(
    splits.map((split) => split.money),
    transactionMoney.currency,
  );

  if (splitTotal.amountMinor !== transactionMoney.amountMinor) {
    throw new Error("Transaction splits must equal the transaction amount");
  }
}

export function currencyMinorUnitDigits(currency: string, locale = "en-US") {
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error("Money currency must be an ISO 4217 code");
  }

  const minorUnitDigits = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).resolvedOptions().maximumFractionDigits;

  return minorUnitDigits ?? 2;
}

export function formatMoney(money: Money, options: { locale?: string } = {}) {
  assertValidMoney(money);

  const locale = options.locale ?? "en-US";
  const minorUnitDigits = currencyMinorUnitDigits(money.currency, locale);
  const amountMinor = BigInt(money.amountMinor);
  const isNegative = amountMinor < 0n;
  const absoluteMinor = isNegative ? -amountMinor : amountMinor;
  const minorUnitDivisor = 10n ** BigInt(minorUnitDigits);
  const majorUnits = absoluteMinor / minorUnitDivisor;
  const minorUnits = absoluteMinor % minorUnitDivisor;
  const formattedMajorUnits = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
    useGrouping: true,
  }).format(majorUnits);
  const formattedMinorUnits =
    minorUnitDigits === 0 ? "" : `.${minorUnits.toString().padStart(minorUnitDigits, "0")}`;

  return `${isNegative ? "-" : ""}${money.currency} ${formattedMajorUnits}${formattedMinorUnits}`;
}
