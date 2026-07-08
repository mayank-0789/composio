import FirecrawlApp from "@mendable/firecrawl-js";
import type { Cache } from "./cache.js";

export type ScrapedPage = { url: string; markdown: string; title?: string };
export interface FirecrawlLike {
  scrapeUrl(url: string, opts: object): Promise<{ markdown?: string; metadata?: { title?: string } }>;
}
export interface Scraper { scrape(url: string): Promise<ScrapedPage>; }

export function createScraper(deps: { apiKey: string; client?: FirecrawlLike }, cache: Cache): Scraper {
  const client: FirecrawlLike = deps.client ?? (new FirecrawlApp({ apiKey: deps.apiKey }) as unknown as FirecrawlLike);
  return {
    async scrape(url) {
      const key = cache.keyFor({ url });
      const hit = await cache.get<ScrapedPage>("scrape", key);
      if (hit) return hit;
      const res = await client.scrapeUrl(url, { formats: ["markdown"] });
      const page: ScrapedPage = { url, markdown: res.markdown ?? "", title: res.metadata?.title };
      if (page.markdown) await cache.set("scrape", key, page);
      return page;
    },
  };
}
