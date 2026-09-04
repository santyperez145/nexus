import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { anthropicJsonError, jsonError } from "../src/lib/gateway/errors";

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

  it("maps malformed JSON to a client error", async () => {
    const res = jsonError(new SyntaxError("Unexpected end of JSON input"));
    assert.equal(res.status, 400);
    const body = (await res.json()) as {
      error: { code: string; message: string; type: string };
    };
    assert.equal(body.error.code, "invalid_request");
    assert.equal(body.error.message, "Invalid JSON body");
    assert.equal(body.error.type, "invalid_request_error");
  });

  it("does not expose an unclassified internal error to clients", async () => {
    const original = console.error;
    console.error = () => undefined;
    try {
      const res = jsonError(new Error("postgres password=do-not-leak"));
      assert.equal(res.status, 500);
      const body = (await res.json()) as { error: { code: string; message: string } };
      assert.equal(body.error.code, "internal_error");
      assert.equal(body.error.message, "Internal server error");
    } finally {
      console.error = original;
    }
  });

  it("applies the same malformed-body and 500 safety to Anthropic errors", async () => {
    const malformed = anthropicJsonError(new SyntaxError("Unexpected token in JSON"));
    assert.equal(malformed.status, 400);
    assert.equal(
      ((await malformed.json()) as { error: { message: string } }).error.message,
      "Invalid JSON body",
    );

    const original = console.error;
    console.error = () => undefined;
    try {
      const internal = anthropicJsonError(new Error("secret provider state"));
      assert.equal(internal.status, 500);
      assert.equal(
        ((await internal.json()) as { error: { message: string } }).error.message,
        "Internal server error",
      );
    } finally {
      console.error = original;
    }
  });
});
