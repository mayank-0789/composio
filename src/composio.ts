import { Composio } from "@composio/core";
import type { Cache } from "./cache.js";

export type SearchResult = { title: string; url: string; snippet: string };
export type WebSearch = { answer: string; results: SearchResult[] };
export type ExecFn = (slug: string, args: object) => Promise<any>;
export interface Searcher { search(query: string): Promise<WebSearch>; }

export function createComposio(apiKey: string): { execute: ExecFn; raw: Composio } {
  const raw = new Composio({ apiKey });
  const execute: ExecFn = (slug, args) =>
    raw.tools.execute(slug, {
      userId: "research-agent",
      arguments: args as any,
      version: "latest",
      dangerouslySkipVersionCheck: true,
    });
  return { execute, raw };
}

export function createSearcher(deps: { execute: ExecFn }, cache: Cache): Searcher {
  return {
    async search(query) {
      const key = cache.keyFor({ query });
      const hit = await cache.get<WebSearch>("search", key);
      if (hit) return hit;
      const res = await deps.execute("COMPOSIO_SEARCH_WEB", { query });
      const data = res?.data ?? {};
      const answer: string = typeof data.answer === "string" ? data.answer : "";
      const citations: unknown[] = Array.isArray(data.citations) ? data.citations : [];
      const results: SearchResult[] = citations
        .map((c: any) => ({ title: c.title ?? "", url: c.url ?? c.id ?? "", snippet: c.snippet ?? c.content ?? "" }))
        .filter((r: SearchResult) => /^https?:\/\//i.test(r.url));
      const out: WebSearch = { answer, results };
      await cache.set("search", key, out);
      return out;
    },
  };
}
