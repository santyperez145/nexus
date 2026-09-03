import { AppPageHeader } from "@/components/layout/app-page-header";
import { MediaStudio } from "@/components/media/media-studio";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function StudioPage() {
  return (
    <div>
      <AppPageHeader
        title="Studio"
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href="/chat">Chat texto</Link>
          </Button>
        }
      >
        Imagen, audio, video y embeddings en una superficie — misma wallet y ledger que el chat. Sin keys de
        lab responde en local (SVG / WAV / eco).
      </AppPageHeader>
      <MediaStudio />
    </div>
  );
}
