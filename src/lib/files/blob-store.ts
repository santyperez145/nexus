import { createHash } from "node:crypto";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type ObjectStorageConfig = {
  bucket: string;
  region: string;
  endpoint?: string;
  forcePathStyle: boolean;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
};

const SIGNED_URL_TTL_SECONDS = 15 * 60;
let cached: { signature: string; client: S3Client; config: ObjectStorageConfig } | null = null;

function value(env: NodeJS.ProcessEnv, key: string) {
  return env[key]?.trim() || undefined;
}

/** Parse a portable S3 configuration without binding Nexus to one storage vendor. */
export function objectStorageConfig(env: NodeJS.ProcessEnv = process.env): ObjectStorageConfig | null {
  const bucket = value(env, "NEXUS_OBJECT_STORAGE_BUCKET");
  if (!bucket) return null;
  const endpoint = value(env, "NEXUS_OBJECT_STORAGE_ENDPOINT") ?? value(env, "AWS_ENDPOINT_URL_S3");
  if (endpoint) {
    const url = new URL(endpoint);
    if (url.username || url.password) throw new Error("Object storage endpoint must not contain credentials");
    if (env.NODE_ENV === "production" && url.protocol !== "https:") {
      throw new Error("Object storage endpoint must use HTTPS in production");
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("Object storage endpoint must use HTTP or HTTPS");
    }
  }
  const accessKeyId = value(env, "NEXUS_OBJECT_STORAGE_ACCESS_KEY_ID") ?? value(env, "AWS_ACCESS_KEY_ID");
  const secretAccessKey =
    value(env, "NEXUS_OBJECT_STORAGE_SECRET_ACCESS_KEY") ?? value(env, "AWS_SECRET_ACCESS_KEY");
  if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
    throw new Error("Object storage access key and secret must be configured together");
  }
  return {
    bucket,
    region: value(env, "NEXUS_OBJECT_STORAGE_REGION") ?? value(env, "AWS_REGION") ?? "us-east-1",
    ...(endpoint ? { endpoint } : {}),
    forcePathStyle: value(env, "NEXUS_OBJECT_STORAGE_FORCE_PATH_STYLE") === "true",
    ...(accessKeyId && secretAccessKey
      ? {
          accessKeyId,
          secretAccessKey,
          ...(value(env, "AWS_SESSION_TOKEN") ? { sessionToken: value(env, "AWS_SESSION_TOKEN") } : {}),
        }
      : {}),
  };
}

function storage() {
  const config = objectStorageConfig();
  if (!config) {
    throw Object.assign(new Error("Object storage is not configured for large artifacts"), {
      status: 503,
      code: "object_storage_unavailable",
    });
  }
  const signature = JSON.stringify(config);
  if (cached?.signature === signature) return cached;
  const client = new S3Client({
    region: config.region,
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    forcePathStyle: config.forcePathStyle,
    ...(config.accessKeyId && config.secretAccessKey
      ? {
          credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
            ...(config.sessionToken ? { sessionToken: config.sessionToken } : {}),
          },
        }
      : {}),
  });
  cached = { signature, client, config };
  return cached;
}

export function objectStorageEnabled() {
  return objectStorageConfig() !== null;
}

export function artifactObjectKey(input: {
  fileId: string;
  userId: string;
  workspaceId?: string | null;
}) {
  const scope = input.workspaceId ? `workspaces/${input.workspaceId}` : `users/${input.userId}`;
  return `nexus-artifacts/${scope}/${input.fileId}`;
}

export function sha256HexToBase64(checksum: string) {
  if (!/^[a-f0-9]{64}$/i.test(checksum)) throw new Error("Invalid SHA-256 checksum");
  return Buffer.from(checksum, "hex").toString("base64");
}

export async function signArtifactUpload(input: {
  key: string;
  mime: string;
  size: number;
  checksumSha256: string;
}) {
  const { client, config } = storage();
  const checksum = sha256HexToBase64(input.checksumSha256);
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: input.key,
    ContentType: input.mime,
    ContentLength: input.size,
    ChecksumSHA256: checksum,
    Metadata: { "nexus-sha256": input.checksumSha256.toLowerCase() },
  });
  const url = await getSignedUrl(client, command, {
    expiresIn: SIGNED_URL_TTL_SECONDS,
    unhoistableHeaders: new Set(["x-amz-checksum-sha256"]),
  });
  return {
    url,
    expiresIn: SIGNED_URL_TTL_SECONDS,
    headers: {
      "content-type": input.mime,
      "x-amz-checksum-sha256": checksum,
    },
  };
}

export async function createMultipartArtifactUpload(input: {
  key: string;
  mime: string;
  checksumSha256: string;
}) {
  const { client, config } = storage();
  sha256HexToBase64(input.checksumSha256);
  const result = await client.send(
    new CreateMultipartUploadCommand({
      Bucket: config.bucket,
      Key: input.key,
      ContentType: input.mime,
      ChecksumAlgorithm: "SHA256",
      ChecksumType: "COMPOSITE",
      Metadata: { "nexus-sha256": input.checksumSha256.toLowerCase() },
    }),
  );
  if (!result.UploadId) throw new Error("Object storage did not return a multipart upload id");
  return { uploadId: result.UploadId };
}

export async function signMultipartArtifactPart(input: {
  key: string;
  uploadId: string;
  partNumber: number;
  size: number;
  checksumSha256: string;
}) {
  const { client, config } = storage();
  const checksum = sha256HexToBase64(input.checksumSha256);
  const command = new UploadPartCommand({
    Bucket: config.bucket,
    Key: input.key,
    UploadId: input.uploadId,
    PartNumber: input.partNumber,
    ContentLength: input.size,
    ChecksumSHA256: checksum,
  });
  const url = await getSignedUrl(client, command, {
    expiresIn: SIGNED_URL_TTL_SECONDS,
    unhoistableHeaders: new Set(["x-amz-checksum-sha256"]),
  });
  return {
    url,
    expiresIn: SIGNED_URL_TTL_SECONDS,
    headers: { "x-amz-checksum-sha256": checksum },
  };
}

