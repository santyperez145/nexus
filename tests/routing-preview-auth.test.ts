import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hasAuthCredentials } from "../src/lib/gateway/request-credentials";

describe("routing preview identity", () => {
  it("uses public defaults only when the caller sent no credentials", () => {
    assert.equal(hasAuthCredentials(new Request("https://nexus.test/api/v1/routing/preview")), false);
    assert.equal(
      hasAuthCredentials(
        new Request("https://nexus.test/api/v1/routing/preview", {
          headers: { authorization: "Bearer invalid" },
        }),
      ),
      true,
    );
    assert.equal(
      hasAuthCredentials(
        new Request("https://nexus.test/api/v1/routing/preview", {
          headers: { cookie: "better-auth.session_token=expired" },
        }),
      ),
      true,
    );
  });
});
