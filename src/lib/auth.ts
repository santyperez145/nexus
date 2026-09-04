import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { signupBonusMicros, APP_URL } from "./config";
import { authRateLimitStorage } from "./auth-rate-limit";
import { trustedAuthOrigins } from "./cors";
import { db, ensureDb, schema } from "./db";
import { sendEmailVerification, sendPasswordResetEmail } from "./email";
import { provisionUserAccount } from "./onboarding/provision";

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
  // Transactional email is a launch/readiness requirement, not a process boot
  // requirement. sendMail still fails closed in production when it is missing,
  // so verification and recovery cannot silently succeed, while public pages
  // and existing sessions remain available for operators to repair configuration.
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
          await provisionUserAccount(user.id, signupBonusMicros());
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
