import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { consumeBillingOperationRateLimit } from "../src/lib/billing/operation-rate-limit";

describe("billing operation rate limit", () => {
  it("uses independent fixed windows for each user and operation", async () => {
    const keys: string[] = [];
    const counts = new Map<string, number>();
    const counterFactory = async () => ({
      async incr(key: string) {
        keys.push(key);
        const count = (counts.get(key) ?? 0) + 1;
        counts.set(key, count);
        return count;
      },
    });

    const checkout = await consumeBillingOperationRateLimit(
      "user_1",
      "checkout_create",
      { now: 601_000, counterFactory },
    );
    const portal = await consumeBillingOperationRateLimit(
      "user_1",
      "portal_create",
      { now: 601_000, counterFactory },
    );
    const otherUser = await consumeBillingOperationRateLimit(
      "user_2",
      "checkout_create",
      { now: 601_000, counterFactory },
    );

    assert.equal(checkout.allowed, true);
    assert.equal(checkout.limit, 10);
    assert.equal(checkout.remaining, 9);
    assert.equal(checkout.retryAfterSeconds, 599);
    assert.equal(portal.limit, 20);
    assert.equal(otherUser.remaining, 9);
    assert.deepEqual(keys, [
      "rl:billing:checkout_create:user_1:1",
      "rl:billing:portal_create:user_1:1",
      "rl:billing:checkout_create:user_2:1",
    ]);
  });

  it("blocks only after consuming the configured allowance", async () => {
    let count = 0;
    const counterFactory = async () => ({
      async incr() {
        count += 1;
        return count;
      },
    });

    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const result = await consumeBillingOperationRateLimit(
        "user_1",
        "checkout_create",
        { now: 42_000, counterFactory },
      );
      assert.equal(result.allowed, true);
    }

    const blocked = await consumeBillingOperationRateLimit(
      "user_1",
      "checkout_create",
      { now: 42_000, counterFactory },
    );
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.remaining, 0);
    assert.equal(blocked.retryAfterSeconds, 558);
  });

  it("fails closed when the distributed counter is unavailable", async () => {
    await assert.rejects(
      consumeBillingOperationRateLimit("user_1", "checkout_reconcile", {
        counterFactory: async () => {
          throw new Error("redis unavailable");
        },
      }),
      /redis unavailable/,
    );
  });
});
