import Link from "next/link";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { MarketingPageHeader } from "@/components/layout/marketing-page-header";

export default function MediaDocsPage() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-3xl px-4 py-12 md:py-16">
        <p className="mb-3 text-sm text-zinc-500">
          <Link href="/docs" className="text-violet-700 hover:underline">
            Docs
          </Link>
          <span className="mx-2 text-zinc-300">/</span>
          Inferencia
        </p>
        <MarketingPageHeader title="Media, embeddings y reranking">
          Imagen, TTS, STT, embeddings, reranking y video jobs. Sin credenciales o tarifa operativa devuelve un error explícito;
          con provider/BYOK válido ejecuta upstream real y concilia el ledger. UI:{" "}
          <Link href="/studio" className="text-violet-700 hover:underline">
            Studio
          </Link>
          .
        </MarketingPageHeader>

        <section className="mb-8">
          <h2 className="mb-2 text-lg font-semibold text-zinc-900">
            Images
          </h2>
          <pre className="overflow-x-auto border border-zinc-200 bg-white p-4 text-sm text-zinc-800">
{`curl $NEXUS_URL/api/v1/images/generations \\
  -H "Authorization: Bearer $NEXUS_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "openai/gpt-image-2",
    "prompt": "amber mesh over dark terminal",
    "size": "1024x1024",
    "quality": "medium",
    "n": 1
  }'`}
          </pre>
        </section>

        <section className="mb-8">
          <h2 className="mb-2 text-lg font-semibold text-zinc-900">
            TTS / STT
          </h2>
          <pre className="overflow-x-auto border border-zinc-200 bg-white p-4 text-sm text-zinc-800">
{`# TTS → audio/mp3
curl $NEXUS_URL/api/v1/audio/speech \\
  -H "Authorization: Bearer $NEXUS_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"openai/gpt-4o-mini-tts","voice":"alloy","input":"Nexus gateway"}' \\
  --output speech.mp3

# STT multipart
curl $NEXUS_URL/api/v1/audio/transcriptions \\
  -H "Authorization: Bearer $NEXUS_API_KEY" \\
  -F model=openai/gpt-4o-mini-transcribe \\
  -F file=@speech.mp3`}
          </pre>
        </section>

        <section className="mb-8">
          <h2 className="mb-2 text-lg font-semibold text-zinc-900">
            Embeddings
          </h2>
          <p className="mb-3 text-sm leading-6 text-zinc-600">
            Selecciona cualquier modelo de embeddings ejecutable del catálogo y enruta entre proveedores
            verificados por precio, orden, privacidad y salud. Admite fallback, BYOK, dimensiones del proveedor
            y salida <code className="text-zinc-800">float</code> o <code className="text-zinc-800">base64</code>;
            el ledger liquida los tokens reportados por el proveedor.
          </p>
          <pre className="overflow-x-auto border border-zinc-200 bg-white p-4 text-sm text-zinc-800">
{`curl $NEXUS_URL/api/v1/embeddings \\
  -H "Authorization: Bearer $NEXUS_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "openai/text-embedding-3-small",
    "input": "gateway multi-proveedor",
    "dimensions": 512,
    "provider": { "sort": "price", "allow_fallbacks": true }
  }'

# SDK
const e = await nexus.embeddings.create({
  model: "openai/text-embedding-3-small",
  input: "gateway OpenAI-compatible",
  dimensions: 512,
});`}
          </pre>
        </section>

        <section className="mb-8">
          <h2 className="mb-2 text-lg font-semibold text-zinc-900">
            Reranking
          </h2>
          <p className="mb-3 text-sm leading-6 text-zinc-600">
            Reordena candidatos para búsqueda semántica y RAG. El contrato público usa
            <code className="text-zinc-800"> top_n</code>; Nexus lo traduce al dialecto nativo de cada
            proveedor, valida índices, scores y consumo antes de liquidar, y nunca enruta a un host sin
            precio verificado.
          </p>
          <pre className="overflow-x-auto border border-zinc-200 bg-white p-4 text-sm text-zinc-800">
{`curl $NEXUS_URL/api/v1/rerank \\
  -H "Authorization: Bearer $NEXUS_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "nexus/rerank-fast",
    "query": "capital de Francia",
    "documents": ["Madrid", "París", "Roma"],
    "top_n": 2,
    "provider": { "sort": "price", "allow_fallbacks": true }
  }'

const ranking = await nexus.rerank.create({
  model: "nexus/rerank-fast",
  query: "capital de Francia",
  documents: ["Madrid", "París", "Roma"],
  top_n: 2,
});`}
          </pre>
        </section>

        <section className="mb-8">
          <h2 className="mb-2 text-lg font-semibold text-zinc-900">
            Video jobs
          </h2>
          <p className="mb-3 text-sm text-zinc-600">
            <code className="text-zinc-800">POST /api/v1/videos</code> crea job;{" "}
            <code className="text-zinc-800">GET /api/v1/videos?id=</code> poll hasta completed/failed.
            Ejecuta Fal/Replicate sólo con credenciales válidas; si no hay proveedor devuelve{" "}
            <code className="text-zinc-800">provider_unwired</code>. Además exige una tarifa minorista
            explícita en <code className="text-zinc-800">NEXUS_VIDEO_RETAIL_USD</code>; sin ella responde{" "}
            <code className="text-zinc-800">provider_unpriced</code> y no crea ni cobra un job.
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
          <li>
            Imagen valida modelo, calidad, tamaño y cantidad antes de reservar. TTS admite hasta 4096
            caracteres; STT mide la duración real y limita cada archivo a 25 MiB.
          </li>
          <li>Cada call deja generation en Activity / Analytics (mismo ledger que chat).</li>
          <li>
            Files para contexto de chat:{" "}
            <code className="text-zinc-800">POST /api/v1/files</code> (multipart hasta 8 MB) +{" "}
            <code className="text-zinc-800">file_ids</code> en completions.
          </li>
          <li>
            Recipe:{" "}
            <Link href="/apps/media-image" className="text-violet-700 hover:underline">
              media-image
            </Link>
            .
          </li>
        </ul>
      </div>
    </MarketingShell>
  );
}
