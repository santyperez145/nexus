import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  consumeControlPlaneOperationRateLimit,
  enforceControlPlaneOperationRateLimit,
} from "../src/lib/control-plane/operation-rate-limit";

describe("costly control-plane operation rate limits", () => {
  it("keeps independent quotas per user and operation", async () => {
    const counts = new Map<string, number>();
    const keys: string[] = [];
    const counterFactory = async () => ({
      async incr(key: string) {
        keys.push(key);
        const count = (counts.get(key) ?? 0) + 1;
        counts.set(key, count);
        return count;
      },
    });

    const email = await consumeControlPlaneOperationRateLimit(
      "operator_1",
      "notification_test",
      { now: 3_601_000, counterFactory },
    );
    const probe = await consumeControlPlaneOperationRateLimit(
      "operator_1",
      "connection_probe",
      { now: 601_000, counterFactory },
    );
    const otherOperator = await consumeControlPlaneOperationRateLimit(
      "operator_2",
      "notification_test",
      { now: 3_601_000, counterFactory },
    );
    const invitation = await consumeControlPlaneOperationRateLimit(
      "operator_1",
      "organization_invite",
      { now: 3_601_000, counterFactory },
    );
    const recipient = await consumeControlPlaneOperationRateLimit(
      "recipient_hash",
      "organization_invite_recipient",
      { now: 86_401_000, counterFactory },
    );
    const ping = await consumeControlPlaneOperationRateLimit(
      "operator_1:destination_1",
      "observability_ping",
      { now: 601_000, counterFactory },
    );
    const destination = await consumeControlPlaneOperationRateLimit(
      "operator_1",
      "observability_destination",
      { now: 3_601_000, counterFactory },
    );

    assert.equal(email.limit, 3);
    assert.equal(email.remaining, 2);
    assert.equal(email.retryAfterSeconds, 3_599);
    assert.equal(probe.limit, 6);
    assert.equal(otherOperator.remaining, 2);
    assert.equal(invitation.limit, 20);
    assert.equal(recipient.limit, 3);
    assert.equal(ping.limit, 20);
    assert.equal(destination.limit, 10);
    assert.deepEqual(keys, [
      "rl:control:notification_test:operator_1:1",
      "rl:control:connection_probe:operator_1:1",
      "rl:control:notification_test:operator_2:1",
      "rl:control:organization_invite:operator_1:1",
      "rl:control:organization_invite_recipient:recipient_hash:1",
      "rl:control:observability_ping:operator_1:destination_1:1",
      "rl:control:observability_destination:operator_1:1",
    ]);
  });

  it("blocks the fourth notification test and exposes retry metadata", async () => {
    let count = 0;
    const counterFactory = async () => ({
      async incr() {
        count += 1;
        return count;
      },
    });

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const response = await enforceControlPlaneOperationRateLimit(
        "user_1",
        "notification_test",
        { now: 2_000, counterFactory },
      );
      assert.equal(response, null);
    }

    const response = await enforceControlPlaneOperationRateLimit(
      "user_1",
      "notification_test",
      { now: 2_000, counterFactory },
    );
    assert.equal(response?.status, 429);
    assert.equal(response?.headers.get("Retry-After"), "3598");
    assert.equal(response?.headers.get("X-RateLimit-Limit"), "3");
    assert.equal(response?.headers.get("X-RateLimit-Remaining"), "0");
  });

  it("fails closed when the distributed counter is unavailable", async () => {
    const response = await enforceControlPlaneOperationRateLimit(
      "user_1",
      "catalog_sync",
      {
        counterFactory: async () => {
          throw new Error("redis unavailable");
        },
      },
    );
    assert.equal(response?.status, 503);
    assert.deepEqual(await response?.json(), {
      error: {
        message:
          "La protección de esta operación no está disponible temporalmente.",
        type: "server_error",
        code: "rate_limit_unavailable",
      },
    });
  });
});
