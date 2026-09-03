import { mkdirSync } from "node:fs";
import { sql } from "drizzle-orm";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import postgres from "postgres";
import { PGlite } from "@electric-sql/pglite";
import * as schema from "./schema";
import { SCHEMA_SQL } from "./bootstrap-sql";

type Db = ReturnType<typeof drizzlePg<typeof schema>> | ReturnType<typeof drizzlePglite<typeof schema>>;

const globalForDb = globalThis as unknown as {
  nexusDb?: Db;
  nexusPglite?: PGlite;
  nexusReady?: Promise<void>;
};

export function isBuildPhase() {
  return process.env.NEXT_PHASE === "phase-production-build" || process.env.NEXT_PHASE === "phase-export";
}

function createDb(): Db {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? process.env.POSTGRES_PRISMA_URL;
  if (url) {
    const client = postgres(url, { max: 5, prepare: false });
    return drizzlePg(client, { schema });
  }
  if (isBuildPhase()) {
    return new Proxy({} as Db, {
      get: () => () => Promise.resolve([]),
    });
  }
  const allowPglite =
    process.env.ENABLE_PGLITE === "true" || process.env.NODE_ENV !== "production";
  if (!allowPglite) {
    throw new Error(
      "DATABASE_URL is required in production. Set ENABLE_PGLITE=true only for ephemeral demos.",
    );
  }
  const dataDir = process.env.PGLITE_DATA_DIR ?? "./data/nexus";
  mkdirSync(dataDir, { recursive: true });
  const pglite = globalForDb.nexusPglite ?? new PGlite(dataDir);
  globalForDb.nexusPglite = pglite;
  return drizzlePglite(pglite, { schema });
}

function getDb(): Db {
  if (!globalForDb.nexusDb) {
    globalForDb.nexusDb = createDb();
  }
  return globalForDb.nexusDb;
}

export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    const real = getDb();
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export async function ensureDb() {
  if (isBuildPhase()) return;
  if (!globalForDb.nexusReady) {
    globalForDb.nexusReady = (async () => {
      for (const statement of SCHEMA_SQL) {
        await getDb().execute(sql.raw(statement));
      }
    })();
  }
  await globalForDb.nexusReady;
}

export { schema };
