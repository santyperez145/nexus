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

    const readDatasets = new Request("http://localhost/api/v1/datasets");
    const publishRevision = new Request(
      "http://localhost/api/v1/datasets/nexus/evals/revisions",
      { method: "POST" },
    );
    assert.equal(requiredScope(readDatasets), "datasets:read");
    assert.equal(requiredScope(publishRevision), "datasets:write");
    enforcePathPolicy(readDatasets, { ...mgmtKey, scopes: ["datasets:read"] });
    assert.throws(
      () => enforcePathPolicy(publishRevision, { ...mgmtKey, scopes: ["datasets:read"] }),
      /missing scope datasets:write/,
    );

    const readSpaces = new Request("http://localhost/api/v1/spaces");
    const writeSpace = new Request("http://localhost/api/v1/spaces/nexus/copilot", { method: "PATCH" });
    assert.equal(requiredScope(readSpaces), "spaces:read");
    assert.equal(requiredScope(writeSpace), "spaces:write");
    enforcePathPolicy(readSpaces, { ...mgmtKey, scopes: ["spaces:read"] });
    assert.throws(
      () => enforcePathPolicy(writeSpace, { ...mgmtKey, scopes: ["spaces:read"] }),
      /missing scope spaces:write/,
    );

    const publicModels = new Request("http://localhost/api/v1/models?include_reference=true");
    const modelRepository = new Request("http://localhost/api/v1/models/acme/spanish-7b");
    const ownModels = new Request("http://localhost/api/v1/models?mine=1");
    const publishModel = new Request("http://localhost/api/v1/models", { method: "POST" });
    assert.equal(isManagementPath(publicModels), false);
    assert.equal(requiredScope(publicModels), null);
    assert.equal(requiredScope(modelRepository), "models:read");
    assert.equal(isManagementPath(ownModels), true);
    assert.equal(requiredScope(ownModels), "models:read");
    assert.equal(requiredScope(publishModel), "models:write");
    enforcePathPolicy(ownModels, { ...mgmtKey, scopes: ["models:read"] });
    assert.throws(
      () => enforcePathPolicy(modelRepository, { ...inferenceKey, scopes: ["inference:write"] }),
      /missing scope models:read/,
    );
    assert.throws(
      () => enforcePathPolicy(publishModel, { ...mgmtKey, scopes: ["models:read"] }),
      /missing scope models:write/,
    );
  });

  it("treats Space execution as inference while keeping its CRUD in management", () => {
    const run = new Request("http://localhost/api/v1/spaces/nexus/copilot/run", { method: "POST" });
    const edit = new Request("http://localhost/api/v1/spaces/nexus/copilot", { method: "PATCH" });
    assert.equal(isManagementPath(run), false);
    assert.equal(requiredScope(run), "inference:write");
    enforcePathPolicy(run, { ...inferenceKey, scopes: ["inference:write"] });
    assert.throws(() => enforcePathPolicy(run, mgmtKey), /Management keys cannot run inference/);
    assert.throws(() => enforcePathPolicy(run, guest), /Guest header is not accepted/);
    assert.equal(isManagementPath(edit), true);
    assert.throws(() => enforcePathPolicy(edit, inferenceKey), /Management API key required/);
  });

  it("rejects scopes outside the key class", () => {
    assert.deepEqual(normalizeApiKeyScopes(["inference:write"], false), ["inference:write"]);
    assert.throws(() => normalizeApiKeyScopes(["keys:write"], false), /Invalid API key scopes/);
  });
});
