import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sendMail } from "../src/lib/email";

describe("production transactional email", () => {
  it("fails closed at delivery time without taking down the application", async () => {
    const env = process.env as Record<string, string | undefined>;
    const previousNodeEnv = env.NODE_ENV;
    const previousKey = env.RESEND_API_KEY;
    const previousFrom = env.EMAIL_FROM;
    env.NODE_ENV = "production";
    delete env.RESEND_API_KEY;
    delete env.EMAIL_FROM;
    try {
      await assert.rejects(
        () =>
          sendMail({
            to: "customer@nexus.test",
            subject: "Verify",
            text: "Verification body",
          }),
        /Production email requires RESEND_API_KEY and a verified EMAIL_FROM sender/,
      );
    } finally {
      if (previousNodeEnv === undefined) delete env.NODE_ENV;
      else env.NODE_ENV = previousNodeEnv;
      if (previousKey === undefined) delete env.RESEND_API_KEY;
      else env.RESEND_API_KEY = previousKey;
      if (previousFrom === undefined) delete env.EMAIL_FROM;
      else env.EMAIL_FROM = previousFrom;
    }
  });
});
