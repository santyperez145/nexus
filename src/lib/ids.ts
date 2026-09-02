import { randomBytes } from "node:crypto";

export function id(prefix: string) {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

export function generationId() {
  return `gen-${randomBytes(12).toString("hex")}`;
}
