import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export function stableHash(input: unknown): string {
  return createHash("sha256").update(canonical(input)).digest("hex").slice(0, 32);
}

function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  const keys = Object.keys(v as object).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonical((v as Record<string, unknown>)[k])).join(",") + "}";
}

export interface Cache {
  get<T>(ns: string, key: string): Promise<T | null>;
  set<T>(ns: string, key: string, value: T): Promise<void>;
  keyFor(parts: unknown): string;
}

export function createFileCache(rootDir: string, opts: { refresh?: boolean } = {}): Cache {
  return {
    keyFor: (parts) => stableHash(parts),
    async get(ns, key) {
      if (opts.refresh) return null;
      const p = join(rootDir, ns, `${key}.json`);
      return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
    },
    async set(ns, key, value) {
      const dir = join(rootDir, ns);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${key}.json`), JSON.stringify(value, null, 2));
    },
  };
}
