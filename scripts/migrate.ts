import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const databaseUrl =
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL is required to run migrations");
}

const client = postgres(databaseUrl, { max: 1, prepare: false });

try {
  await migrate(drizzle(client), { migrationsFolder: "drizzle" });
  console.info("Nexus database migrations applied");
} finally {
  await client.end();
}
