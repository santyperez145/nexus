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

/** Extrae texto de literales PDF `(…)` / `Tj` sin dependencia nativa. */
export function extractPdfText(buf: Buffer): string {
  const raw = buf.toString("latin1");
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
  if (parts.length) return parts.join(" ").replace(/\s+/g, " ").trim().slice(0, 80_000);
  const strings = raw.match(/[\x20-\x7EÀ-ÿ]{6,}/g) ?? [];
  const text = strings.filter((s) => /[A-Za-zÁÉÍÓÚáéíóúñÑ]{3,}/.test(s)).join("\n");
  return text.slice(0, 80_000);
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
