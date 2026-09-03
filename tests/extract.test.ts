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

  it("reads TJ arrays from pdf content streams", () => {
    const raw = "%PDF-1.4\nBT [(Factura ) 120 (Nexus)] TJ ET";
    const b64 = Buffer.from(raw, "latin1").toString("base64");
    const text = extractFileText("application/pdf", b64, "factura.pdf");
    assert.match(text, /Factura/);
    assert.match(text, /Nexus/);
  });

  it("decodes hex PDF strings", () => {
    const hex = Buffer.from("Nexus Hex").toString("hex");
    const raw = `%PDF-1.4\n<${hex}>`;
    const b64 = Buffer.from(raw, "latin1").toString("base64");
    const text = extractFileText("application/pdf", b64, "hex.pdf");
    assert.match(text, /Nexus Hex/);
  });

  it("falls back for opaque binaries", () => {
    const b64 = Buffer.from([0, 1, 2, 3]).toString("base64");
    assert.match(extractFileText("application/octet-stream", b64, "blob.bin"), /blob.bin/);
  });
});
