import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { slugify } from "../src/lib/slug";

describe("slugify", () => {
  it("keeps ascii slugs", () => {
    assert.equal(slugify("Acme Labs"), "acme-labs");
  });

  it("falls back when empty", () => {
    assert.equal(slugify("***", "org"), "org");
  });
});
