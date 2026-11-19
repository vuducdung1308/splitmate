import "server-only";
import fs from "fs/promises";
import path from "path";

// Off-chain store for expense descriptions (NFR-11). Only the hash lives on-chain.
// File-backed for the MVP; swap for a KV/DB on serverless hosting.
const FILE = process.env.META_STORE_FILE || path.join(process.cwd(), "data", "meta.json");
let cache: Record<string, unknown> | null = null;
let writing: Promise<void> = Promise.resolve();

async function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(await fs.readFile(FILE, "utf8"));
  } catch {
    cache = {};
  }
  return cache!;
}

export async function putMeta(hash: string, meta: unknown) {
  const db = await load();
  db[hash.toLowerCase()] = meta;
  writing = writing.then(async () => {
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(db));
  });
  await writing;
}

export async function getMetas(hashes: string[]) {
  const db = await load();
  return Object.fromEntries(hashes.map((h) => [h, db[h.toLowerCase()] ?? null]));
}
