export function resolveMigrationDatabaseUrl(env: Partial<Record<string, string | undefined>>) {
  const direct = env.DATABASE_URL_UNPOOLED ?? env.POSTGRES_URL_NON_POOLING;
  if (env.NODE_ENV === "production" && !direct) {
    throw new Error("DATABASE_URL_UNPOOLED is required for production migrations");
  }
  const value = direct ?? env.DATABASE_URL;
  if (!value) {
    throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL is required to run migrations");
  }
  let host = "";
  try {
    host = new URL(value).hostname;
  } catch {
    throw new Error("Migration database URL is invalid");
  }
  if (host.includes("-pooler")) {
    throw new Error("Migrations require a direct database URL, not a pooled Neon endpoint");
  }
  return value;
}
