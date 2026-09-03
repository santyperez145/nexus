"use client";

import { AppPageHeader } from "@/components/layout/app-page-header";
import { useCallback, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useRemoteData } from "@/lib/use-remote-data";

type FileRow = { id: string; filename: string; bytes: number; mime?: string };

function isImage(mime?: string, filename?: string) {
  return Boolean(
    (mime && /^image\//i.test(mime)) || (filename && /\.(png|jpe?g|gif|webp|bmp)$/i.test(filename)),
  );
}

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FilesPage() {
  const [rows, reload] = useRemoteData<FileRow[]>("/api/v1/files");
  const [msg, setMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ id: string; text: string; filename: string } | null>(null);
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
        setProgress(`${i + 1}/${batch.length}`);
        const body = new FormData();
        body.append("file", batch[i]);
        const res = await fetch("/api/v1/files", { method: "POST", body });
        const json = await res.json();
        if (json.data) ok += 1;
        else setMsg(json.error?.message ?? "error");
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
        title="Files"
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href="/chat">Usar en chat</Link>
          </Button>
        }
      >
        Texto/PDF → system extract. Imágenes →{" "}
        <code className="text-amber-400/80">image_url</code> parts (visión). Máx 8 MB.
      </AppPageHeader>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3">
          <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-600">Archivos</div>
          <div className="mt-1 font-mono text-lg text-amber-200">{list.length}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3">
          <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-600">Imágenes</div>
          <div className="mt-1 font-mono text-lg text-zinc-200">{images}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3">
          <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-600">Tip</div>
          <div className="mt-1 text-xs leading-relaxed text-zinc-500">
            En Chat marcá el file · o pegá imagen directo
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
          if (e.dataTransfer.files?.length) void uploadMany(e.dataTransfer.files);
        }}
        className={`mb-4 rounded-2xl border border-dashed px-4 py-10 text-center transition-colors ${
          drag ? "border-amber-400/50 bg-amber-400/5" : "border-white/15 bg-white/[0.02]"
        }`}
      >
        <p className="text-sm text-zinc-400">Arrastrá uno o varios archivos acá</p>
        <p className="mt-1 text-xs text-zinc-600">PDF · texto · código · PNG/JPEG (visión)</p>
        <label className="mt-3 inline-block cursor-pointer text-sm text-amber-400 hover:underline">
          o elegí desde el disco
          <input
            type="file"
            multiple
            accept="image/*,.pdf,.txt,.md,.json,.csv,text/*"
            className="hidden"
            aria-label="Subir archivos"
            onChange={(e) => {
              if (e.target.files?.length) void uploadMany(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        {progress ? <p className="mt-2 font-mono text-xs text-zinc-500">Subiendo {progress}</p> : null}
      </div>

      {msg ? <p className="mb-4 text-sm text-amber-300">{msg}</p> : null}

      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 px-4 py-10 text-center">
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
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-sm"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium text-zinc-200">{f.filename}</span>
                    {img ? (
                      <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-300">
                        vision
                      </span>
                    ) : null}
                  </div>
                  <div className="font-mono text-[11px] text-zinc-600">
                    {f.id} · {fmtBytes(f.bytes)} · {f.mime ?? "—"}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => void showPreview(f.id, f.filename)}>
                    Preview
                  </Button>
                  <Button asChild size="sm" variant="ghost">
                    <Link href="/chat">Chat</Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      await fetch(`/api/v1/files?id=${f.id}`, { method: "DELETE" });
                      if (preview?.id === f.id) setPreview(null);
                      reload();
                    }}
                  >
                    Borrar
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {preview ? (
        <section className="mt-6 rounded-xl border border-white/10 bg-black/30 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-xs text-zinc-500">Preview · {preview.filename}</div>
            <button
              type="button"
              className="text-xs text-zinc-500 hover:text-zinc-300"
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
