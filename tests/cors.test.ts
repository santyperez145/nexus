import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  corsModeForPath,
  isTrustedOrigin,
  publicCorsHeaders,
  shouldRejectCredentialedMutation,
  trustedAuthOrigins,
} from "../src/lib/cors";

describe("cors", () => {
  it("treats /api/v1 as public bearer CORS", () => {
    assert.equal(corsModeForPath("/api/v1/chat/completions"), "public");
    assert.equal(corsModeForPath("/v1/chat/completions"), "public");
    assert.equal(corsModeForPath("/api/auth/ok"), "credentialed");
    assert.equal(corsModeForPath("/api/webhooks/stripe"), "skip");
  });

  it("reflects browser origins on the public API", () => {
    const headers = publicCorsHeaders(
      new Request("https://api.nexus.test/api/v1/models", {
        headers: { origin: "https://app.example" },
      }),
    );
    assert.equal(headers["Access-Control-Allow-Origin"], "https://app.example");
    assert.ok(headers["Access-Control-Allow-Headers"].includes("HTTP-Referer"));
    assert.ok(headers["Access-Control-Allow-Headers"].includes("X-Title"));
    assert.ok(
      headers["Access-Control-Expose-Headers"].includes("X-Request-Id"),
    );
  });

  it("uses exact origins for cookie auth and excludes shared hosting wildcards", () => {
    assert.equal(
      isTrustedOrigin(
        "https://web.example",
        "https://web.example/path",
        "production",
      ),
      true,
    );
    assert.equal(
      isTrustedOrigin(
        "https://attacker.up.railway.app",
        "https://web.example",
        "production",
      ),
      false,
    );
    assert.equal(
      isTrustedOrigin(
        "http://localhost:3000",
        "https://web.example",
        "production",
      ),
      false,
    );
    assert.equal(
      isTrustedOrigin(
        "http://localhost:3000",
        "https://web.example",
        "development",
      ),
      true,
    );
    assert.deepEqual(trustedAuthOrigins("https://web.example", "production"), [
      "https://web.example",
    ]);
  });

  it("rejects cookie-authenticated mutations from missing or hostile origins", () => {
    const request = (origin?: string, cookie = true, method = "POST") =>
      new Request("https://web.example/api/internal/checkout", {
        method,
        headers: {
          ...(cookie ? { cookie: "session=secret" } : {}),
          ...(origin ? { origin } : {}),
        },
      });

    assert.equal(
      shouldRejectCredentialedMutation(
        request("https://web.example"),
        "https://web.example",
        "production",
      ),
      false,
    );
    assert.equal(
      shouldRejectCredentialedMutation(
        request("https://attacker.up.railway.app"),
        "https://web.example",
        "production",
      ),
      true,
    );
    assert.equal(
      shouldRejectCredentialedMutation(
        request(undefined),
        "https://web.example",
        "production",
      ),
      true,
    );
    assert.equal(
      shouldRejectCredentialedMutation(
        request("https://attacker.example", false),
        "https://web.example",
        "production",
      ),
      false,
    );
    assert.equal(
      shouldRejectCredentialedMutation(
        request("https://attacker.example", true, "GET"),
        "https://web.example",
        "production",
      ),
      false,
    );
  });
});
