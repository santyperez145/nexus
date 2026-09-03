import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { authorizeCronRequest } from "../src/lib/cron/authorize";

const previousSecret = process.env.CRON_SECRET;

afterEach(() => {
  if (previousSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = previousSecret;
});

describe("cron authorization", () => {
  it("fails closed when the production secret is absent", () => {
    delete process.env.CRON_SECRET;
    assert.deepEqual(authorizeCronRequest(new Request("https://nexus.test/cron")), {
      ok: false,
      status: 503,
      error: "Cron is not configured",
    });
  });

  it("rejects invalid credentials and accepts the bearer secret", () => {
    process.env.CRON_SECRET = "cron_test_secret";
    assert.equal(authorizeCronRequest(new Request("https://nexus.test/cron")).status, 401);
    assert.equal(
      authorizeCronRequest(
        new Request("https://nexus.test/cron", {
          headers: { authorization: "Bearer cron_test_secret" },
        }),
      ).ok,
      true,
    );
  });
});
