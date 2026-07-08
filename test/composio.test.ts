import { describe, it, expect, vi } from "vitest";
import { createSearcher } from "../src/composio.js";
import { createFileCache } from "../src/cache.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cache = () => createFileCache(mkdtempSync(join(tmpdir(), "cx-")));

describe("createSearcher", () => {
  it("maps COMPOSIO_SEARCH_WEB answer + citations to WebSearch and caches", async () => {
    const execute = vi.fn().mockResolvedValue({
      data: { answer: "Stripe uses API keys via HTTP Basic.", citations: [{ title: "Auth", url: "https://stripe.com/docs" }] },
    });
    const s = createSearcher({ execute }, cache());
    const out = await s.search("stripe auth");
    expect(out.answer).toBe("Stripe uses API keys via HTTP Basic.");
    expect(out.results[0]).toEqual({ title: "Auth", url: "https://stripe.com/docs", snippet: "" });
    expect(execute).toHaveBeenCalledOnce();
  });
  it("drops citations without an http(s) url", async () => {
    const execute = vi.fn().mockResolvedValue({
      data: { answer: "x", citations: [{ title: "bad", url: "notaurl" }, { title: "ok", url: "https://a.com" }] },
    });
    const out = await createSearcher({ execute }, cache()).search("q");
    expect(out.results.map((r) => r.url)).toEqual(["https://a.com"]);
  });
  it("does not re-call execute on a cache hit", async () => {
    const execute = vi.fn().mockResolvedValue({ data: { answer: "", citations: [] } });
    const c = cache();
    await createSearcher({ execute }, c).search("same query");
    await createSearcher({ execute }, c).search("same query");
    expect(execute).toHaveBeenCalledOnce();
  });
  it("returns empty answer/results instead of throwing on an unexpected shape", async () => {
    const execute = vi.fn().mockResolvedValue({ data: { foo: "bar" } });
    const out = await createSearcher({ execute }, cache()).search("q");
    expect(out).toEqual({ answer: "", results: [] });
  });
});
