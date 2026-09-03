import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { allModels, parseVariant, resolveModelSlug } from "../src/lib/catalog";

describe("catalog", () => {
  it("ships 425 market models plus Nexus routers", () => {
    const models = allModels();
    const ids = new Set(models.map((m) => m.id));
    assert.ok(ids.has("nexus/auto"));
    assert.ok(ids.has("nexus/free"));
    assert.ok(ids.has("openai/gpt-4o"));
    assert.ok(ids.has("anthropic/claude-sonnet-4.6"));
    assert.ok(models.length >= 425, `expected >= 425, got ${models.length}`);
  });

  it("keeps multi-host overlays on curated slugs", () => {
    const llama = allModels().find((m) => m.id === "meta-llama/llama-3.3-70b-instruct");
    assert.ok(llama);
    assert.ok(llama.endpoints.length >= 2);
    assert.ok(llama.endpoints.some((e) => e.adapter === "groq"));
  });

  it("still parses :online variants", () => {
    assert.deepEqual(parseVariant("openai/gpt-5:online"), { id: "openai/gpt-5", variants: ["online"] });
  });

  it("strips ~ alias prefix", () => {
    assert.deepEqual(parseVariant("~openai/gpt-4o:cheap"), { id: "openai/gpt-4o", variants: ["cheap"] });
  });

  it("resolves ~author/latest to a real slug", () => {
    const resolved = resolveModelSlug("~openai/latest");
    assert.ok(resolved.startsWith("openai/"));
    assert.notEqual(resolved, "openai/latest");
    assert.ok(allModels().some((m) => m.id === resolved.split(":")[0]));
  });
});
