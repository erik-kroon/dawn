import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import * as schema from "../schema";

export async function createPgliteDawnRepository() {
  seedServerEnvForRepositoryImport();

  const client = new PGlite();
  const db = drizzle(client, { schema });

  await migrate(db, {
    migrationsFolder: new URL("../migrations/", import.meta.url).pathname,
  });

  const { DrizzleDawnRepository } = await import("../dawn-repository");

  return {
    client,
    db,
    repository: new DrizzleDawnRepository(db),
    async dispose() {
      await client.close();
    },
  };
}

function seedServerEnvForRepositoryImport() {
  process.env.DATABASE_URL ??= "postgres://test";
  process.env.BETTER_AUTH_SECRET ??= "abcdefghijklmnopqrstuvwxyz123456";
  process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
  process.env.POLAR_ACCESS_TOKEN ??= "test";
  process.env.POLAR_SUCCESS_URL ??= "http://localhost:3000/success";
  process.env.CORS_ORIGIN ??= "http://localhost:3001";
}
