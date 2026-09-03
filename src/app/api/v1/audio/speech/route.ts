import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { resolveByokKey } from "@/lib/gateway/byok";
import { chargeAndRecordMedia, MEDIA_DEFAULT_USD } from "@/lib/gateway/media-billing";
import { synthesizeSpeech } from "@/lib/media/upstream";

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const body = await req.json();
    const text = String(body.input ?? body.text ?? "");
    if (!text) return jsonError(Object.assign(new Error("input required"), { status: 400 }));
    const model = String(body.model ?? "openai/tts");
    const apiKey = await resolveByokKey(auth.userId, "openai");
    const platform = Boolean(process.env.OPENAI_API_KEY?.trim());
    const isByok = Boolean(apiKey) && !platform;
    const started = Date.now();
    const live = await synthesizeSpeech({
      input: text,
      model: body.model,
      voice: body.voice,
      format: body.response_format,
      apiKey,
    });
    if (live && "error" in live) {
      return jsonError(Object.assign(new Error(String(live.error)), { status: live.status ?? 502 }));
    }
    const local = !(live && "buffer" in live && live.buffer);
    const charK = Math.max(1, text.length / 1000);
    const billed = await chargeAndRecordMedia({
      auth,
      headers: req.headers,
      modality: "speech",
      model,
      provider: local ? "local" : isByok ? "openai-byok" : "openai",
      local,
      isByok,
      usd: MEDIA_DEFAULT_USD.speech * charK,
      promptTokens: Math.ceil(text.length / 4),
      latencyMs: Date.now() - started,
    });
    if (live && "buffer" in live && live.buffer) {
      const bytes = new Uint8Array(live.buffer);
      return new Response(bytes, {
        headers: {
          "Content-Type": live.contentType || "audio/mpeg",
          "X-Nexus-TTS": model,
          "X-Request-Id": billed.id,
          "X-Nexus-Cost": String(billed.costMicros / 1_000_000),
        },
      });
    }
    const wav = minimalWav(text);
    return new Response(new Uint8Array(wav), {
      headers: {
        "Content-Type": "audio/wav",
        "X-Nexus-TTS": "nexus/tts-local",
        "X-Request-Id": billed.id,
        "X-Nexus-Cost": "0",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

function minimalWav(text: string) {
  const samples = new Int16Array(Math.max(8000, text.length * 40));
  for (let i = 0; i < samples.length; i++) {
    samples[i] = Math.sin(i / 12) * 2000;
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + samples.byteLength, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(16000, 24);
  header.writeUInt32LE(32000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(samples.byteLength, 40);
  return Buffer.concat([header, Buffer.from(samples.buffer)]);
}
