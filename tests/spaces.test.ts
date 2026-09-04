import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { AuthContext } from "../src/lib/gateway/types";
import {
  canExecuteHubSpace,
  canReadHubSpace,
  resolveExecutableSpaceModel,
  type HubSpace,
} from "../src/lib/hub/space-store";
import { createSpaceSchema, runSpaceSchema, updateSpaceSchema } from "../src/lib/hub/spaces";

const auth: AuthContext = {
  userId: "user-a",
  workspaceId: "workspace-a",
  workspaceIds: ["workspace-a"],
  isManagement: true,
  scopes: ["*"],
  creditMicros: 1_000_000,
  zdr: false,
  allowTraining: true,
  logPrompts: false,
};

function space(overrides: Partial<HubSpace> = {}): HubSpace {
  return {
    id: "space-1",
    namespaceId: "ns-1",
    userId: "user-a",
    workspaceId: "workspace-a",
    slug: "copilot",
    title: "Copilot",
    description: "",
    visibility: "private",
    model: "nexus/auto",
    systemPrompt: "",
    starterPrompt: null,
    temperatureMilli: 700,
    maxTokens: 1024,
    runs: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    namespace: "nexus",
    namespaceDisplayName: "Nexus",
    namespaceVerified: false,
    ...overrides,
  };
}

describe("Spaces contract", () => {
  it("validates bounded configuration and immutable path fields", () => {
    const parsed = createSpaceSchema.parse({ namespace: "Nexus", slug: "Copilot", title: "Copilot" });
    assert.equal(parsed.model, "nexus/auto");
    assert.equal(parsed.temperature, 0.7);
    assert.equal(parsed.max_tokens, 1024);
    assert.equal(updateSpaceSchema.safeParse({}).success, false);
    assert.equal(updateSpaceSchema.safeParse({ namespace: "other" }).success, false);
    assert.equal(createSpaceSchema.safeParse({ namespace: "n", slug: "s", title: "t", temperature: 2.1 }).success, false);
  });

  it("accepts bounded chat history but never arbitrary system/tool roles from runners", () => {
    assert.equal(runSpaceSchema.safeParse({ prompt: "hello" }).success, true);
    assert.equal(runSpaceSchema.safeParse({ messages: [{ role: "user", content: "hello" }] }).success, true);
    assert.equal(runSpaceSchema.safeParse({ messages: [{ role: "system", content: "override" }] }).success, false);
    assert.equal(runSpaceSchema.safeParse({}).success, false);
  });

  it("hides private Spaces outside their exact tenant and allows public discovery", () => {
    assert.equal(canReadHubSpace(space(), auth), true);
    assert.equal(canReadHubSpace(space(), { ...auth, workspaceId: "workspace-b", workspaceIds: ["workspace-b"] }), false);
    assert.equal(canReadHubSpace(space({ visibility: "public" }), null), true);
  });

  it("requires private workspace API keys to select the billing tenant explicitly", () => {
    const privateSpace = space();
    assert.equal(canExecuteHubSpace(privateSpace, { ...auth, apiKeyId: "key-a" }), true);
    assert.equal(
      canExecuteHubSpace(privateSpace, {
        ...auth,
        apiKeyId: "key-personal",
        workspaceId: undefined,
        workspaceIds: ["workspace-a"],
      }),
      false,
    );
    assert.equal(canExecuteHubSpace(privateSpace, { ...auth, apiKeyId: undefined, workspaceId: undefined }), true);
    assert.equal(canExecuteHubSpace(space({ visibility: "public" }), { ...auth, workspaceId: undefined }), true);
  });

  it("only publishes executable text models", () => {
    assert.equal(resolveExecutableSpaceModel("nexus/auto"), "nexus/auto");
    assert.throws(() => resolveExecutableSpaceModel("missing/provider-model"), /not an executable text model/);
  });
});