export type MultipartArtifactPart = {
  partNumber: number;
  size: number;
  etag: string;
  checksumSha256: string;
};

export async function listMultipartArtifactParts(input: { key: string; uploadId: string }) {
  const { client, config } = storage();
  const parts: MultipartArtifactPart[] = [];
  let marker: string | undefined;
  do {
    const result = await client.send(
      new ListPartsCommand({
        Bucket: config.bucket,
        Key: input.key,
        UploadId: input.uploadId,
        MaxParts: 1_000,
        ...(marker ? { PartNumberMarker: marker } : {}),
      }),
    );
    for (const part of result.Parts ?? []) {
      if (
        !part.PartNumber ||
        part.Size == null ||
        !part.ETag ||
        !part.ChecksumSHA256
      ) {
        throw new Error("Object storage returned incomplete multipart metadata");
      }
      parts.push({
        partNumber: part.PartNumber,
        size: part.Size,
        etag: part.ETag,
        checksumSha256: part.ChecksumSHA256,
      });
    }
    marker = result.IsTruncated ? result.NextPartNumberMarker : undefined;
    if (result.IsTruncated && !marker) {
      throw new Error("Object storage returned an invalid multipart continuation token");
    }
  } while (marker);
  return parts.sort((a, b) => a.partNumber - b.partNumber);
}

export function multipartCompositeSha256(parts: MultipartArtifactPart[]) {
  const digest = createHash("sha256");
  for (const part of parts) digest.update(Buffer.from(part.checksumSha256, "base64"));
  return `${digest.digest("base64")}-${parts.length}`;
}

export async function completeMultipartArtifactUpload(input: {
  key: string;
  uploadId: string;
  parts: MultipartArtifactPart[];
}) {
  const { client, config } = storage();
  const checksumSha256 = multipartCompositeSha256(input.parts);
  const result = await client.send(
    new CompleteMultipartUploadCommand({
      Bucket: config.bucket,
      Key: input.key,
      UploadId: input.uploadId,
      ChecksumType: "COMPOSITE",
      MultipartUpload: {
        Parts: input.parts.map((part) => ({
          PartNumber: part.partNumber,
          ETag: part.etag,
          ChecksumSHA256: part.checksumSha256,
        })),
      },
    }),
  );
  if (result.ChecksumSHA256 && result.ChecksumSHA256 !== checksumSha256) {
    throw new Error("Object storage returned an unexpected multipart checksum");
  }
  return {
    etag: result.ETag?.replaceAll('"', "") ?? null,
    checksumSha256,
  };
}

export async function abortMultipartArtifactUpload(input: { key: string; uploadId: string }) {
  const { client, config } = storage();
  await client.send(
    new AbortMultipartUploadCommand({
      Bucket: config.bucket,
      Key: input.key,
      UploadId: input.uploadId,
    }),
  );
}

export async function putArtifact(input: {
  key: string;
  mime: string;
  body: Uint8Array;
  checksumSha256: string;
}) {
  const { client, config } = storage();
  const result = await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: input.key,
      Body: input.body,
      ContentType: input.mime,
      ChecksumSHA256: sha256HexToBase64(input.checksumSha256),
      Metadata: { "nexus-sha256": input.checksumSha256.toLowerCase() },
    }),
  );
  return { etag: result.ETag?.replaceAll('"', "") ?? null };
}

export async function verifyArtifact(input: {
  key: string;
  size: number;
  checksumSha256: string;
  multipartChecksumSha256?: string;
}) {
  const { client, config } = storage();
  const result = await client.send(
    new HeadObjectCommand({ Bucket: config.bucket, Key: input.key, ChecksumMode: "ENABLED" }),
  );
  const expectedChecksum = input.multipartChecksumSha256 ?? sha256HexToBase64(input.checksumSha256);
  if (Number(result.ContentLength) !== input.size) {
    throw Object.assign(new Error("Uploaded artifact size does not match the reservation"), {
      status: 409,
      code: "artifact_size_mismatch",
    });
  }
  if (result.ChecksumSHA256 !== expectedChecksum) {
    throw Object.assign(new Error("Uploaded artifact SHA-256 could not be verified"), {
      status: 409,
      code: "artifact_checksum_mismatch",
    });
  }
  if (result.Metadata?.["nexus-sha256"] !== input.checksumSha256.toLowerCase()) {
    throw Object.assign(new Error("Uploaded artifact SHA-256 metadata does not match the reservation"), {
      status: 409,
      code: "artifact_checksum_mismatch",
    });
  }
  return { etag: result.ETag?.replaceAll('"', "") ?? null };
}

export async function signArtifactDownload(input: {
  key: string;
  filename: string;
  mime: string;
}) {
  const { client, config } = storage();
  const disposition = `attachment; filename*=UTF-8''${encodeURIComponent(input.filename)}`;
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: input.key,
      ResponseContentType: input.mime,
      ResponseContentDisposition: disposition,
    }),
    { expiresIn: SIGNED_URL_TTL_SECONDS },
  );
}

export async function readArtifact(key: string) {
  const { client, config } = storage();
  const result = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
  if (!result.Body) throw new Error("Object storage returned an empty body");
  return result.Body.transformToByteArray();
}

export async function probeArtifactStorage() {
  const { client, config } = storage();
  await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
}

export async function deleteArtifact(key: string) {
  const { client, config } = storage();
  await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
}
