import { AppPageHeader } from "@/components/layout/app-page-header";
import { MediaStudio } from "@/components/media/media-studio";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const MODES = new Set(["image", "speech", "transcribe", "video", "embeddings"]);

export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; model?: string }>;
}) {
  const query = await searchParams;
  const initialTab = MODES.has(query.mode ?? "")
    ? (query.mode as "image" | "speech" | "transcribe" | "video" | "embeddings")
    : "image";
  return (
    <div>
      <AppPageHeader
        title="Estudio multimedia"
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href="/chat">Abrir chat</Link>
          </Button>
        }
      >
        Creá imágenes, voz, audio y video desde el mismo espacio, con tu saldo y tus límites de uso.
      </AppPageHeader>
      <MediaStudio initialTab={initialTab} initialModel={query.model} />
    </div>
  );
}
