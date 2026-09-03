import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { corsModeForPath, isTrustedOrigin, publicCorsHeaders } from "../src/lib/cors";

describe("cors", () => {
  it("treats /api/v1 as public bearer CORS", () => {
    assert.equal(corsModeForPath("/api/v1/chat/completions"), "public");
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
    assert.ok(headers["Access-Control-Expose-Headers"].includes("X-Request-Id"));
  });

  it("trusts localhost and railway previews for cookie auth", () => {
    assert.equal(isTrustedOrigin("http://localhost:3000", "https://web.example"), true);
    assert.equal(isTrustedOrigin("https://web-production-ef6b3.up.railway.app", "https://web.example"), true);
    assert.equal(isTrustedOrigin("https://evil.example", "https://web.example"), false);
  });
});
