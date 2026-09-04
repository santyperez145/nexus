"use client";

import { createSHA256 } from "hash-wasm";

const INLINE_FILE_MAX_BYTES = 8_000_000;
const HASH_CHUNK_BYTES = 8 * 1024 * 1024;

type UploadedFile = {
  id: string;
  filename: string;
  bytes: number;
  mime: string;
  status: string;
  storage_backend: string;
  sha256: string | null;
};

async function responseData<T>(response: Response) {
  const json = (await response.json().catch(() => ({}))) as {
    data?: T;
    error?: { message?: string };
  };
  if (!response.ok || !json.data) {
    throw new Error(json.error?.message ?? `Upload rejected (${response.status})`);
  }
  return json.data;
}

async function hashFile(file: File, onProgress?: (progress: number) => void) {
  const hasher = await createSHA256();
  hasher.init();
  for (let offset = 0; offset < file.size; offset += HASH_CHUNK_BYTES) {
    const end = Math.min(offset + HASH_CHUNK_BYTES, file.size);
    hasher.update(new Uint8Array(await file.slice(offset, end).arrayBuffer()));
    onProgress?.((end / file.size) * 0.25);
  }
  return hasher.digest("hex");
}

export async function uploadNexusFile(
  file: File,
  options: { workspaceId?: string | null; onProgress?: (progress: number) => void } = {},
) {
  if (file.size <= INLINE_FILE_MAX_BYTES) {
    const form = new FormData();
    form.append("file", file);
    if (options.workspaceId) form.append("workspace_id", options.workspaceId);
    const result = await responseData<UploadedFile>(
      await fetch("/api/v1/files", { method: "POST", body: form }),
    );
    options.onProgress?.(1);
    return result;
  }
  const checksumSha256 = await hashFile(file, options.onProgress);
  const initiation = await responseData<{
    id: string;
    upload: { url: string; headers: Record<string, string> };
  }>(
    await fetch("/api/v1/files/uploads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        mime: file.type || "application/octet-stream",
        bytes: file.size,
        sha256: checksumSha256,
        workspace_id: options.workspaceId ?? null,
      }),
    }),
  );
  const uploaded = await fetch(initiation.upload.url, {
    method: "PUT",
    headers: initiation.upload.headers,
    body: file,
  });
  if (!uploaded.ok) throw new Error(`Object storage rejected the upload (${uploaded.status})`);
  options.onProgress?.(0.9);
  const completed = await responseData<UploadedFile>(
    await fetch(`/api/v1/files/uploads/${encodeURIComponent(initiation.id)}/complete`, {
      method: "POST",
    }),
  );
  options.onProgress?.(1);
  return completed;
}
