import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertPublicHttpUrl,
  isBlockedHost,
  limitResponseBody,
  readResponseTextLimited,
} from "../src/lib/net/public-url";

describe("SSRF guard", () => {
  it("blocks loopback, link-local and RFC1918", () => {
    for (const host of [
      "localhost",
      "127.0.0.1",
      "10.0.0.8",
      "192.168.1.1",
      "172.16.0.4",
      "169.254.169.254",
      "::1",
      "::ffff:127.0.0.1",
      "::ffff:7f00:1",
      "fd00::1",
      "fe80::1",
      "2001:db8::1",
      "64:ff9b::7f00:1",
      "64:ff9b:1::1",
      "2002:7f00:1::",
      "fec0::1",
      "198.51.100.7",
      "203.0.113.7",
    ]) {
      assert.equal(isBlockedHost(host), true, host);
    }
    assert.equal(isBlockedHost("api.openai.com"), false);
    assert.equal(isBlockedHost("2606:4700:4700::1111"), false);
  });

  it("rejects metadata and credentialed URLs", () => {
    assert.throws(() => assertPublicHttpUrl("http://127.0.0.1/latest/meta-data"), (err: Error & { code?: string }) => err.code === "ssrf_blocked");
    assert.throws(() => assertPublicHttpUrl("http://user:pass@example.com"), (err: Error & { code?: string }) => err.code === "ssrf_blocked");
    assert.throws(() => assertPublicHttpUrl("file:///etc/passwd"));
    const ok = assertPublicHttpUrl("https://example.com/webhook");
    assert.equal(ok.hostname, "example.com");
  });

  it("bounds streamed response bodies before decoding them", async () => {
    assert.equal(await readResponseTextLimited(new Response("hello"), 5), "hello");
    await assert.rejects(
      () => readResponseTextLimited(new Response("too-large"), 4),
      (error: unknown) => (error as { code?: string }).code === "response_too_large",
    );
    await assert.rejects(
      () =>
        readResponseTextLimited(
          new Response("body", { headers: { "content-length": "9000" } }),
          100,
        ),
      (error: unknown) => (error as { status?: number }).status === 413,
    );
  });

  it("bounds managed provider streams while preserving successful responses", async () => {
    assert.equal(await limitResponseBody(new Response("hello"), 5).text(), "hello");
    await assert.rejects(
      () => limitResponseBody(new Response("too-large"), 4).text(),
      (error: unknown) => (error as { code?: string }).code === "response_too_large",
    );
    assert.throws(
      () => limitResponseBody(
        new Response("body", { headers: { "content-length": "9000" } }),
        100,
      ),
      (error: unknown) => (error as { status?: number }).status === 413,
    );
    assert.throws(
      () => limitResponseBody(
        new Response("body", { headers: { "content-length": "9000" } }),
        100,
        { status: 502, code: "provider_invalid_response" },
      ),
      (error: unknown) =>
        (error as { status?: number; code?: string }).status === 502 &&
        (error as { code?: string }).code === "provider_invalid_response",
    );
  });
});
