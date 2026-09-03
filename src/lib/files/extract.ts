import { inflateSync } from "node:zlib";

const TEXT_MIME = /^(text\/|application\/(json|xml|javascript|csv|x-www-form-urlencoded))/i;

function unescapePdfLiteral(s: string) {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

function decodeHexStrings(raw: string): string[] {
  const out: string[] = [];
  for (const m of raw.matchAll(/<([0-9A-Fa-f \n\r\t]+)>/g)) {
    const hex = m[1].replace(/\s+/g, "");
    if (hex.length < 4 || hex.length % 2) continue;
    try {
      const buf = Buffer.from(hex, "hex");
      const s = buf.toString("utf8");
      if (/[\p{L}\p{N}]{2,}/u.test(s)) out.push(s);
    } catch {
      /* ignore */
    }
  }
  return out;
}

function inflatePdfStreams(raw: Buffer): string {
  const latin = raw.toString("latin1");
  const chunks: string[] = [];
  for (const m of latin.matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    const body = Buffer.from(m[1].replace(/^\r?\n/, "").replace(/\r?\n$/, ""), "latin1");
    try {
      const inflated = inflateSync(body);
      chunks.push(inflated.toString("latin1"));
    } catch {
      try {
        // Algunos PDFs meten zlib header; otros raw deflate.
        const inflated = inflateSync(body, { windowBits: -15 });
        chunks.push(inflated.toString("latin1"));
      } catch {
        chunks.push(body.toString("latin1"));
      }
    }
  }
  return chunks.join("\n");
}

function harvestPdfText(raw: string): string {
  const parts: string[] = [];
  for (const m of raw.matchAll(/\((?:\\.|[^\\)]){2,}\)/g)) {
    const s = unescapePdfLiteral(m[0].slice(1, -1));
    if (/[\p{L}\p{N}]{2,}/u.test(s)) parts.push(s);
  }
  for (const m of raw.matchAll(/\[((?:[^\]]|\n)*)\]\s*TJ/g)) {
    for (const lit of m[1].matchAll(/\((?:\\.|[^\\)])*\)/g)) {
      const s = unescapePdfLiteral(lit[0].slice(1, -1));
      if (s.trim()) parts.push(s);
    }
  }
  parts.push(...decodeHexStrings(raw));
  if (parts.length) return parts.join(" ").replace(/\s+/g, " ").trim().slice(0, 80_000);
  const strings = raw.match(/[\x20-\x7EÀ-ÿ]{6,}/g) ?? [];
  const text = strings.filter((s) => /[A-Za-zÁÉÍÓÚáéíóúñÑ]{3,}/.test(s)).join("\n");
  return text.slice(0, 80_000);
}

/** Extrae texto de literales PDF `(…)`, `TJ`, hex y streams FlateDecode sin deps nativas. */
export function extractPdfText(buf: Buffer): string {
  const inflated = inflatePdfStreams(buf);
  const primary = harvestPdfText(buf.toString("latin1"));
  const secondary = inflated ? harvestPdfText(inflated) : "";
  const merged = [primary, secondary].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return merged.slice(0, 80_000);
}

export function extractFileText(mime: string, contentB64: string, filename = "file"): string {
  const buf = Buffer.from(contentB64, "base64");
  if (TEXT_MIME.test(mime) || /\.(txt|md|csv|json|xml|html|py|ts|js|rs|go)$/i.test(filename)) {
    return buf.toString("utf8").slice(0, 80_000);
  }
  if (mime.includes("pdf") || filename.toLowerCase().endsWith(".pdf")) {
    return extractPdfText(buf) || `[PDF ${filename}: ${buf.length} bytes]`;
  }
  return `[${filename}: ${mime || "binario"}, ${buf.length} bytes]`;
}
