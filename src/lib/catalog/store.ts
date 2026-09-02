import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cache } from "@/lib/redis";
import type { CatalogModel } from "./types";
import { OWNED_CATALOG } from "./owned";

const FILE = join(process.cwd(), "data", "catalog.json");
const REDIS_KEY = "catalog:models";

let memory: CatalogModel[] | null = null;

export function bundledCatalog() {
  return OWNED_CATALOG;
}

export function readCatalogFile(): CatalogModel[] | null {
  if (process.env.NEXT_PHASE === "phase-production-build") return null;
  try {
    if (!existsSync(FILE)) return null;
    return JSON.parse(readFileSync(FILE, "utf8")) as CatalogModel[];
  } catch {
    return null;
  }
}

export function writeCatalogFile(models: CatalogModel[]) {
  mkdirSync(join(process.cwd(), "data"), { recursive: true });
  writeFileSync(FILE, JSON.stringify(models));
  memory = models;
}

export async function persistCatalog(models: CatalogModel[]) {
  writeCatalogFile(models);
  const redis = await cache();
  await redis.set(REDIS_KEY, JSON.stringify(models), 60 * 60);
}

export async function loadCatalog(): Promise<CatalogModel[]> {
  if (memory?.length) return memory;
  const redis = await cache();
  const cached = await redis.get(REDIS_KEY);
  if (cached) {
    try {
      memory = JSON.parse(cached) as CatalogModel[];
      if (memory.length) return memory;
    } catch {
      /* fall through */
    }
  }
  const file = readCatalogFile();
  if (file?.length) {
    memory = file;
    return file;
  }
  return OWNED_CATALOG;
}

export function catalogPath() {
  return FILE;
}
