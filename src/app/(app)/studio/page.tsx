import { AppPageHeader } from "@/components/layout/app-page-header";
import { MediaStudio } from "@/components/media/media-studio";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function StudioPage() {
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
      <MediaStudio />
    </div>
  );
}
