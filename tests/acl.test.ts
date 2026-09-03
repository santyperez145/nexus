import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  enforcePathPolicy,
  isGuestInferencePath,
  isManagementPath,
  normalizeApiKeyScopes,
  requiredScope,
} from "../src/lib/gateway/acl";
import type { AuthContext } from "../src/lib/gateway/types";

const guest: AuthContext = {
  userId: "usr_nexus_guest_playground",
  isManagement: false,
  creditMicros: 0,
  zdr: false,
  allowTraining: false,
  logPrompts: false,
  guest: true,
};

const inferenceKey: AuthContext = {
  ...guest,
  guest: false,
  userId: "u1",
  apiKeyId: "k1",
  isManagement: false,
};

const mgmtKey: AuthContext = { ...inferenceKey, isManagement: true, apiKeyId: "k2" };

describe("API path policy", () => {
  it("allows guest only on playground inference", () => {
    const chat = new Request("http://localhost/api/v1/chat/completions");
    const keys = new Request("http://localhost/api/v1/keys");
    assert.equal(isGuestInferencePath(chat), true);
    assert.equal(isManagementPath(keys), true);
    enforcePathPolicy(chat, guest);
    assert.throws(() => enforcePathPolicy(keys, guest), (err: Error & { status?: number }) => err.status === 401);
  });

  it("applies the same inference policy on the standalone /v1 data plane", () => {
    assert.doesNotThrow(() =>
      enforcePathPolicy(new Request("https://gateway.example/v1/chat/completions", { method: "POST" }), guest),
    );
    assert.throws(() =>
      enforcePathPolicy(new Request("https://gateway.example/v1/embeddings", { method: "POST" }), guest),
    );

    assert.throws(() =>
      enforcePathPolicy(new Request("https://gateway.example/v1/responses", { method: "POST" }), mgmtKey),
      /Management keys cannot run inference/,
    );
  });

  it("blocks inference keys from management routes", () => {
    const keys = new Request("http://localhost/api/v1/keys");
    assert.throws(() => enforcePathPolicy(keys, inferenceKey), (err: Error & { status?: number }) => err.status === 403);
    enforcePathPolicy(keys, mgmtKey);
  });

  it("blocks management keys from inference", () => {
    const chat = new Request("http://localhost/api/v1/chat/completions");
    assert.throws(() => enforcePathPolicy(chat, mgmtKey), (err: Error & { status?: number }) => err.status === 403);
    enforcePathPolicy(chat, inferenceKey);
  });

  it("requires method-specific least-privilege scopes", () => {
    const readKeys = new Request("http://localhost/api/v1/keys");
    const writeKeys = new Request("http://localhost/api/v1/keys", { method: "POST" });
    assert.equal(requiredScope(readKeys), "keys:read");
    assert.equal(requiredScope(writeKeys), "keys:write");
    const readOnly: AuthContext = { ...mgmtKey, scopes: ["keys:read"] };
    enforcePathPolicy(readKeys, readOnly);
    assert.throws(() => enforcePathPolicy(writeKeys, readOnly), /missing scope keys:write/);
  });

  it("rejects scopes outside the key class", () => {
    assert.deepEqual(normalizeApiKeyScopes(["inference:write"], false), ["inference:write"]);
    assert.throws(() => normalizeApiKeyScopes(["keys:write"], false), /Invalid API key scopes/);
  });
});
