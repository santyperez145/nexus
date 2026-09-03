import Link from "next/link";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { MarketingPageHeader } from "@/components/layout/marketing-page-header";

export default function MediaDocsPage() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-3xl px-4 py-12 md:py-16">
        <p className="mb-3 text-sm text-zinc-500">
          <Link href="/docs" className="text-amber-700 hover:underline">
            Docs
          </Link>
          <span className="mx-2 text-zinc-300">/</span>
          Media
        </p>
        <MarketingPageHeader title="Media">
          Imagen, TTS, STT, embeddings y video jobs. Sin key de lab → placeholder/eco local con
          ledger; con OPENAI/BYOK → upstream real. UI:{" "}
          <Link href="/studio" className="text-amber-700 hover:underline">
            Studio
          </Link>
          .
        </MarketingPageHeader>

        <section className="mb-8">
          <h2 className="mb-2 font-[family-name:var(--font-syne)] text-lg font-semibold text-zinc-900">
            Images
          </h2>
          <pre className="overflow-x-auto border border-zinc-200 bg-white p-4 text-sm text-zinc-800">
{`curl $NEXUS_URL/api/v1/images/generations \\
  -H "Authorization: Bearer $NEXUS_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "openai/gpt-image-1",
    "prompt": "amber mesh over dark terminal",
    "size": "1024x1024",
    "n": 1
  }'`}
          </pre>
        </section>

        <section className="mb-8">
          <h2 className="mb-2 font-[family-name:var(--font-syne)] text-lg font-semibold text-zinc-900">
            TTS / STT
          </h2>
          <pre className="overflow-x-auto border border-zinc-200 bg-white p-4 text-sm text-zinc-800">
{`# TTS → audio/wav
curl $NEXUS_URL/api/v1/audio/speech \\
  -H "Authorization: Bearer $NEXUS_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"openai/tts-1","voice":"alloy","input":"Nexus gateway"}' \\
  --output speech.wav

# STT multipart
curl $NEXUS_URL/api/v1/audio/transcriptions \\
  -H "Authorization: Bearer $NEXUS_API_KEY" \\
  -F model=openai/whisper-1 \\
  -F file=@speech.wav`}
          </pre>
        </section>

        <section className="mb-8">
          <h2 className="mb-2 font-[family-name:var(--font-syne)] text-lg font-semibold text-zinc-900">
            Embeddings
          </h2>
          <pre className="overflow-x-auto border border-zinc-200 bg-white p-4 text-sm text-zinc-800">
{`curl $NEXUS_URL/api/v1/embeddings \\
  -H "Authorization: Bearer $NEXUS_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "openai/text-embedding-3-small",
    "input": "gateway OpenAI-compatible"
  }'

# SDK
const e = await nexus.embeddings.create({
  model: "openai/text-embedding-3-small",
  input: "gateway OpenAI-compatible",
});`}
          </pre>
        </section>

        <section className="mb-8">
          <h2 className="mb-2 font-[family-name:var(--font-syne)] text-lg font-semibold text-zinc-900">
            Video jobs
          </h2>
          <p className="mb-3 text-sm text-zinc-600">
            <code className="text-zinc-800">POST /api/v1/videos</code> crea job;{" "}
            <code className="text-zinc-800">GET /api/v1/videos?id=</code> poll hasta completed/failed.
            Upstream Fal/Replicate cuando hay keys; si no, job local simulado.
          </p>
          <pre className="overflow-x-auto border border-zinc-200 bg-white p-4 text-sm text-zinc-800">
{`JOB=$(curl -s $NEXUS_URL/api/v1/videos \\
  -H "Authorization: Bearer $NEXUS_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"prompt":"camera orbit over amber mesh"}' | jq -r .id)

curl "$NEXUS_URL/api/v1/videos?id=$JOB" \\
  -H "Authorization: Bearer $NEXUS_API_KEY"`}
          </pre>
        </section>

        <ul className="list-disc space-y-2 pl-5 text-sm text-zinc-600">
          <li>Cada call deja generation en Activity / Analytics (mismo ledger que chat).</li>
          <li>
            Files para contexto de chat:{" "}
            <code className="text-zinc-800">POST /api/v1/files</code> (max 8MB) +{" "}
            <code className="text-zinc-800">file_ids</code> en completions.
          </li>
          <li>
            Recipe:{" "}
            <Link href="/apps/media-image" className="text-amber-700 hover:underline">
              media-image
            </Link>
            .
          </li>
        </ul>
      </div>
    </MarketingShell>
  );
}
