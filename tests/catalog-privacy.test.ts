import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeUpstream } from "../src/lib/catalog/normalize";

describe("catalog honesty", () => {
  it("does not treat content moderation as ZDR", () => {
    const m = normalizeUpstream({
      id: "acme/mod-model",
      pricing: { prompt: "0.000001", completion: "0.000002" },
      top_provider: { is_moderated: true },
    });
    assert.equal(m.topProvider.isModerated, true);
    assert.equal(m.endpoints[0]?.zdr, false);
  });

  it("does not mark zero-price discovered rows as free unless they are", () => {
    const m = normalizeUpstream({
      id: "acme/unknown-price",
      pricing: { prompt: "0", completion: "0" },
    });
    assert.equal(m.free, true);
    assert.equal(m.verified, false);
    assert.equal(m.endpoints[0]?.zdr, false);
    assert.equal(m.endpoints[0]?.verified, false);
  });
});
