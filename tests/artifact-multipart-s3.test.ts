import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type IncomingMessage } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

const bucket = "nexus-test";
const key = "nexus-artifacts/users/usr_test/file_test";
const uploadId = "upload-test-1";
const dataDir = mkdtempSync(join(tmpdir(), "nexus-artifact-multipart-test-"));
const fullDigest = createHash("sha256").update("abcdefghij").digest("hex");
const uploadedParts = new Map<number, { body: Buffer; checksum: string; etag: string }>();
let initiatedDigest = "";
let completionBody = "";

async function requestBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function xml(value: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>${value}`;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const objectPath = `/${bucket}/${key}`;
  if (req.method === "POST" && url.pathname === objectPath && url.searchParams.has("uploads")) {
    initiatedDigest = String(req.headers["x-amz-meta-nexus-sha256"] ?? "");
    res.setHeader("content-type", "application/xml");
    res.end(
      xml(
        `<InitiateMultipartUploadResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Bucket>${bucket}</Bucket><Key>${key}</Key><UploadId>${uploadId}</UploadId></InitiateMultipartUploadResult>`,
      ),
    );
    return;
  }
  if (req.method === "PUT" && url.pathname === objectPath && url.searchParams.get("uploadId") === uploadId) {
    const partNumber = Number(url.searchParams.get("partNumber"));
    const body = await requestBody(req);
    const checksum = createHash("sha256").update(body).digest("base64");
    if (req.headers["x-amz-checksum-sha256"] !== checksum) {
      res.statusCode = 400;
      res.end("bad checksum");
      return;
    }
    uploadedParts.set(partNumber, { body, checksum, etag: `etag-${partNumber}` });
    res.setHeader("etag", `"etag-${partNumber}"`);
    res.setHeader("x-amz-checksum-sha256", checksum);
    res.end();
    return;
  }
  if (req.method === "GET" && url.pathname === objectPath && url.searchParams.get("uploadId") === uploadId) {
    const parts = [...uploadedParts.entries()]
      .sort(([a], [b]) => a - b)
      .map(
        ([partNumber, part]) =>
          `<Part><PartNumber>${partNumber}</PartNumber><LastModified>2026-01-01T00:00:00.000Z</LastModified><ETag>"${part.etag}"</ETag><Size>${part.body.length}</Size><ChecksumSHA256>${part.checksum}</ChecksumSHA256></Part>`,
      )
      .join("");
    res.setHeader("content-type", "application/xml");
    res.end(
      xml(
        `<ListPartsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Bucket>${bucket}</Bucket><Key>${key}</Key><UploadId>${uploadId}</UploadId><PartNumberMarker>0</PartNumberMarker><NextPartNumberMarker>2</NextPartNumberMarker><MaxParts>1000</MaxParts><IsTruncated>false</IsTruncated>${parts}</ListPartsResult>`,
      ),
    );
    return;
  }
  if (req.method === "POST" && url.pathname === objectPath && url.searchParams.get("uploadId") === uploadId) {
    completionBody = (await requestBody(req)).toString("utf8");
    const { multipartCompositeSha256 } = await import("../src/lib/files/blob-store");
    const checksum = multipartCompositeSha256(
      [...uploadedParts.entries()]
        .sort(([a], [b]) => a - b)
        .map(([partNumber, part]) => ({
          partNumber,
          size: part.body.length,
          etag: `"${part.etag}"`,
          checksumSha256: part.checksum,
        })),
    );
    res.setHeader("content-type", "application/xml");
    res.end(
      xml(
        `<CompleteMultipartUploadResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Location>http://127.0.0.1/${bucket}/${key}</Location><Bucket>${bucket}</Bucket><Key>${key}</Key><ETag>"etag-final"</ETag><ChecksumSHA256>${checksum}</ChecksumSHA256><ChecksumType>COMPOSITE</ChecksumType></CompleteMultipartUploadResult>`,
      ),
    );
    return;
  }
  if (req.method === "HEAD" && url.pathname === objectPath) {
    const { multipartCompositeSha256 } = await import("../src/lib/files/blob-store");
    const parts = [...uploadedParts.entries()]
      .sort(([a], [b]) => a - b)
      .map(([partNumber, part]) => ({
        partNumber,
        size: part.body.length,
        etag: `"${part.etag}"`,
        checksumSha256: part.checksum,
      }));
    res.setHeader("content-length", String(parts.reduce((sum, part) => sum + part.size, 0)));
    res.setHeader("etag", '"etag-final"');
    res.setHeader("x-amz-checksum-sha256", multipartCompositeSha256(parts));
    res.setHeader("x-amz-meta-nexus-sha256", initiatedDigest);
    res.end();
    return;
  }
  res.statusCode = 404;
  res.end("not found");
});

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test S3 server did not bind");
  process.env.NEXUS_OBJECT_STORAGE_BUCKET = bucket;
  process.env.NEXUS_OBJECT_STORAGE_ENDPOINT = `http://127.0.0.1:${address.port}`;
  process.env.NEXUS_OBJECT_STORAGE_REGION = "us-east-1";
  process.env.NEXUS_OBJECT_STORAGE_FORCE_PATH_STYLE = "true";
  process.env.NEXUS_OBJECT_STORAGE_ACCESS_KEY_ID = "test-access-key";
  process.env.NEXUS_OBJECT_STORAGE_SECRET_ACCESS_KEY = "test-secret-key";
  process.env.ENABLE_PGLITE = "true";
  process.env.PGLITE_DATA_DIR = dataDir;
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
  delete process.env.POSTGRES_PRISMA_URL;
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  rmSync(dataDir, { recursive: true, force: true });
});

