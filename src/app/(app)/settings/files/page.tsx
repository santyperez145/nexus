"use client";

import { AppPageHeader } from "@/components/layout/app-page-header";
import { useCallback, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useRemoteData } from "@/lib/use-remote-data";

type FileRow = { id: string; filename: string; bytes: number; mime?: string };

export default function FilesPage() {
  const [rows, reload] = useRemoteData<FileRow[]>("/api/v1/files");
  const [msg, setMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ id: string; text: string; filename: string } | null>(null);
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const list = rows ?? [];

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
        Subí texto, código o PDF (multi). En el playground marcá el file (<code>file_ids</code>) y el
        gateway lo inyecta. Máx 4 MB c/u.
      </AppPageHeader>

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
        <label className="mt-3 inline-block cursor-pointer text-sm text-amber-400 hover:underline">
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
        {progress ? <p className="mt-2 font-mono text-xs text-zinc-500">Subiendo {progress}</p> : null}
      </div>

      {msg ? <p className="mb-4 text-sm text-amber-300">{msg}</p> : null}

      <div className="grid gap-2">
        {list.map((f) => (
          <div
            key={f.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm"
          >
            <div className="min-w-0">
              <div className="truncate font-medium text-zinc-200">{f.filename}</div>
              <div className="font-mono text-[11px] text-zinc-600">
                {f.id} · {f.bytes} B · {f.mime ?? "—"}
              </div>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={() => void showPreview(f.id, f.filename)}>
                Preview
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
        ))}
        {list.length === 0 ? (
          <p className="text-sm text-zinc-600">Todavía no hay archivos.</p>
        ) : null}
      </div>

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
