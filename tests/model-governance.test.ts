import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPromotionChecklist } from "../src/lib/hub/model-governance";

const revision = {
  id: "mdlrev_1",
  repositoryId: "mdlrepo_1",
  revision: 1,
  commitSha: "a".repeat(16),
  commitMessage: "Release safe weights",
  metadata: {
    nexus: {
      model_card: "A complete model card with evaluation and safety limitations.",
      license: "apache-2.0",
      pipeline_tag: "text-generation",
      library_name: "transformers",
    },
  },
  createdBy: "usr_1",
  createdAt: new Date(),
};

describe("model promotion trust checklist", () => {
  it("passes only an immutable, documented, evaluated and integrity-bound release", () => {
    const checklist = buildPromotionChecklist({
      repository: { latestRevision: 1, visibility: "public", gated: false },
      revision,
      artifacts: [
        { path: "weights/model.safetensors", status: "ready", checksumSha256: "b".repeat(64) },
        { path: "config.json", status: "ready", checksumSha256: "c".repeat(64) },
      ],
      verifiedEvaluationCount: 1,
      runtimeReady: true,
    });
    assert.ok(Object.values(checklist).every(Boolean));
  });

  it("fails closed for executable pickle formats, missing checksums and stale revisions", () => {
    const checklist = buildPromotionChecklist({
      repository: { latestRevision: 2, visibility: "public", gated: false },
      revision,
      artifacts: [
        { path: "weights/pytorch_model.bin", status: "ready", checksumSha256: null },
      ],
      verifiedEvaluationCount: 0,
      runtimeReady: false,
    });
    assert.equal(checklist.latest_revision, false);
    assert.equal(checklist.artifact_integrity, false);
    assert.equal(checklist.safe_serialization, false);
    assert.equal(checklist.verified_evaluation, false);
    assert.equal(checklist.runtime_ready, false);
  });
});
