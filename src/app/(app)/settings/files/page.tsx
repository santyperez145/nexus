"use client";

import { AppPageHeader } from "@/components/layout/app-page-header";
import { useCallback, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { useRemoteData } from "@/lib/use-remote-data";
import { uploadNexusFile } from "@/lib/files/browser-upload";

type FileRow = {
  id: string;
  filename: string;
  bytes: number;
  mime?: string;
  status: string;
  storage_backend: string;
  sha256?: string | null;
};
type FilesMeta = {
  storage: {
    used_bytes: number;
    quota_bytes: number;
    available_bytes: number;
    direct_upload: boolean;
    inline_max_bytes: number;
    direct_max_bytes: number;
  };
};

function isImage(mime?: string, filename?: string) {
  return Boolean(
    (mime && /^image\//i.test(mime)) ||
    (filename && /\.(png|jpe?g|gif|webp|bmp)$/i.test(filename)),
  );
}

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}

export default function FilesPage() {
  const [rows, reload, , meta] = useRemoteData<FileRow[], FilesMeta>("/api/v1/files");
  const [msg, setMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    id: string;
    text: string;
    filename: string;
  } | null>(null);
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const list = rows ?? [];
  const images = list.filter((f) => isImage(f.mime, f.filename)).length;

  const uploadMany = useCallback(
    async (files: FileList | File[]) => {
      const batch = [...files];
      if (!batch.length) return;
      let ok = 0;
      for (let i = 0; i < batch.length; i++) {
        try {
          await uploadNexusFile(batch[i], {
            onProgress: (value) =>
              setProgress(`${i + 1}/${batch.length} · ${Math.round(value * 100)}%`),
          });
          ok += 1;
        } catch (error) {
          setMsg(error instanceof Error ? error.message : "No se pudo subir el archivo");
        }
      }
      setProgress(null);
      setMsg(`Subidos ${ok}/${batch.length}`);
      reload();
    },
    [reload],
  );

  async function showPreview(id: string, filename: string) {
    const res = await fetch(`/api/v1/files?id=${id}`);
    const json = await res.json();
    setPreview({
      id,
      filename,
      text: json.data?.preview ?? "(sin preview)",
    });
  }

  return (
    <div>
      <AppPageHeader
        title="Archivos"
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href="/chat">Usar en chat</Link>
          </Button>
        }
      >
        Nexus extrae el contenido de textos y PDF; las imágenes se adjuntan como
        entrada visual para modelos compatibles. Los artefactos grandes usan carga directa
        S3-compatible con SHA-256, hasta 5 GiB por archivo según plan.
      </AppPageHeader>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
          <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-600">
            Archivos
          </div>
          <div className="mt-1 font-mono text-lg text-zinc-700">
            {list.length}
          </div>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
          <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-600">
            Imágenes
          </div>
          <div className="mt-1 font-mono text-lg text-zinc-800">{images}</div>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
          <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-600">Storage</div>
          <div className="mt-1 text-xs leading-relaxed text-zinc-500">
            {meta ? `${fmtBytes(meta.storage.used_bytes)} / ${fmtBytes(meta.storage.quota_bytes)} · ${meta.storage.direct_upload ? "S3 directo" : "local 8 MB"}` : "Calculando cuota…"}
          </div>
        </div>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (e.dataTransfer.files?.length)
            void uploadMany(e.dataTransfer.files);
        }}
        className={`mb-4 rounded-2xl border border-dashed px-4 py-10 text-center transition-colors ${
          drag ? "border-violet-300 bg-violet-50" : "border-zinc-200 bg-white"
        }`}
      >
        <p className="text-sm text-zinc-400">
          Arrastrá uno o varios archivos acá
        </p>
        <p className="mt-1 text-xs text-zinc-600">
          Safetensors · GGUF · Parquet · PDF · texto · código · imágenes
        </p>
        <label className="mt-3 inline-block cursor-pointer text-sm text-violet-700 hover:underline">
          o elegí desde el disco
          <input
            type="file"
            multiple
            className="hidden"
            aria-label="Subir archivos"
            onChange={(e) => {
              if (e.target.files?.length) void uploadMany(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        {progress ? (
          <p className="mt-2 font-mono text-xs text-zinc-500">
            Subiendo {progress}
          </p>
        ) : null}
      </div>

      {msg ? <p className="mb-4 text-sm text-zinc-950">{msg}</p> : null}

      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-200 px-4 py-10 text-center">
          <p className="text-sm text-zinc-400">Todavía no hay archivos.</p>
          <Button asChild size="sm" variant="outline" className="mt-4">
            <Link href="/chat">Abrir Chat con visión</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-2">
          {list.map((f) => {
            const img = isImage(f.mime, f.filename);
            return (
              <div
                key={f.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 px-3 py-2.5 text-sm"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium text-zinc-800">
                      {f.filename}
                    </span>
                    {img ? (
                      <span className="rounded border border-violet-200 bg-violet-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-950">
                        vision
                      </span>
                    ) : null}
                    <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${f.status === "ready" ? "bg-emerald-50 text-emerald-700" : f.status === "pending" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>
                      {f.status}
                    </span>
                    <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] uppercase text-zinc-600">
                      {f.storage_backend}
                    </span>
                  </div>
                  <div className="font-mono text-[11px] text-zinc-600">
                    {f.id} · {fmtBytes(f.bytes)} · {f.mime ?? "—"}
                  </div>
                  {f.sha256 ? <div className="max-w-xl truncate font-mono text-[10px] text-zinc-400">sha256:{f.sha256}</div> : null}
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void showPreview(f.id, f.filename)}
                  >
                    Preview
                  </Button>
                  <Button asChild size="sm" variant="ghost">
                    <Link href="/chat">Chat</Link>
                  </Button>
                  {f.status === "ready" ? <Button asChild size="sm" variant="ghost"><Link href={`/api/v1/files/${encodeURIComponent(f.id)}/content`}>Descargar</Link></Button> : null}
                  <ConfirmAction
                    triggerLabel="Borrar"
                    title={`Borrar ${f.filename}`}
                    description="El archivo dejará de estar disponible en el chat y no se podrá recuperar desde Nexus."
                    confirmLabel="Borrar archivo"
                    onConfirm={async () => {
                      await fetch(`/api/v1/files?id=${f.id}`, {
                        method: "DELETE",
                      });
                      if (preview?.id === f.id) setPreview(null);
                      reload();
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {preview ? (
        <section className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-xs text-zinc-500">
              Preview · {preview.filename}
            </div>
            <button
              type="button"
              className="text-xs text-zinc-500 hover:text-zinc-800"
              onClick={() => setPreview(null)}
            >
              Cerrar
            </button>
          </div>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-zinc-400">
            {preview.text}
          </pre>
        </section>
      ) : null}
    </div>
  );
}
