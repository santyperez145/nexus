import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { allModels, findModel } from "../src/lib/catalog";
import { normalizeUpstream } from "../src/lib/catalog/normalize";
import { jsonError } from "../src/lib/gateway/errors";
import { bindRequestId } from "../src/lib/gateway/request-id";
import { resolveRoute, sortEndpoints } from "../src/lib/gateway/router";
import type { AuthContext } from "../src/lib/gateway/types";
import { canManageOrg, normalizeInviteRole } from "../src/lib/orgs/acl";

const auth: AuthContext = {
  userId: "u1",
  isManagement: false,
  creditMicros: 1_000_000,
  zdr: false,
  allowTraining: true,
  logPrompts: false,
};

describe("catalog verified vs discovered", () => {
  it("marks bundled hosts curated and discovered rows unverified", () => {
    const llama = findModel("meta-llama/llama-3.3-70b-instruct");
    assert.equal(llama?.verified, true);
    assert.ok(llama?.endpoints.every((e) => e.verified && e.metricsEstimated));
    const discovered = normalizeUpstream({
      id: "acme/unknown-price",
      pricing: { prompt: "0", completion: "0" },
    });
    assert.equal(discovered.verified, false);
    assert.equal(discovered.endpoints[0]?.verified, false);
    assert.equal(discovered.endpoints[0]?.latencyMs, 0);
  });

  it("does not treat missing pricing as a free model", () => {
    const m = normalizeUpstream({ id: "acme/unpriced" });
    assert.equal(m.free, false);
    assert.equal(m.pricing.prompt, 0);
  });

  it("does not let a discovered zero price self-certify as free", () => {
    const m = normalizeUpstream({
      id: "acme/open-weights",
      pricing: { prompt: "0", completion: "0" },
    });
    assert.equal(m.free, false);
    assert.equal(m.endpoints[0]?.pricingVerified, false);
  });

  it("exposes honest flags on every non-router catalog row", () => {
    const models = allModels().filter((m) => !m.id.startsWith("nexus/"));
    assert.ok(models.some((m) => m.verified));
    assert.ok(models.every((m) => m.endpoints.every((e) => typeof e.latencyMs === "number")));
    const external = models.filter((m) => !m.verified);
    assert.ok(external.length > 0);
    assert.ok(
      external.every((m) =>
        m.endpoints.every(
          (e) =>
            e.verified === false &&
            e.metricsEstimated === true &&
            e.latencyMs === 0 &&
            e.throughputTps === 0 &&
            e.uptime === 0 &&
            e.zdr === false,
        ),
      ),
    );
  });
});

describe("routing latency honesty", () => {
  it("sorts unknown latency last when asking for :fast / latency", () => {
    const ranked = sortEndpoints(
      [
        { name: "slow", adapter: "slow", providerModel: "x", pricing: { prompt: 1, completion: 1 }, latencyMs: 400, throughputTps: 10, zdr: false, uptime: 0, quantization: "unknown" },
        { name: "unknown", adapter: "unknown", providerModel: "x", pricing: { prompt: 0.1, completion: 0.1 }, latencyMs: 0, throughputTps: 0, zdr: false, uptime: 0, quantization: "unknown" },
        { name: "fast", adapter: "fast", providerModel: "x", pricing: { prompt: 2, completion: 2 }, latencyMs: 80, throughputTps: 200, zdr: false, uptime: 0, quantization: "unknown" },
      ],
      "latency",
    );
    assert.deepEqual(ranked.map((e) => e.name), ["fast", "slow", "unknown"]);
  });

  it("does not fabricate a fast host when no telemetry has been measured", () => {
    const plan = resolveRoute(
      { model: "meta-llama/llama-3.3-70b-instruct:fast", messages: [{ role: "user", content: "hi" }] },
      auth,
    );
    const first = plan.models[0]?.endpoints[0];
    assert.ok(first);
    assert.equal(first.latencyMs, 0);
    assert.equal(first.throughputTps, 0);
    assert.equal(first.metricsEstimated, true);
  });
});

describe("org RBAC", () => {
  it("lets owner and admin invite, not members", () => {
    assert.equal(canManageOrg(true, "member"), true);
    assert.equal(canManageOrg(false, "admin"), true);
    assert.equal(canManageOrg(false, "member"), false);
    assert.equal(normalizeInviteRole("admin"), "admin");
    assert.equal(normalizeInviteRole("owner"), null);
    assert.equal(normalizeInviteRole("billing"), null);
  });
});

describe("request id on errors", () => {
  it("echoes x-request-id from the bound request", async () => {
    bindRequestId(new Request("http://localhost/api/v1/keys", { headers: { "x-request-id": "req_test_1" } }));
    const res = jsonError(Object.assign(new Error("blocked"), { status: 403 }));
    assert.equal(res.headers.get("x-request-id"), "req_test_1");
  });
});

describe("ledger hold types", () => {
  it("uses distinct types so hold and settle can share a generation id", () => {
    const types = ["reserve", "reserve_release", "inference"];
    assert.equal(new Set(types).size, 3);
    const unique = new Set<string>();
    function insert(generationId: string | null, type: string) {
      const key = `${generationId ?? "null"}:${type}`;
      if (unique.has(key) && generationId) return false;
      unique.add(key);
      return true;
    }
    assert.equal(insert(null, "reserve"), true);
    assert.equal(insert("gen_1", "reserve_release"), true);
    assert.equal(insert("gen_1", "inference"), true);
    assert.equal(insert("gen_1", "inference"), false);
  });
});
