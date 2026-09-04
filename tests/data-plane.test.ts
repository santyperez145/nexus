import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DATA_PLANE_PROTOCOL_ROUTES } from "../src/lib/gateway/data-plane";

describe("independent data-plane parity", () => {
  it("exposes every supported inference protocol under /v1", () => {
    assert.deepEqual(Object.keys(DATA_PLANE_PROTOCOL_ROUTES).sort(), [
      "chat",
      "completions",
      "embeddings",
      "messages",
      "rerank",
      "responses",
    ]);
    assert.equal(new Set(Object.values(DATA_PLANE_PROTOCOL_ROUTES)).size, 6);
    assert.ok(Object.values(DATA_PLANE_PROTOCOL_ROUTES).every((path) => path.startsWith("/v1/")));
  });
});
