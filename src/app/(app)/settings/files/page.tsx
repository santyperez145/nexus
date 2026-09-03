"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useRemoteData } from "@/lib/use-remote-data";

type FileRow = { id: string; filename: string; bytes: number; mime?: string };

export default function FilesPage() {
  const [rows, reload] = useRemoteData<FileRow[]>("/api/v1/files");
  const [msg, setMsg] = useState<string | null>(null);
  const list = rows ?? [];

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">Files</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Subí texto, código o PDF. En el playground marcá el file y el gateway lo inyecta en el prompt
        (<code>file_ids</code>).
      </p>
      <input
        type="file"
        aria-label="Subir archivo"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const body = new FormData();
          body.append("file", file);
          const res = await fetch("/api/v1/files", { method: "POST", body });
          const json = await res.json();
          setMsg(json.data ? `OK ${json.data.filename}` : json.error?.message ?? "error");
          reload();
          e.target.value = "";
        }}
      />
      {msg ? <p className="mt-2 text-sm text-amber-300">{msg}</p> : null}
      <div className="mt-6 grid gap-2">
        {list.map((f) => (
          <div key={f.id} className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-sm">
            <span>
              {f.filename}{" "}
              <span className="font-mono text-xs text-zinc-500">
                {f.id} · {f.bytes} B
              </span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await fetch(`/api/v1/files?id=${f.id}`, { method: "DELETE" });
                reload();
              }}
            >
              Borrar
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
