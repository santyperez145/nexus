import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { jsonError } from "../src/lib/gateway/errors";

describe("jsonError", () => {
  it("maps 403 to forbidden unless a code is set", async () => {
    const res = jsonError(Object.assign(new Error("blocked"), { status: 403 }));
    assert.equal(res.status, 403);
    const body = (await res.json()) as { error: { code: string } };
    assert.equal(body.error.code, "forbidden");
  });

  it("preserves guardrail_blocked", async () => {
    const res = jsonError(Object.assign(new Error("blocked"), { status: 403, code: "guardrail_blocked" }));
    const body = (await res.json()) as { error: { code: string } };
    assert.equal(body.error.code, "guardrail_blocked");
  });

  it("maps 413 to invalid_request", async () => {
    const res = jsonError(Object.assign(new Error("too large"), { status: 413 }));
    assert.equal(res.status, 413);
    const body = (await res.json()) as { error: { code: string } };
    assert.equal(body.error.code, "invalid_request");
  });
});
