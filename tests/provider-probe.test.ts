import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isRecentHealthy, providerProbeResult } from "../src/lib/providers/probe";

describe("provider health truth", () => {
  it("accepts only successful provider responses", () => {
    assert.equal(providerProbeResult(200, 12).ok, true);
    assert.equal(providerProbeResult(204, 12).ok, true);
    assert.equal(providerProbeResult(401, 12).ok, false);
    assert.equal(providerProbeResult(403, 12).ok, false);
    assert.equal(providerProbeResult(429, 12).ok, false);
    assert.equal(providerProbeResult(500, 12).ok, false);
  });

  it("expires stale success probes", () => {
    const now = Date.now();
    assert.equal(isRecentHealthy({ status: "up", lastCheck: new Date(now - 29 * 60_000) }, now), true);
    assert.equal(isRecentHealthy({ status: "up", lastCheck: new Date(now - 31 * 60_000) }, now), false);
    assert.equal(isRecentHealthy({ status: "up", lastCheck: new Date(now + 2 * 60_000) }, now), false);
    assert.equal(isRecentHealthy({ status: "down", lastCheck: new Date(now) }, now), false);
  });
});
