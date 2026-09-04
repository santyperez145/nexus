import {
  IMAGE_MODELS,
  SPEECH_MODELS,
  TRANSCRIPTION_MODELS,
} from "@/lib/media/pricing";
import { hasExecutableEndpoint, isTextGenerationModel } from "./pricing";
import type { CatalogModel } from "./types";

export type ModelKind = "text" | "image" | "video" | "speech" | "transcription" | "embeddings";

export function modelKind(model: { id: string; input: string[]; output: string[] }): ModelKind {
  const output = new Set(model.output.map((value) => value.toLowerCase()));
  const input = new Set(model.input.map((value) => value.toLowerCase()));
  const id = model.id.toLowerCase();
  if (output.has("image")) return "image";
  if (output.has("video")) return "video";
  if (output.has("embeddings") || id.includes("embedding")) return "embeddings";
  if (output.has("audio") || output.has("speech")) return "speech";
  if (input.has("audio") && output.has("text")) return "transcription";
  return "text";
}

function unprefixed(id: string) {
  return id.startsWith("openai/") ? id.slice("openai/".length) : id;
}

export function isModelRouteSupported(kind: ModelKind, id: string) {
  const candidate = unprefixed(id) as never;
  if (kind === "text") return true;
  if (kind === "image") return IMAGE_MODELS.includes(candidate);
  if (kind === "speech") return SPEECH_MODELS.includes(candidate);
  if (kind === "transcription") return TRANSCRIPTION_MODELS.includes(candidate);
  if (kind === "embeddings") return true;
  return id === "nexus/video";
}

export function isBuiltinRouterModel(id: string) {
  return id === "nexus/auto" || id === "nexus/free";
}

export function isTextModelExecutionReady(model: CatalogModel) {
  return (
    isBuiltinRouterModel(model.id) ||
    (isTextGenerationModel(model) && hasExecutableEndpoint(model))
  );
}

export function isModelExecutionReady(model: CatalogModel) {
  if (isBuiltinRouterModel(model.id)) return true;
  const kind = modelKind({
    id: model.id,
    input: model.architecture.inputModalities,
    output: model.architecture.outputModalities,
  });
  if (kind === "text" || kind === "embeddings") return hasExecutableEndpoint(model);
  return isModelRouteSupported(kind, model.id);
}

export function modelAction(kind: ModelKind, id: string) {
  if (kind === "text") {
    return { href: `/chat?model=${encodeURIComponent(id)}`, label: "Probar en chat" };
  }
  if (!isModelRouteSupported(kind, id)) {
    return { href: "/providers", label: "Ver disponibilidad" };
  }
  const mode = kind === "transcription" ? "transcribe" : kind;
  return { href: `/studio?mode=${mode}&model=${encodeURIComponent(id)}`, label: "Abrir en Studio" };
}

export function modelKindLabel(kind: ModelKind) {
  return {
    text: "Texto",
    image: "Imagen",
    video: "Video",
    speech: "Voz",
    transcription: "Transcripción",
    embeddings: "Vectores",
  }[kind];
}
