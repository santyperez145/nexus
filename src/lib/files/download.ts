import { signArtifactDownload } from "./blob-store";

type DownloadableFile = {
  id: string;
  filename: string;
  mime: string;
  size: number;
  content: string | null;
  storageBackend: string;
  storageKey: string | null;
  checksumSha256: string | null;
  status: string;
};

export async function artifactDownloadResponse(
  file: DownloadableFile,
  options: { cacheControl: string; etag?: string; revision?: string },
) {
  if (file.status !== "ready") {
    throw Object.assign(new Error("Artifact upload is not ready"), {
      status: 409,
      code: "artifact_not_ready",
    });
  }
  const etag = options.etag ?? `sha256-${file.checksumSha256 ?? file.id}`;
  const sharedHeaders = {
    ETag: `"${etag}"`,
    "Cache-Control": options.cacheControl,
    ...(options.revision ? { "X-Nexus-Revision": options.revision } : {}),
  };
  if (file.storageBackend === "s3" && file.storageKey) {
    const url = await signArtifactDownload({
      key: file.storageKey,
      filename: file.filename,
      mime: file.mime,
    });
    return new Response(null, { status: 307, headers: { ...sharedHeaders, Location: url } });
  }
  if (!file.content) {
    throw Object.assign(new Error("Artifact content is unavailable"), {
      status: 410,
      code: "content_unavailable",
    });
  }
  const bytes = new Uint8Array(Buffer.from(file.content, "base64"));
  return new Response(bytes, {
    headers: {
      ...sharedHeaders,
      "Content-Type": file.mime || "application/octet-stream",
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    },
  });
}
