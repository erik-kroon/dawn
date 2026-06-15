import { drizzle } from "drizzle-orm/node-postgres";
import { readdirSync, readFileSync } from "node:fs";
import { Client, type Pool as PgPool, Pool } from "pg";

import * as schema from "../schema";

const createdSchemas: { connectionString: string; schemaName: string }[] = [];

export function getPostgresTestDatabaseUrl() {
  const connectionString = process.env.DAWN_DATABASE_TEST_URL;

  if (!connectionString) {
    return null;
  }

  assertPostgresTestDatabaseUrl(connectionString);

  return connectionString;
}

export async function createPostgresDawnRepository(connectionString: string) {
  assertPostgresTestDatabaseUrl(connectionString);

  const schemaName = `dawn_postgres_${crypto.randomUUID().replaceAll("-", "_")}`;
  const adminClient = new Client({ connectionString });

  assertPostgresTestSchemaName(schemaName);
  await adminClient.connect();

  try {
    await adminClient.query(`create schema "${schemaName}"`);
    createdSchemas.push({ connectionString, schemaName });
    await adminClient.query(`set search_path to "${schemaName}"`);
    await runPostgresMigrations(adminClient, schemaName);
  } finally {
    await adminClient.end();
  }

  const pool = new Pool({
    connectionString,
    options: `-c search_path=${schemaName}`,
  });
  const db = drizzle(pool, { schema });
  seedServerEnvForRepositoryImport(connectionString);
  const { DrizzleDawnRepository } = await import("../dawn-repository");
  let disposed = false;

  return {
    pool,
    repository: new DrizzleDawnRepository(db),
    schemaName,
    async dispose() {
      if (disposed) {
        return;
      }

      disposed = true;
      await pool.end();
      await dropPostgresTestSchema(connectionString, schemaName);
      removeCreatedSchema(connectionString, schemaName);
    },
  };
}

export async function seedPostgresTestUser(
  pool: PgPool,
  schemaName: string,
  input: {
    id: string;
    email: string;
    name: string;
  },
) {
  assertPostgresTestSchemaName(schemaName);

  await pool.query(
    `insert into "${schemaName}"."user" ("id", "name", "email") values ($1, $2, $3)`,
    [input.id, input.name, input.email],
  );
}

export async function cleanupPostgresTestSchemas() {
  while (createdSchemas.length > 0) {
    const created = createdSchemas.pop();

    if (created) {
      await dropPostgresTestSchema(created.connectionString, created.schemaName);
    }
  }
}

export async function dropPostgresTestSchema(connectionString: string, schemaName: string) {
  assertPostgresTestDatabaseUrl(connectionString);
  assertPostgresTestSchemaName(schemaName);

  const client = new Client({ connectionString });

  await client.connect();

  try {
    await client.query(`drop schema if exists "${schemaName}" cascade`);
  } finally {
    await client.end();
  }
}

function assertPostgresTestDatabaseUrl(connectionString: string) {
  let url: URL;

  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("DAWN_DATABASE_TEST_URL must be a valid Postgres URL");
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("DAWN_DATABASE_TEST_URL must use postgres:// or postgresql://");
  }

  const host = url.hostname.toLowerCase();
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, "")).toLowerCase();
  const target = `${host}/${databaseName}`;

  if (!databaseName) {
    throw new Error("DAWN_DATABASE_TEST_URL must include a database name");
  }

  if (/\bprod(uction)?\b/.test(target)) {
    throw new Error("DAWN_DATABASE_TEST_URL must not point at a production database");
  }

  const localHost = host === "localhost" || host === "127.0.0.1" || host === "::1";
  const testDatabaseName = /(^|[_-])(test|testing|ci|local|dev)([_-]|$)/.test(databaseName);

  if (!localHost && !testDatabaseName) {
    throw new Error(
      "DAWN_DATABASE_TEST_URL must point at localhost or a database name containing test, ci, local, or dev",
    );
  }
}

async function runPostgresMigrations(client: Client, schemaName: string) {
  const migrationsUrl = new URL("../migrations/", import.meta.url);
  const migrationFiles = readdirSync(migrationsUrl)
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort();

  for (const migrationFile of migrationFiles) {
    const sqlText = readFileSync(new URL(migrationFile, migrationsUrl), "utf8").replaceAll(
      '"public".',
      `"${schemaName}".`,
    );

    for (const statement of sqlText.split("--> statement-breakpoint")) {
      const trimmed = statement.trim();

      if (trimmed) {
        await client.query(trimmed);
      }
    }
  }
}

function removeCreatedSchema(connectionString: string, schemaName: string) {
  const schemaIndex = createdSchemas.findIndex(
    (created) => created.connectionString === connectionString && created.schemaName === schemaName,
  );

  if (schemaIndex >= 0) {
    createdSchemas.splice(schemaIndex, 1);
  }
}

function assertPostgresTestSchemaName(schemaName: string) {
  if (!/^dawn_postgres_[a-f0-9_]+$/.test(schemaName)) {
    throw new Error(`Unsafe Postgres test schema name: ${schemaName}`);
  }
}

function seedServerEnvForRepositoryImport(databaseUrlValue: string) {
  process.env.DATABASE_URL ??= databaseUrlValue;
  process.env.BETTER_AUTH_SECRET ??= "abcdefghijklmnopqrstuvwxyz123456";
  process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
  process.env.POLAR_ACCESS_TOKEN ??= "test";
  process.env.POLAR_SUCCESS_URL ??= "http://localhost:3000/success";
  process.env.CORS_ORIGIN ??= "http://localhost:3001";
}
