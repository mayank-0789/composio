import { describe, it, expect, vi } from "vitest";
import { createScraper } from "../src/firecrawl.js";
import { createFileCache } from "../src/cache.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cache = () => createFileCache(mkdtempSync(join(tmpdir(), "fc-")));

describe("createScraper", () => {
  it("returns normalized page and caches it", async () => {
    const client = { scrapeUrl: vi.fn().mockResolvedValue({ markdown: "# Docs", metadata: { title: "T" } }) };
    const s = createScraper({ apiKey: "x", client }, cache());
    const page = await s.scrape("https://ex.com/docs");
    expect(page).toEqual({ url: "https://ex.com/docs", markdown: "# Docs", title: "T" });
    expect(client.scrapeUrl).toHaveBeenCalledOnce();
  });
  it("does not re-call the client on cache hit", async () => {
    const client = { scrapeUrl: vi.fn().mockResolvedValue({ markdown: "x", metadata: {} }) };
    const c = cache();
    const s1 = createScraper({ apiKey: "x", client }, c);
    await s1.scrape("https://ex.com/a");
    const s2 = createScraper({ apiKey: "x", client }, c);
    await s2.scrape("https://ex.com/a");
    expect(client.scrapeUrl).toHaveBeenCalledOnce();
  });
});
