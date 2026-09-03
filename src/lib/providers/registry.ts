export type NexusProvider = {
  id: string;
  label: string;
  env: string;
  extraEnv?: string[];
  kind: "openai" | "anthropic" | "google" | "mistral";
  baseURL: string;
  modelsPath: string;
  auth: "bearer" | "anthropic" | "google-query";
  zdr?: boolean;
};

/**
 * Inference hosts. Same idea as OpenRouter's provider layer:
 * one model slug can land on several of these.
 */
export const NEXUS_PROVIDERS: NexusProvider[] = [
  {
    id: "openai",
    label: "OpenAI",
    env: "OPENAI_API_KEY",
    kind: "openai",
    baseURL: "https://api.openai.com/v1",
    modelsPath: "/models",
    auth: "bearer",
    zdr: true,
  },
  {
    id: "anthropic",
    label: "Anthropic",
    env: "ANTHROPIC_API_KEY",
    kind: "anthropic",
    baseURL: "https://api.anthropic.com/v1",
    modelsPath: "/models",
    auth: "anthropic",
    zdr: true,
  },
  {
    id: "google",
    label: "Google",
    env: "GOOGLE_GENERATIVE_AI_API_KEY",
    extraEnv: ["GOOGLE_API_KEY"],
    kind: "google",
    baseURL: "https://generativelanguage.googleapis.com/v1beta",
    modelsPath: "/models",
    auth: "google-query",
    zdr: true,
  },
  {
    id: "mistral",
    label: "Mistral",
    env: "MISTRAL_API_KEY",
    kind: "mistral",
    baseURL: "https://api.mistral.ai/v1",
    modelsPath: "/models",
    auth: "bearer",
  },
  {
    id: "groq",
    label: "Groq",
    env: "GROQ_API_KEY",
    kind: "openai",
    baseURL: "https://api.groq.com/openai/v1",
    modelsPath: "/models",
    auth: "bearer",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    env: "DEEPSEEK_API_KEY",
    kind: "openai",
    baseURL: "https://api.deepseek.com",
    modelsPath: "/models",
    auth: "bearer",
  },
  {
    id: "xai",
    label: "xAI",
    env: "XAI_API_KEY",
    kind: "openai",
    baseURL: "https://api.x.ai/v1",
    modelsPath: "/models",
    auth: "bearer",
  },
  {
    id: "perplexity",
    label: "Perplexity",
    env: "PERPLEXITY_API_KEY",
    kind: "openai",
    baseURL: "https://api.perplexity.ai",
    modelsPath: "/models",
    auth: "bearer",
  },
  {
    id: "together",
    label: "Together",
    env: "TOGETHER_API_KEY",
    kind: "openai",
    baseURL: "https://api.together.xyz/v1",
    modelsPath: "/models",
    auth: "bearer",
  },
  {
    id: "fireworks",
    label: "Fireworks",
    env: "FIREWORKS_API_KEY",
    kind: "openai",
    baseURL: "https://api.fireworks.ai/inference/v1",
    modelsPath: "/models",
    auth: "bearer",
  },
  {
    id: "cerebras",
    label: "Cerebras",
    env: "CEREBRAS_API_KEY",
    kind: "openai",
    baseURL: "https://api.cerebras.ai/v1",
    modelsPath: "/models",
    auth: "bearer",
  },
  {
    id: "sambanova",
    label: "SambaNova",
    env: "SAMBANOVA_API_KEY",
    kind: "openai",
    baseURL: "https://api.sambanova.ai/v1",
    modelsPath: "/models",
    auth: "bearer",
  },
  {
    id: "hyperbolic",
    label: "Hyperbolic",
    env: "HYPERBOLIC_API_KEY",
    kind: "openai",
    baseURL: "https://api.hyperbolic.xyz/v1",
    modelsPath: "/models",
    auth: "bearer",
  },
  {
    id: "deepinfra",
    label: "DeepInfra",
    env: "DEEPINFRA_API_KEY",
    kind: "openai",
    baseURL: "https://api.deepinfra.com/v1/openai",
    modelsPath: "/models",
    auth: "bearer",
  },
  {
    id: "novita",
    label: "Novita",
    env: "NOVITA_API_KEY",
    kind: "openai",
    baseURL: "https://api.novita.ai/v3/openai",
    modelsPath: "/models",
    auth: "bearer",
  },
  {
    id: "nebius",
    label: "Nebius",
    env: "NEBIUS_API_KEY",
    kind: "openai",
    baseURL: "https://api.studio.nebius.com/v1",
    modelsPath: "/models",
    auth: "bearer",
  },
  {
    id: "compat",
    label: "OpenAI-compat extra",
    env: "OPENAI_COMPAT_API_KEY",
    kind: "openai",
    baseURL: "https://api.openai.com/v1",
    modelsPath: "/models",
    auth: "bearer",
  },
  {
    id: "azure",
    label: "Azure OpenAI",
    env: "AZURE_OPENAI_API_KEY",
    kind: "openai",
    baseURL: "https://api.openai.com/v1",
    modelsPath: "/models",
    auth: "bearer",
    zdr: true,
  },
  {
    id: "amazon",
    label: "Amazon Bedrock",
    env: "AWS_BEARER_TOKEN_BEDROCK",
    extraEnv: ["AMAZON_BEDROCK_API_KEY"],
    kind: "openai",
    baseURL: "https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1",
    modelsPath: "/models",
    auth: "bearer",
    zdr: true,
  },
  {
    id: "google-vertex",
    label: "Google Vertex",
    env: "GOOGLE_VERTEX_API_KEY",
    extraEnv: ["GOOGLE_GENERATIVE_AI_API_KEY", "GOOGLE_API_KEY"],
    kind: "openai",
    baseURL: "https://aiplatform.googleapis.com/v1",
    modelsPath: "/models",
    auth: "bearer",
    zdr: true,
  },
  {
    id: "lambda",
    label: "Lambda",
    env: "LAMBDA_API_KEY",
    kind: "openai",
    baseURL: "https://api.lambda.ai/v1",
    modelsPath: "/models",
    auth: "bearer",
  },
  {
    id: "siliconflow",
    label: "SiliconFlow",
    env: "SILICONFLOW_API_KEY",
    kind: "openai",
    baseURL: "https://api.siliconflow.cn/v1",
    modelsPath: "/models",
    auth: "bearer",
  },
  {
    id: "friendli",
    label: "Friendli",
    env: "FRIENDLI_TOKEN",
    extraEnv: ["FRIENDLI_API_KEY"],
    kind: "openai",
    baseURL: "https://api.friendli.ai/serverless/v1",
    modelsPath: "/models",
    auth: "bearer",
  },
  {
    id: "replicate",
    label: "Replicate",
    env: "REPLICATE_API_TOKEN",
    kind: "openai",
    baseURL: "https://openai-proxy.replicate.com/v1",
    modelsPath: "/models",
    auth: "bearer",
  },
  {
    id: "cohere",
    label: "Cohere",
    env: "COHERE_API_KEY",
    kind: "openai",
    baseURL: "https://api.cohere.ai/compatibility/v1",
    modelsPath: "/models",
    auth: "bearer",
  },
  {
    id: "nvidia",
    label: "NVIDIA NIM",
    env: "NVIDIA_API_KEY",
    kind: "openai",
    baseURL: "https://integrate.api.nvidia.com/v1",
    modelsPath: "/models",
    auth: "bearer",
  },
  {
    id: "moonshot",
    label: "Moonshot",
    env: "MOONSHOT_API_KEY",
    kind: "openai",
    baseURL: "https://api.moonshot.ai/v1",
    modelsPath: "/models",
    auth: "bearer",
  },
  {
    id: "qwen",
    label: "Alibaba Qwen",
    env: "DASHSCOPE_API_KEY",
    kind: "openai",
    baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    modelsPath: "/models",
    auth: "bearer",
  },
  {
    id: "minimax",
    label: "MiniMax",
    env: "MINIMAX_API_KEY",
    kind: "openai",
    baseURL: "https://api.minimax.io/v1",
    modelsPath: "/models",
    auth: "bearer",
  },
  {
    id: "ai21",
    label: "AI21",
    env: "AI21_API_KEY",
    kind: "openai",
    baseURL: "https://api.ai21.com/studio/v1",
    modelsPath: "/models",
    auth: "bearer",
  },
  {
    id: "z-ai",
    label: "Z.AI",
    env: "ZAI_API_KEY",
    extraEnv: ["Z_AI_API_KEY"],
    kind: "openai",
    baseURL: "https://api.z.ai/api/paas/v4",
    modelsPath: "/models",
    auth: "bearer",
  },
  {
    id: "huggingface",
    label: "Hugging Face",
    env: "HF_TOKEN",
    extraEnv: ["HUGGINGFACE_API_KEY", "HUGGING_FACE_HUB_TOKEN"],
    kind: "openai",
    baseURL: "https://router.huggingface.co/v1",
    modelsPath: "/models",
    auth: "bearer",
  },
  {
    id: "cloudflare",
    label: "Cloudflare AI",
    env: "CLOUDFLARE_API_TOKEN",
    kind: "openai",
    baseURL: "https://api.cloudflare.com/client/v4/accounts/invalid/ai/v1",
    modelsPath: "/models",
    auth: "bearer",
  },
];

