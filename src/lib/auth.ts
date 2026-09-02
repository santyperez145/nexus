import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import { SIGNUP_BONUS_MICROS, APP_URL } from "./config";
import { db, ensureDb, schema } from "./db";
import { id } from "./ids";
import { issueApiKey } from "./keys";

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET ?? "nexus-dev-auth-secret-change-me",
  baseURL: APP_URL,
  trustedOrigins: [
    APP_URL,
    ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
    ...(process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`]
      : []),
    ...(process.env.RAILWAY_PUBLIC_DOMAIN
      ? [`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`]
      : []),
    ...(process.env.FLY_APP_NAME ? [`https://${process.env.FLY_APP_NAME}.fly.dev`] : []),
  ],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),
  emailAndPassword: { enabled: true },
  plugins: [nextCookies()],
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await ensureDb();
          await db
            .update(schema.users)
            .set({ creditMicros: SIGNUP_BONUS_MICROS })
            .where(eq(schema.users.id, user.id));
          await db.insert(schema.workspaces).values({
            id: id("ws"),
            userId: user.id,
            name: "Default",
            slug: "default",
            isDefault: true,
          });
          await db.insert(schema.creditLedger).values({
            id: id("led"),
            userId: user.id,
            type: "signup_bonus",
            micros: SIGNUP_BONUS_MICROS,
            note: "Crédito de bienvenida",
          });
          await issueApiKey({ userId: user.id, name: "Default" });
        },
      },
    },
  },
});

export async function getSession() {
  await ensureDb();
  return auth.api.getSession({
    headers: await (await import("next/headers")).headers(),
  });
}
