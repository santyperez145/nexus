import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractFileText } from "../src/lib/files/extract";

describe("extractFileText", () => {
  it("decodes utf8 text files", () => {
    const b64 = Buffer.from("hola nexus", "utf8").toString("base64");
    assert.equal(extractFileText("text/plain", b64, "nota.txt"), "hola nexus");
  });

  it("pulls printable strings from a pdf-like blob", () => {
    const raw = "%PDF-1.4\n(Hello Nexus document)\nendstream";
    const b64 = Buffer.from(raw, "latin1").toString("base64");
    const text = extractFileText("application/pdf", b64, "doc.pdf");
    assert.match(text, /Hello Nexus document/);
  });

  it("falls back for opaque binaries", () => {
    const b64 = Buffer.from([0, 1, 2, 3]).toString("base64");
    assert.match(extractFileText("application/octet-stream", b64, "blob.bin"), /blob.bin/);
  });
});
