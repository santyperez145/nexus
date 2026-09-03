import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createAuthRateLimitStorage } from "../src/lib/auth-rate-limit";

describe("distributed auth rate limit", () => {
  it("allows up to the configured maximum and then blocks", async () => {
    const counts = new Map<string, number>();
    const calls: Array<{ key: string; ttl: number }> = [];
    const storage = createAuthRateLimitStorage(async () => ({
      async incr(key, ttl) {
        calls.push({ key, ttl });
        const next = (counts.get(key) ?? 0) + 1;
        counts.set(key, next);
        return next;
      },
    }));
    const rule = { window: 60, max: 3 };

    assert.deepEqual(await storage.consume("ip:/sign-in/email", rule), {
      allowed: true,
      retryAfter: null,
    });
    assert.equal((await storage.consume("ip:/sign-in/email", rule)).allowed, true);
    assert.equal((await storage.consume("ip:/sign-in/email", rule)).allowed, true);
    assert.deepEqual(await storage.consume("ip:/sign-in/email", rule), {
      allowed: false,
      retryAfter: 60,
    });
    assert.deepEqual(calls.at(-1), { key: "auth:ip:/sign-in/email", ttl: 60 });
  });
});
