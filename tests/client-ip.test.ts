import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clientIp, clientIpKey, trustedClientIpHeaders } from "../src/lib/network/client-ip";

describe("trusted client IP resolution", () => {
  it("uses Railway's edge-owned header and ignores spoofable forwarded input", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.99, 10.0.0.4",
      "x-real-ip": "198.51.100.24",
    });
    const env = { NODE_ENV: "production", RAILWAY_ENVIRONMENT_ID: "env_123" };
    assert.deepEqual(trustedClientIpHeaders(env), ["x-real-ip"]);
    assert.equal(clientIp(headers, env), "198.51.100.24");
  });

  it("fails closed to one global bucket on unknown production infrastructure", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.99" });
    const env = { NODE_ENV: "production" };
    assert.deepEqual(trustedClientIpHeaders(env), []);
    assert.equal(clientIp(headers, env), null);
    assert.equal(clientIpKey(headers, env), "unknown");
  });

  it("rejects malformed edge headers", () => {
    const env = { NODE_ENV: "production", RAILWAY_PUBLIC_DOMAIN: "nexus.up.railway.app" };
    assert.equal(clientIp(new Headers({ "x-real-ip": "not-an-ip" }), env), null);
    assert.equal(clientIp(new Headers({ "x-real-ip": "198.51.100.1, 10.0.0.1" }), env), null);
  });

  it("supports protected Vercel and Fly headers", () => {
    assert.equal(
      clientIp(new Headers({ "x-vercel-forwarded-for": "2001:db8::12" }), {
        NODE_ENV: "production",
        VERCEL: "1",
      }),
      "2001:db8::12",
    );
    assert.equal(
      clientIp(new Headers({ "fly-client-ip": "192.0.2.18" }), {
        NODE_ENV: "production",
        FLY_APP_NAME: "nexus",
      }),
      "192.0.2.18",
    );
  });

  it("keeps forwarded-chain convenience limited to local and test environments", () => {
    assert.equal(
      clientIp(new Headers({ "x-forwarded-for": "198.51.100.7, 127.0.0.1" }), {
        NODE_ENV: "test",
      }),
      "198.51.100.7",
    );
  });
});

