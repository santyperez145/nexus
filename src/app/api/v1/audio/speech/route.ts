import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { synthesizeSpeech } from "@/lib/media/upstream";

export async function POST(req: Request) {
  try {
    await authenticateRequest(req);
    const body = await req.json();
    const text = String(body.input ?? body.text ?? "");
    if (!text) return jsonError(Object.assign(new Error("input required"), { status: 400 }));
    const live = await synthesizeSpeech({
      input: text,
      model: body.model,
      voice: body.voice,
      format: body.response_format,
    });
    if (live && "buffer" in live && live.buffer) {
      const bytes = new Uint8Array(live.buffer);
      return new Response(bytes, {
        headers: {
          "Content-Type": live.contentType || "audio/mpeg",
          "X-Nexus-TTS": String(body.model ?? "openai/tts"),
        },
      });
    }
    if (live && "error" in live) {
      return jsonError(Object.assign(new Error(String(live.error)), { status: live.status ?? 502 }));
    }
    const wav = minimalWav(text);
    return new Response(new Uint8Array(wav), {
      headers: {
        "Content-Type": "audio/wav",
        "X-Nexus-TTS": "nexus/tts-local",
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
