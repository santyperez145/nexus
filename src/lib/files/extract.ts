const TEXT_MIME = /^(text\/|application\/(json|xml|javascript|csv|x-www-form-urlencoded))/i;

export function extractFileText(mime: string, contentB64: string, filename = "file"): string {
  const buf = Buffer.from(contentB64, "base64");
  if (TEXT_MIME.test(mime) || /\.(txt|md|csv|json|xml|html|py|ts|js|rs|go)$/i.test(filename)) {
    return buf.toString("utf8").slice(0, 80_000);
  }
  if (mime.includes("pdf") || filename.toLowerCase().endsWith(".pdf")) {
    const raw = buf.toString("latin1");
    const strings = raw.match(/[\x20-\x7E]{6,}/g) ?? [];
    const text = strings.filter((s) => /[a-zA-Z]{3,}/.test(s)).join("\n");
    return text.slice(0, 80_000) || `[PDF ${filename}: ${buf.length} bytes]`;
  }
  return `[${filename}: ${mime || "binario"}, ${buf.length} bytes]`;
}
