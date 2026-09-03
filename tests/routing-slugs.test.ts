import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseVariant } from "../src/lib/catalog/index";
import { presetSlugFromModel } from "../src/lib/gateway/presets";

describe("routing slugs", () => {
  it("parses :fast :cheap :online variants", () => {
    assert.deepEqual(parseVariant("meta-llama/llama-3.3-70b-instruct:online:cheap"), {
      id: "meta-llama/llama-3.3-70b-instruct",
      variants: ["online", "cheap"],
    });
  });

  it("resolves @preset and nexus/preset/ slugs", () => {
    assert.equal(presetSlugFromModel("@team-default"), "team-default");
    assert.equal(presetSlugFromModel("nexus/preset/team-default"), "team-default");
    assert.equal(presetSlugFromModel("openai/gpt-5"), null);
  });
});
