import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { StorageDriver } from "./types";

// Files outside /public: Next.js only serves public/ files that existed at build time.
const ROOT = path.join(process.cwd(), ".uploads");

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};
const TYPE = Object.fromEntries(Object.entries(EXT).map(([type, ext]) => [ext, type]));

function resolveKey(key: string): string | null {
  if (!/^[a-f0-9-]{36}\.(png|jpg|gif|webp)$/.test(key)) return null;
  return path.join(ROOT, key);
}

/** Stores images on the server's disk. Fine for local development and single-server hosting. */
export const localDriver: StorageDriver = {
  id: "disk",

  async put({ data, contentType }) {
    const ext = EXT[contentType];
    if (!ext) throw new Error(`Unsupported content type ${contentType}`);
    const key = `${randomUUID()}.${ext}`;
    await mkdir(ROOT, { recursive: true });
    await writeFile(path.join(ROOT, key), data);
    return { key };
  },

  async get(key) {
    const file = resolveKey(key);
    if (!file) return null;
    try {
      const data = await readFile(file);
      return { data, contentType: TYPE[key.split(".").pop()!] };
    } catch {
      return null;
    }
  },

  async delete(key) {
    const file = resolveKey(key);
    if (file) await unlink(file).catch(() => {});
  },
};