export function providerById(id: string) {
  if (id === "openai-compatible") return NEXUS_PROVIDERS.find((p) => p.id === "compat");
  return NEXUS_PROVIDERS.find((p) => p.id === id);
}

export function envFor(p: NexusProvider) {
  const primary = process.env[p.env];
  if (primary?.trim()) return primary;
  for (const extra of p.extraEnv ?? []) {
    const v = process.env[extra];
    if (v?.trim()) return v;
  }
  return undefined;
}

export function authHeaders(p: NexusProvider, key: string): Record<string, string> {
  if (p.auth === "anthropic") {
    return { "x-api-key": key, "anthropic-version": "2023-06-01" };
  }
  if (p.auth === "google-query") return {};
  return { Authorization: `Bearer ${key}` };
}

export function liveBaseURL(p: NexusProvider) {
  if (p.id === "compat") {
    return process.env.OPENAI_COMPAT_BASE_URL?.replace(/\/$/, "") || p.baseURL;
  }
  if (p.id === "azure") {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT?.replace(/\/$/, "");
    return endpoint ? `${endpoint}/openai/v1` : p.baseURL;
  }
  if (p.id === "amazon") {
    const region = process.env.AWS_REGION?.trim() || "us-east-1";
    return `https://bedrock-runtime.${region}.amazonaws.com/openai/v1`;
  }
  if (p.id === "google-vertex") {
    const project = process.env.GOOGLE_VERTEX_PROJECT?.trim();
    const location = process.env.GOOGLE_VERTEX_LOCATION?.trim() || "us-central1";
    if (!project) return p.baseURL;
    return `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/endpoints/openapi`;
  }
  if (p.id === "cloudflare") {
    const account = process.env.CLOUDFLARE_ACCOUNT_ID;
    if (!account) return p.baseURL;
    return `https://api.cloudflare.com/client/v4/accounts/${account}/ai/v1`;
  }
  return p.baseURL;
}

export function modelsUrl(p: NexusProvider, key: string) {
  const path = `${liveBaseURL(p)}${p.modelsPath}`;
  if (p.auth === "google-query") {
    const joiner = path.includes("?") ? "&" : "?";
    return `${path}${joiner}key=${key}`;
  }
  return path;
}

export function isWired(p: NexusProvider) {
  if (!envFor(p)) return false;
  if (p.id === "cloudflare" && !process.env.CLOUDFLARE_ACCOUNT_ID?.trim()) return false;
  if (p.id === "azure" && !process.env.AZURE_OPENAI_ENDPOINT?.trim()) return false;
  if (p.id === "google-vertex" && !process.env.GOOGLE_VERTEX_PROJECT?.trim()) return false;
  if (p.id === "compat" && !process.env.OPENAI_COMPAT_BASE_URL?.trim()) return false;
  return true;
}

export function wiredProviders() {
  return NEXUS_PROVIDERS.filter(isWired);
}
