import { describe, it, expect, vi } from "vitest";
import { createSearcher } from "../src/composio.js";
import { createFileCache } from "../src/cache.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cache = () => createFileCache(mkdtempSync(join(tmpdir(), "cx-")));

describe("createSearcher", () => {
  it("maps COMPOSIO_SEARCH results to SearchResult[] and caches", async () => {
    const execute = vi.fn().mockResolvedValue({
      data: { results: [{ title: "Docs", url: "https://x.com", content: "auth via api key" }] },
    });
    const s = createSearcher({ execute }, cache());
    const out = await s.search("x API auth");
    expect(out[0]).toEqual({ title: "Docs", url: "https://x.com", snippet: "auth via api key" });
    expect(execute).toHaveBeenCalledOnce();
  });
});
