import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectVideoCredential } from "../src/lib/media/credentials";
import { canUseByokForMedia, mediaPrivacyAllowed } from "../src/lib/gateway/media-privacy";
import { configuredVideoRetailUsd } from "../src/lib/gateway/media-billing";
import {
  isModelRouteSupported,
  modelAction,
  modelKind,
} from "../src/lib/catalog/presentation";
import {
  quoteImage,
  quoteSpeech,
  quoteTranscription,
  supportedEmbeddingModel,
} from "../src/lib/media/pricing";

describe("media billing quotes", () => {
  it("prices image quality, shape and count before execution", () => {
    assert.equal(quoteImage({})?.usd, 0.034);
    assert.equal(
      quoteImage({ model: "openai/gpt-image-1", size: "1536x1024", quality: "high", n: 2 })?.usd,
      0.5,
    );
    assert.equal(quoteImage({ model: "dall-e-3" }), null);
    assert.equal(quoteImage({ n: 1.5 }), null);
  });

  it("prices speech by model and enforces the provider input limit", () => {
    assert.equal(quoteSpeech({ model: "tts-1", characters: 1000 })?.usd, 0.015);
    assert.equal(quoteSpeech({ model: "tts-1-hd", characters: 1000 })?.usd, 0.03);
    assert.equal(quoteSpeech({ model: "tts-1", characters: 4097 }), null);
  });

  it("prices transcription from measured duration", () => {
    assert.equal(
      quoteTranscription({ model: "gpt-4o-mini-transcribe", durationSeconds: 60 })?.usd,
      0.003,
    );
    assert.equal(quoteTranscription({ model: "whisper-1", durationSeconds: 3 * 60 * 60 + 1 }), null);
  });

  it("rejects embedding aliases that would otherwise be silently remapped", () => {
    assert.equal(supportedEmbeddingModel("openai/text-embedding-3-large"), "text-embedding-3-large");
    assert.equal(supportedEmbeddingModel("openai/not-a-model"), null);
  });

  it("does not route catalog-only media models through incompatible studio endpoints", () => {
    const kind = modelKind({
      id: "google/example-image",
      input: ["text"],
      output: ["image"],
    });
    assert.equal(kind, "image");
    assert.equal(isModelRouteSupported(kind, "google/example-image"), false);
    assert.deepEqual(modelAction(kind, "google/example-image"), {
      href: "/providers",
      label: "Ver disponibilidad",
    });
    assert.equal(isModelRouteSupported("image", "openai/gpt-image-2"), true);
  });

  it("prefers and correctly attributes customer video credentials", () => {
    assert.deepEqual(
      selectVideoCredential({
        replicateByok: "customer",
        falPlatform: "platform",
      }),
      { provider: "replicate", apiKey: "customer", isByok: true },
    );
    assert.deepEqual(selectVideoCredential({ falPlatform: "platform" }), {
      provider: "fal",
      apiKey: "platform",
      isByok: false,
    });
  });

  it("keeps video disabled until an operator pins a valid retail price", () => {
    const previous = process.env.NEXUS_VIDEO_RETAIL_USD;
    delete process.env.NEXUS_VIDEO_RETAIL_USD;
    assert.equal(configuredVideoRetailUsd(), null);
    process.env.NEXUS_VIDEO_RETAIL_USD = "0";
    assert.equal(configuredVideoRetailUsd(), null);
    process.env.NEXUS_VIDEO_RETAIL_USD = "1.25";
    assert.equal(configuredVideoRetailUsd(), 1.25);
    if (previous == null) delete process.env.NEXUS_VIDEO_RETAIL_USD;
    else process.env.NEXUS_VIDEO_RETAIL_USD = previous;
  });

  it("fails every media modality closed under strict privacy", () => {
    assert.equal(canUseByokForMedia({ zdr: false, allowTraining: true }), true);
    assert.equal(canUseByokForMedia({ zdr: true, allowTraining: true }), false);
    assert.equal(canUseByokForMedia({ zdr: false, allowTraining: false }), false);
    assert.equal(
      mediaPrivacyAllowed({
        requiresZdr: true,
        requiresNoTraining: true,
        isByok: true,
        zdrConfirmed: true,
        noTrainingConfirmed: true,
      }),
      false,
    );
    assert.equal(
      mediaPrivacyAllowed({
        requiresZdr: true,
        requiresNoTraining: true,
        isByok: false,
        zdrConfirmed: false,
        noTrainingConfirmed: true,
      }),
      false,
    );
    assert.equal(
      mediaPrivacyAllowed({
        requiresZdr: true,
        requiresNoTraining: true,
        isByok: false,
        zdrConfirmed: true,
        noTrainingConfirmed: false,
      }),
      true,
    );
  });
});
