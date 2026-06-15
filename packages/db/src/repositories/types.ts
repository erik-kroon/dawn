import type { PgliteDatabase } from "drizzle-orm/pglite";

import type { db } from "../index";
import type * as schema from "../schema";

export type PgliteDawnDatabase = PgliteDatabase<typeof schema>;
export type Database = typeof db;
export type TransactionClient = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type PgliteTransactionClient = Parameters<
  Parameters<PgliteDawnDatabase["transaction"]>[0]
>[0];
export type QueryClient =
  | Database
  | TransactionClient
  | PgliteDawnDatabase
  | PgliteTransactionClient;
