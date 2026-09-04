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

async function hashBlob(blob: Blob) {
  const hasher = await createSHA256();
  hasher.init();
  hasher.update(new Uint8Array(await blob.arrayBuffer()));
  return hasher.digest("hex");
}

async function putPart(
  signed: { url: string; method: string; headers: Record<string, string> },
  body: Blob,
) {
  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(signed.url, {
      method: signed.method,
      headers: signed.headers,
      body,
    }).catch(() => null);
    if (response?.ok) return;
    lastStatus = response?.status ?? 0;
  }
  throw new Error(`Object storage rejected an upload part (${lastStatus || "network"})`);
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
    upload:
      | {
          strategy: "single";
          method: "PUT";
          url: string;
          headers: Record<string, string>;
        }
      | {
          strategy: "multipart";
          part_size: number;
          part_count: number;
          parts_url: string;
        };
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
  if (initiation.upload.strategy === "single") {
    await putPart(initiation.upload, file);
  } else {
    const { part_count: partCount, part_size: partSize, parts_url: partsUrl } = initiation.upload;
    const concurrency = 4;
    let uploadedBytes = 0;
    for (let start = 1; start <= partCount; start += concurrency) {
      const numbers = Array.from(
        { length: Math.min(concurrency, partCount - start + 1) },
        (_, index) => start + index,
      );
      const chunks = await Promise.all(
        numbers.map(async (partNumber) => {
          const offset = (partNumber - 1) * partSize;
          const blob = file.slice(offset, Math.min(offset + partSize, file.size));
          return { partNumber, blob, sha256: await hashBlob(blob) };
        }),
      );
      const signed = await responseData<
        Array<{
          part_number: number;
          bytes: number;
          method: "PUT";
          url: string;
          headers: Record<string, string>;
        }>
      >(
        await fetch(partsUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            parts: chunks.map((part) => ({
              part_number: part.partNumber,
              sha256: part.sha256,
            })),
          }),
        }),
      );
      await Promise.all(
        signed.map(async (part) => {
          const chunk = chunks.find((item) => item.partNumber === part.part_number);
          if (!chunk || chunk.blob.size !== part.bytes) throw new Error("Invalid multipart reservation");
          await putPart(part, chunk.blob);
          uploadedBytes += part.bytes;
          options.onProgress?.(0.25 + (uploadedBytes / file.size) * 0.65);
        }),
      );
    }
  }
  options.onProgress?.(0.9);
  const completed = await responseData<UploadedFile>(
    await fetch(`/api/v1/files/uploads/${encodeURIComponent(initiation.id)}/complete`, {
      method: "POST",
    }),
  );
  options.onProgress?.(1);
  return completed;
}
