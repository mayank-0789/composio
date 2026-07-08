import { Composio } from "@composio/core";
import type { Cache } from "./cache.js";

export type SearchResult = { title: string; url: string; snippet: string };
export type ExecFn = (slug: string, args: object) => Promise<any>;
export interface Searcher { search(query: string): Promise<SearchResult[]>; }

export function createComposio(apiKey: string): { execute: ExecFn; raw: Composio } {
  const raw = new Composio({ apiKey });
  const execute: ExecFn = (slug, args) =>
    raw.tools.execute(slug, { userId: "research-agent", arguments: args as any });
  return { execute, raw };
}

export function createSearcher(deps: { execute: ExecFn }, cache: Cache): Searcher {
  return {
    async search(query) {
      const key = cache.keyFor({ query });
      const hit = await cache.get<SearchResult[]>("search", key);
      if (hit) return hit;
      const res = await deps.execute("COMPOSIO_SEARCH_SEARCH", { query });
      const rows = res?.data?.results ?? res?.data ?? [];
      const out: SearchResult[] = rows.map((r: any) => ({
        title: r.title ?? "", url: r.url ?? r.link ?? "", snippet: r.content ?? r.snippet ?? "",
      }));
      await cache.set("search", key, out);
      return out;
    },
  };
}
