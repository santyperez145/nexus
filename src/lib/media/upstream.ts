/** Upstream OpenAI-compatible media (images, TTS, STT). */

function openaiKey(byok?: string) {
  return byok?.trim() || process.env.OPENAI_API_KEY?.trim();
}

export async function generateImage(opts: {
  prompt: string;
  model?: string;
  size?: string;
  n?: number;
  apiKey?: string;
}) {
  const key = openaiKey(opts.apiKey);
  if (!key) return null;
  const model = opts.model?.includes("/") ? opts.model.split("/").pop()! : (opts.model ?? "gpt-image-1");
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model.includes("dall-e") ? model : "gpt-image-1",
      prompt: opts.prompt,
      size: opts.size ?? "1024x1024",
      n: opts.n ?? 1,
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) return { error: await res.text(), status: res.status };
  return res.json();
}

export async function synthesizeSpeech(opts: {
  input: string;
  model?: string;
  voice?: string;
  format?: string;
  apiKey?: string;
}) {
  const key = openaiKey(opts.apiKey);
  if (!key) return null;
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: opts.model?.includes("tts") ? opts.model.split("/").pop() : "gpt-4o-mini-tts",
      input: opts.input,
      voice: opts.voice ?? "alloy",
      response_format: opts.format === "wav" ? "wav" : "mp3",
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) return { error: await res.text(), status: res.status };
  return {
    buffer: Buffer.from(await res.arrayBuffer()),
    contentType: res.headers.get("content-type") ?? "audio/mpeg",
  };
}

export async function transcribeAudio(
  file: Blob,
  filename: string,
  model?: string,
  apiKey?: string,
) {
  const key = openaiKey(apiKey);
  if (!key) return null;
  const form = new FormData();
  form.set("model", model?.includes("/") ? model.split("/").pop()! : "whisper-1");
  form.set("file", file, filename);
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) return { error: await res.text(), status: res.status };
  return res.json();
}

export async function startVideoJob(opts: { prompt: string; model?: string; falKey?: string; replicateToken?: string }) {
  const fal = opts.falKey?.trim() || process.env.FAL_KEY?.trim();
  if (fal) {
    const res = await fetch("https://fal.run/fal-ai/minimax/video-01", {
      method: "POST",
      headers: { Authorization: `Key ${fal}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: opts.prompt }),
      signal: AbortSignal.timeout(120000),
    });
    if (res.ok) return { provider: "fal", data: await res.json() };
    return { provider: "fal", error: await res.text(), status: res.status };
  }
  const replicate = opts.replicateToken?.trim() || process.env.REPLICATE_API_TOKEN?.trim();
  if (replicate) {
    const res = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: { Authorization: `Bearer ${replicate}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: opts.model ?? "minimax/video-01",
        input: { prompt: opts.prompt },
      }),
      signal: AbortSignal.timeout(120000),
    });
    if (res.ok) return { provider: "replicate", data: await res.json() };
    return { provider: "replicate", error: await res.text(), status: res.status };
  }
  return null;
}