describe("S3 multipart artifact transport", () => {
  it("signs checksummed parts and verifies the completed composite object", async () => {
    const storage = await import("../src/lib/files/blob-store");
    const created = await storage.createMultipartArtifactUpload({
      key,
      mime: "application/octet-stream",
      checksumSha256: fullDigest,
    });
    assert.equal(created.uploadId, uploadId);
    assert.equal(initiatedDigest, fullDigest);

    for (const [partNumber, value] of ["abcdef", "ghij"].entries()) {
      const body = new TextEncoder().encode(value);
      const checksumSha256 = createHash("sha256").update(body).digest("hex");
      const signed = await storage.signMultipartArtifactPart({
        key,
        uploadId,
        partNumber: partNumber + 1,
        size: body.byteLength,
        checksumSha256,
      });
      const response = await fetch(signed.url, { method: "PUT", headers: signed.headers, body });
      assert.equal(response.status, 200);
    }

    const parts = await storage.listMultipartArtifactParts({ key, uploadId });
    assert.deepEqual(parts.map((part) => part.size), [6, 4]);
    const database = await import("../src/lib/db");
    const artifactStore = await import("../src/lib/files/store");
    await database.ensureDb();
    await database.db.insert(database.schema.users).values({
      id: "usr_multipart_transport",
      name: "Multipart transport",
      email: "multipart-transport@nexus.test",
      plan: "team",
    });
    const [pending] = await database.db
      .insert(database.schema.files)
      .values({
        id: "file_multipart_transport",
        userId: "usr_multipart_transport",
        filename: "weights.gguf",
        mime: "application/octet-stream",
        size: 10,
        storageBackend: "s3",
        storageKey: key,
        storageUploadId: uploadId,
        storagePartSize: 6,
        checksumSha256: fullDigest,
        status: "pending",
        uploadExpiresAt: new Date(Date.now() + 60_000),
      })
      .returning();
    assert.ok(pending);
    const completed = await artifactStore.completeDirectUpload(pending);
    assert.equal(completed.status, "ready");
    assert.equal(completed.etag, "etag-final");
    assert.equal((await artifactStore.completeDirectUpload(completed)).status, "ready");
    assert.match(completionBody, /<PartNumber>1<\/PartNumber>/);
    assert.match(completionBody, /<ChecksumSHA256>/);

    const verified = await storage.verifyArtifact({
      key,
      size: 10,
      checksumSha256: fullDigest,
      multipartChecksumSha256: storage.multipartCompositeSha256(parts),
    });
    assert.equal(verified.etag, "etag-final");
  });
});
