import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertPublicHttpUrl, isBlockedHost } from "../src/lib/net/public-url";

describe("SSRF guard", () => {
  it("blocks loopback, link-local and RFC1918", () => {
    for (const host of ["localhost", "127.0.0.1", "10.0.0.8", "192.168.1.1", "172.16.0.4", "169.254.169.254"]) {
      assert.equal(isBlockedHost(host), true, host);
    }
    assert.equal(isBlockedHost("api.openai.com"), false);
  });

  it("rejects metadata and credentialed URLs", () => {
    assert.throws(() => assertPublicHttpUrl("http://127.0.0.1/latest/meta-data"), (err: Error & { code?: string }) => err.code === "ssrf_blocked");
    assert.throws(() => assertPublicHttpUrl("http://user:pass@example.com"), (err: Error & { code?: string }) => err.code === "ssrf_blocked");
    assert.throws(() => assertPublicHttpUrl("file:///etc/passwd"));
    const ok = assertPublicHttpUrl("https://example.com/webhook");
    assert.equal(ok.hostname, "example.com");
  });
});
