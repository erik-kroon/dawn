import type { Category, Transaction } from "./transactions";

export type TransactionCategorySuggestion = {
  transactionId: string;
  categoryId: string | null;
  categoryName: string | null;
  confidence: number;
  explanation: string[];
  signals: {
    categoryName?: number;
    keyword?: number;
    moneyDirection?: number;
  };
};

type CategoryProfile = {
  names: readonly string[];
  keywords: readonly string[];
  direction?: "income" | "expense";
};

const categoryProfiles: readonly CategoryProfile[] = [
  {
    names: ["software", "subscriptions", "saas"],
    keywords: ["figma", "adobe", "github", "linear", "vercel", "software", "subscription"],
    direction: "expense",
  },
  {
    names: ["meals", "food", "restaurants"],
    keywords: ["coffee", "cafe", "restaurant", "lunch", "dinner", "meal"],
    direction: "expense",
  },
  {
    names: ["rent", "office", "workspace"],
    keywords: ["rent", "workspace", "office lease"],
    direction: "expense",
  },
  {
    names: ["revenue", "income", "sales"],
    keywords: ["invoice", "payment", "client", "stripe", "payout", "revenue"],
    direction: "income",
  },
  {
    names: ["fees", "bank fees", "finance charges"],
    keywords: ["fee", "bank fee", "service charge", "finance charge"],
    direction: "expense",
  },
  {
    names: ["travel", "transport"],
    keywords: ["flight", "hotel", "taxi", "uber", "lyft", "train"],
    direction: "expense",
  },
];

export function suggestTransactionCategory(input: {
  transaction: Transaction;
  categories: readonly Category[];
}): TransactionCategorySuggestion {
  const description = normalizeCategoryText(input.transaction.description);
  let best:
    | (TransactionCategorySuggestion & {
        score: number;
      })
    | null = null;

  for (const category of input.categories) {
    const categoryName = normalizeCategoryText(category.name);
    const profile = categoryProfiles.find((candidate) =>
      candidate.names.some((name) => categoryName === normalizeCategoryText(name)),
    );
    const signals: TransactionCategorySuggestion["signals"] = {};
    const explanation: string[] = [];

    if (categoryName && searchTextIncludesTerm(description, categoryName)) {
      signals.categoryName = 0.86;
      explanation.push("Transaction text contains the category name");
    }

    const keywordMatches = (profile?.keywords ?? []).filter((keyword) =>
      searchTextIncludesTerm(description, normalizeCategoryText(keyword)),
    );

    if (keywordMatches.length > 0) {
      signals.keyword = Math.max(
        signals.keyword ?? 0,
        profile?.direction === "income" ? 0.78 : 0.82,
      );
      explanation.push(`Matched ${keywordMatches[0]} category keyword`);
    }

    if (
      profile?.direction &&
      (signals.categoryName || signals.keyword) &&
      transactionDirection(input.transaction) === profile.direction
    ) {
      signals.moneyDirection = profile.direction === "income" ? 0.08 : 0.04;
      explanation.push(`Transaction amount has ${profile.direction} direction`);
    }

    const score = clampCategoryConfidence(
      Object.values(signals).reduce((total, value) => total + (value ?? 0), 0),
    );

    if (
      score > 0 &&
      (!best || score > best.score || category.id.localeCompare(best.categoryId ?? "") < 0)
    ) {
      best = {
        transactionId: input.transaction.id,
        categoryId: category.id,
        categoryName: category.name,
        confidence: score,
        explanation,
        signals,
        score,
      };
    }
  }

  if (!best) {
    return {
      transactionId: input.transaction.id,
      categoryId: null,
      categoryName: null,
      confidence: 0,
      explanation: ["No durable category signal matched"],
      signals: {},
    };
  }

  const { score: _score, ...suggestion } = best;

  return suggestion;
}

function transactionDirection(transaction: Transaction) {
  return transaction.money.amountMinor >= 0 ? "income" : "expense";
}

function normalizeCategoryText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function searchTextIncludesTerm(text: string, term: string) {
  const textTokens = text.split(" ").filter(Boolean);
  const termTokens = term.split(" ").filter((part) => part.length > 1);

  if (termTokens.length === 0) {
    return false;
  }

  if (termTokens.length === 1) {
    return textTokens.includes(termTokens[0]!);
  }

  return (
    textTokens.join(" ").includes(termTokens.join(" ")) ||
    termTokens.every((part) => textTokens.includes(part))
  );
}

function clampCategoryConfidence(score: number) {
  return Math.max(0, Math.min(1, Math.round(score * 100) / 100));
}
