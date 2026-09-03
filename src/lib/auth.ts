import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import { signupBonusMicros, APP_URL } from "./config";
import { authRateLimitStorage } from "./auth-rate-limit";
import { trustedAuthOrigins } from "./cors";
import { db, ensureDb, schema } from "./db";
import { sendEmailVerification, sendPasswordResetEmail } from "./email";
import { id } from "./ids";
import { issueApiKey } from "./keys";

const buildPhase =
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.env.NEXT_PHASE === "phase-export";
const productionRuntime = process.env.NODE_ENV === "production" && !buildPhase;

function authSecret() {
  const configured = process.env.BETTER_AUTH_SECRET;
  if (productionRuntime && (!configured || configured.length < 32)) {
    throw new Error("BETTER_AUTH_SECRET must be configured with at least 32 characters in production");
  }
  if (productionRuntime && !APP_URL.startsWith("https://")) {
    throw new Error("NEXT_PUBLIC_APP_URL must be an HTTPS URL in production");
  }
  if (productionRuntime && !process.env.RESEND_API_KEY?.trim()) {
    throw new Error("RESEND_API_KEY is required for production account verification and recovery");
  }
  if (productionRuntime && !process.env.EMAIL_FROM?.trim()) {
    throw new Error("EMAIL_FROM is required and must use a verified production sender");
  }
  return configured ?? "nexus-development-auth-secret-change-me-32-plus";
}

export const auth = betterAuth({
  secret: authSecret(),
  baseURL: APP_URL,
  trustedOrigins: trustedAuthOrigins(APP_URL),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    requireEmailVerification: productionRuntime,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      const result = await sendPasswordResetEmail({ email: user.email, name: user.name, url });
      if (!result.ok) throw new Error("Password reset email delivery failed");
    },
  },
  emailVerification: {
    sendOnSignUp: productionRuntime,
    sendOnSignIn: productionRuntime,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60,
    sendVerificationEmail: async ({ user, url }) => {
      const result = await sendEmailVerification({ email: user.email, name: user.name, url });
      if (!result.ok) throw new Error("Verification email delivery failed");
    },
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customStorage: authRateLimitStorage,
  },
  plugins: [nextCookies()],
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await ensureDb();
          const bonus = signupBonusMicros();
          if (bonus > 0) {
            await db
              .update(schema.users)
              .set({ creditMicros: bonus })
              .where(eq(schema.users.id, user.id));
            await db.insert(schema.creditLedger).values({
              id: id("led"),
              userId: user.id,
              type: "signup_bonus",
              micros: bonus,
              note: "Crédito de bienvenida",
            });
          }
          const workspaceId = id("ws");
          await db.insert(schema.workspaces).values({
            id: workspaceId,
            userId: user.id,
            name: "Default",
            slug: "default",
            isDefault: true,
          });
          await issueApiKey({ userId: user.id, name: "Default", workspaceId });
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
