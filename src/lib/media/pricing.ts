export const MEDIA_PRICE_VERSION = "2026-09-03";

export const IMAGE_MODELS = [
  "gpt-image-2",
  "gpt-image-1.5",
  "gpt-image-1",
  "gpt-image-1-mini",
] as const;
export const IMAGE_SIZES = ["1024x1024", "1024x1536", "1536x1024"] as const;
export const IMAGE_QUALITIES = ["low", "medium", "high"] as const;

export const SPEECH_MODELS = ["tts-1", "tts-1-hd", "gpt-4o-mini-tts"] as const;
export const SPEECH_FORMATS = ["mp3", "opus", "aac", "flac", "wav", "pcm"] as const;
export const TRANSCRIPTION_MODELS = [
  "gpt-transcribe",
  "gpt-4o-transcribe",
  "gpt-4o-mini-transcribe",
  "whisper-1",
] as const;
export const EMBEDDING_MODELS = ["text-embedding-3-small", "text-embedding-3-large"] as const;

const imagePrices = {
  "gpt-image-2": {
    low: [0.009, 0.013],
    medium: [0.034, 0.05],
    high: [0.133, 0.2],
  },
  "gpt-image-1.5": {
    low: [0.009, 0.013],
    medium: [0.034, 0.05],
    high: [0.133, 0.2],
  },
  "gpt-image-1": {
    low: [0.011, 0.016],
    medium: [0.042, 0.063],
    high: [0.167, 0.25],
  },
  "gpt-image-1-mini": {
    low: [0.005, 0.006],
    medium: [0.011, 0.015],
    high: [0.036, 0.052],
  },
} as const;

const speechUsdPerMillionCharacters: Record<(typeof SPEECH_MODELS)[number], number> = {
  "tts-1": 15,
  "tts-1-hd": 30,
  // Nexus retail schedule. The upstream model is token-metered and returns audio bytes without usage.
  "gpt-4o-mini-tts": 15,
};

const transcriptionUsdPerMinute: Record<(typeof TRANSCRIPTION_MODELS)[number], number> = {
  "gpt-transcribe": 0.0045,
  "gpt-4o-transcribe": 0.006,
  "gpt-4o-mini-transcribe": 0.003,
  "whisper-1": 0.006,
};

function normalizeOpenAiModel(value: unknown, fallback: string) {
  const raw = String(value ?? fallback).trim().toLowerCase();
  if (!raw) return fallback;
  const segments = raw.split("/");
  if (segments.length > 1 && segments[0] !== "openai") return "";
  return segments.at(-1) ?? "";
}

export function supportedEmbeddingModel(value: unknown) {
  const model = normalizeOpenAiModel(value, EMBEDDING_MODELS[0]);
  return EMBEDDING_MODELS.includes(model as (typeof EMBEDDING_MODELS)[number]) ? model : null;
}

export function quoteImage(input: { model?: unknown; size?: unknown; quality?: unknown; n?: unknown }) {
  const model = normalizeOpenAiModel(input.model, IMAGE_MODELS[0]);
  const size = String(input.size ?? IMAGE_SIZES[0]).toLowerCase();
  const quality = String(input.quality ?? "medium").toLowerCase();
  const rawN = input.n == null ? 1 : Number(input.n);
  if (!IMAGE_MODELS.includes(model as (typeof IMAGE_MODELS)[number])) return null;
  if (!IMAGE_SIZES.includes(size as (typeof IMAGE_SIZES)[number])) return null;
  if (!IMAGE_QUALITIES.includes(quality as (typeof IMAGE_QUALITIES)[number])) return null;
  if (!Number.isInteger(rawN) || rawN < 1 || rawN > 4) return null;
  const rectangular = size !== "1024x1024" ? 1 : 0;
  const unitUsd = imagePrices[model as keyof typeof imagePrices][quality as keyof (typeof imagePrices)[keyof typeof imagePrices]][rectangular];
  return { model, size, quality, n: rawN, unitUsd, usd: unitUsd * rawN };
}

export function quoteSpeech(input: { model?: unknown; characters: number }) {
  const model = normalizeOpenAiModel(input.model, "tts-1");
  if (!SPEECH_MODELS.includes(model as (typeof SPEECH_MODELS)[number])) return null;
  if (!Number.isInteger(input.characters) || input.characters < 1 || input.characters > 4096) return null;
  const usd = (input.characters / 1_000_000) * speechUsdPerMillionCharacters[model as (typeof SPEECH_MODELS)[number]];
  return { model, characters: input.characters, usd };
}

export function quoteTranscription(input: { model?: unknown; durationSeconds: number }) {
  const model = normalizeOpenAiModel(input.model, "whisper-1");
  if (!TRANSCRIPTION_MODELS.includes(model as (typeof TRANSCRIPTION_MODELS)[number])) return null;
  if (!Number.isFinite(input.durationSeconds) || input.durationSeconds <= 0 || input.durationSeconds > 3 * 60 * 60) {
    return null;
  }
  const usd =
    (input.durationSeconds / 60) *
    transcriptionUsdPerMinute[model as (typeof TRANSCRIPTION_MODELS)[number]];
  return { model, durationSeconds: input.durationSeconds, usd };
}
