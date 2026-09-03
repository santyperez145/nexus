import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { resolveMigrationDatabaseUrl } from "../src/lib/db/migration-url";

const databaseUrl = resolveMigrationDatabaseUrl(process.env);

const client = postgres(databaseUrl, { max: 1, prepare: false });

try {
  await migrate(drizzle(client), { migrationsFolder: "drizzle" });
  console.info("Nexus database migrations applied");
} finally {
  await client.end();
}
