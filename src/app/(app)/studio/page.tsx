import { AppPageHeader } from "@/components/layout/app-page-header";
import { MediaStudio } from "@/components/media/media-studio";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const MODES = new Set(["image", "speech", "transcribe", "video", "embeddings", "rerank"]);

export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; model?: string }>;
}) {
  const query = await searchParams;
  const initialTab = MODES.has(query.mode ?? "")
    ? (query.mode as "image" | "speech" | "transcribe" | "video" | "embeddings" | "rerank")
    : "image";
  return (
    <div>
      <AppPageHeader
        title="Estudio de inferencia"
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href="/chat">Abrir chat</Link>
          </Button>
        }
      >
        Probá imagen, voz, audio, video, vectores y reranking desde un único espacio con costos y trazabilidad reales.
      </AppPageHeader>
      <MediaStudio initialTab={initialTab} initialModel={query.model} />
    </div>
  );
}
