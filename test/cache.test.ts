import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFileCache, stableHash } from "../src/cache.js";

const cache = () => createFileCache(mkdtempSync(join(tmpdir(), "cache-")));

describe("stableHash", () => {
  it("is order-independent", () => {
    expect(stableHash({ a: 1, b: 2 })).toBe(stableHash({ b: 2, a: 1 }));
  });
  it("differs on different content", () => {
    expect(stableHash({ a: 1 })).not.toBe(stableHash({ a: 2 }));
  });
});

describe("createFileCache", () => {
  it("round-trips a value", async () => {
    const c = cache();
    await c.set("search", "k1", { hits: [1, 2] });
    expect(await c.get("search", "k1")).toEqual({ hits: [1, 2] });
  });
  it("misses on unknown key", async () => {
    const c = cache();
    expect(await c.get("search", "nope")).toBeNull();
  });
  it("refresh mode forces get-miss but still writes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cache-"));
    const write = createFileCache(dir);
    await write.set("llm", "k", { v: 1 });
    const refresh = createFileCache(dir, { refresh: true });
    expect(await refresh.get("llm", "k")).toBeNull();
    await refresh.set("llm", "k", { v: 2 });
    const read = createFileCache(dir);
    expect(await read.get("llm", "k")).toEqual({ v: 2 });
  });
});
