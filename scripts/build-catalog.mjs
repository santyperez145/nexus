/**
 * Builds the bundled Nexus catalog + SDK ModelId union from a public
 * market models list (author/slug + list prices). Curated multi-host
 * overlays in owned.ts still win at runtime.
 *
 * Usage: node scripts/build-catalog.mjs [path-to-market.json]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const input =
  process.argv[2] ??
  "C:/Users/santiago/.cursor/projects/c-Users-santiago-Projects-nexus/agent-tools/0eaf8a8a-c9f9-4905-886d-006bd04c0d4c.txt";

const AUTHOR_ADAPTER = {
  openai: "openai",
  anthropic: "anthropic",
  google: "google",
  mistralai: "mistral",
  groq: "groq",
  deepseek: "deepseek",
  "x-ai": "xai",
  perplexity: "perplexity",
  together: "together",
  fireworks: "fireworks",
  cerebras: "cerebras",
  sambanova: "sambanova",
  hyperbolic: "hyperbolic",
  deepinfra: "deepinfra",
  novita: "novita",
  nebius: "nebius",
  azure: "azure",
  amazon: "amazon",
  cohere: "cohere",
  nvidia: "nvidia",
  moonshotai: "moonshot",
  qwen: "qwen",
  minimax: "minimax",
  ai21: "ai21",
  "z-ai": "z-ai",
  "meta-llama": "together",
  meta: "together",
  huggingface: "huggingface",
};

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function adapterFor(id) {
  const author = id.split("/")[0] ?? "together";
  return AUTHOR_ADAPTER[author] ?? "together";
}

function providerModel(id, adapter) {
  const slug = id.split(":").at(0) ?? id;
  if (["together", "fireworks", "deepinfra", "novita", "nebius", "huggingface"].includes(adapter)) {
    return slug;
  }
  return slug.split("/").slice(1).join("/") || slug;
}

const raw = readFileSync(input, "utf8");
const json = JSON.parse(raw.slice(raw.indexOf("{")));
if (!Array.isArray(json.data)) throw new Error("expected { data: Model[] }");

const RENAME = {
  "openrouter/auto-beta": "nexus/auto-beta",
  "openrouter/fusion": "nexus/fusion",
  "openrouter/pareto-code": "nexus/pareto-code",
  "openrouter/bodybuilder": "nexus/bodybuilder",
};

const models = [];
const ids = [];
for (const m of json.data) {
  const originalId = String(m.id ?? "");
  if (!originalId) continue;
  if (originalId === "openrouter/auto" || originalId === "openrouter/free") continue;
  const id = RENAME[originalId] ?? originalId;
  const isRouter = id.startsWith("nexus/");
  const adapter = isRouter ? "nexus" : adapterFor(originalId);
  const prompt = num(m.pricing?.prompt);
  const completion = num(m.pricing?.completion);
  const inputMods = m.architecture?.input_modalities ?? ["text"];
  const outputMods = m.architecture?.output_modalities ?? ["text"];
  const name = String(m.name ?? originalId).replace(/^(OpenAI|Anthropic|Google|Meta|Mistral|xAI|Qwen|DeepSeek):\s*/i, "");
  models.push({
    id,
    name,
    description: `${name}. ${m.architecture?.modality ?? "text->text"}. Contexto ${(m.context_length ?? 128000).toLocaleString("en-US")} tokens.`,
    author: originalId.split("/")[0] ?? adapter,
    created: Number(m.created) || 1_725_000_000,
    contextLength: Number(m.context_length) || 128000,
    architecture: {
      modality: m.architecture?.modality ?? "text->text",
      inputModalities: inputMods,
      outputModalities: outputMods,
      tokenizer: m.architecture?.tokenizer ?? "Unknown",
    },
    pricing: {
      prompt,
      completion,
      request: num(m.pricing?.request),
      image: num(m.pricing?.image),
      webSearch: num(m.pricing?.web_search),
      inputCacheRead: num(m.pricing?.input_cache_read),
      inputCacheWrite: num(m.pricing?.input_cache_write),
    },
    topProvider: {
      contextLength: Number(m.top_provider?.context_length ?? m.context_length) || 128000,
      maxCompletionTokens: Number(m.top_provider?.max_completion_tokens) || 8192,
      isModerated: Boolean(m.top_provider?.is_moderated),
    },
    supportedParameters: Array.isArray(m.supported_parameters) ? m.supported_parameters : ["temperature", "max_tokens", "stream"],
    knowledgeCutoff: m.knowledge_cutoff ?? null,
    huggingFaceId: m.hugging_face_id ?? null,
    canonicalSlug: isRouter ? id : (m.canonical_slug ?? originalId),
    free: prompt === 0 && completion === 0,
    endpoints: isRouter
      ? []
      : [
          {
            name: adapter,
            adapter,
            providerModel: providerModel(originalId, adapter),
            pricing: { prompt, completion },
            latencyMs: 400,
            throughputTps: 90,
            zdr: Boolean(m.top_provider?.is_moderated),
            uptime: 0.99,
            quantization: "fp8",
          },
        ],
  });
  ids.push(id);
}

ids.push("nexus/auto", "nexus/free");
ids.sort();

const catalogDir = join(root, "src", "lib", "catalog");
const sdkDir = join(root, "packages", "sdk", "src");
mkdirSync(catalogDir, { recursive: true });
mkdirSync(sdkDir, { recursive: true });
writeFileSync(join(catalogDir, "full.json"), JSON.stringify(models));
writeFileSync(
  join(sdkDir, "model-ids.ts"),
  `/** Autogenerated by scripts/build-catalog.mjs — ${ids.length} slugs. */\nexport const NEXUS_MODEL_IDS = ${JSON.stringify(ids, null, 2)} as const;\n\nexport type NexusModelId = (typeof NEXUS_MODEL_IDS)[number] | (string & {});\n`,
);

console.log(`wrote ${models.length} models + ${ids.length} sdk ids`);
