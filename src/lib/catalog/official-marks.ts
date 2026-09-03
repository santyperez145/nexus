export type OfficialModelAuthorMark = {
  src: string;
  sourceUrl: string;
};

const github = (asset: string, account: string): OfficialModelAuthorMark => ({
  src: `/model-providers/${asset}`,
  sourceUrl: `https://github.com/${account}`,
});

const MARKS: Record<string, OfficialModelAuthorMark> = {
  "aion-labs": github("aion-labs.png", "aion-labs"),
  ai21: github("ai21.png", "AI21Labs"),
  amazon: github("amazon.jpg", "amazon"),
  "anthracite-org": github("anthracite-org.png", "anthracite-org"),
  anthropic: github("anthropic.png", "anthropics"),
  "arcee-ai": github("arcee-ai.png", "arcee-ai"),
  baidu: github("baidu.png", "baidu"),
  bytedance: github("bytedance.png", "bytedance"),
  "bytedance-seed": github("bytedance.png", "bytedance"),
  cognitivecomputations: github("cognitivecomputations.png", "cognitivecomputations"),
  cohere: github("cohere.png", "cohere-ai"),
  deepseek: github("deepseek.png", "deepseek-ai"),
  "dots-studio": github("dots-studio.png", "dots-studio"),
  google: github("google.png", "google"),
  gryphe: github("gryphe.png", "Gryphe"),
  groq: github("groq.png", "groq"),
  "ibm-granite": github("ibm-granite.png", "ibm-granite"),
  inception: {
    src: "/model-providers/inception.png",
    sourceUrl: "https://www.inceptionlabs.ai/",
  },
  inclusionai: github("inclusionai.jpg", "inclusionAI"),
  kwaipilot: github("kwaipilot.png", "Kwaipilot"),
  liquid: github("liquid.png", "Liquid4All"),
  mancer: github("mancer.png", "mancer"),
  meituan: github("meituan.jpg", "meituan"),
  meta: github("meta.png", "meta-llama"),
  "meta-llama": github("meta.png", "meta-llama"),
  microsoft: github("microsoft.png", "microsoft"),
  minimax: github("minimax.jpg", "MiniMax-AI"),
  mistralai: github("mistralai.png", "mistralai"),
  moonshotai: github("moonshotai.jpg", "MoonshotAI"),
  morph: github("morph.png", "morph-labs"),
  "nex-agi": github("nex-agi.jpg", "nex-agi"),
  nousresearch: github("nousresearch.png", "NousResearch"),
  nvidia: github("nvidia.png", "NVIDIA"),
  nexus: {
    src: "/brand/mark.png",
    sourceUrl: "/brand/mark.svg",
  },
  openai: github("openai.png", "openai"),
  openrouter: github("openrouter.jpg", "OpenRouterTeam"),
  perceptron: github("perceptron.png", "perceptron-ai"),
  perplexity: github("perplexity.png", "perplexityai"),
  poolside: github("poolside.png", "poolside-ai"),
  qwen: github("qwen.png", "QwenLM"),
  rekaai: github("rekaai.jpg", "reka-ai"),
  relace: github("relace.jpg", "relace-ai"),
  sakana: github("sakana.png", "SakanaAI"),
  sao10k: github("sao10k.png", "Sao10K"),
  stepfun: github("stepfun.png", "stepfun-ai"),
  tencent: github("tencent.png", "Tencent"),
  thedrummer: github("thedrummer.png", "TheDrummer"),
  thinkingmachines: github("thinkingmachines.png", "thinking-machines-lab"),
  undi95: github("undi95.jpg", "Undi95"),
  upstage: github("upstage.png", "UpstageAI"),
  writer: github("writer.png", "Writer"),
  "x-ai": github("x-ai.png", "xai-org"),
  xiaomi: github("xiaomi.png", "XiaoMi"),
  "z-ai": github("z-ai.png", "ZhipuAI"),
};

export function officialMarkFor(author?: string | null): OfficialModelAuthorMark | null {
  if (!author) return null;
  return MARKS[author.replace(/^~/, "").toLowerCase()] ?? null;
}

export function authorsWithOfficialMarks() {
  return Object.keys(MARKS);
}
