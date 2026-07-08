import { AppResearch, AppInput } from "./schema.js";
import type { Searcher } from "./composio.js";
import type { Scraper } from "./firecrawl.js";
import type { Llm } from "./llm.js";

const Extracted = AppResearch.omit({ id: true, name: true, website: true, category: true });

export function buildResearchPrompt(app: AppInput, evidence: string): { system: string; user: string } {
  const system =
    "You research SaaS apps for an AI-agent tooling company. Given search snippets and scraped docs, " +
    "determine auth methods, whether a developer can self-serve credentials, the API surface, whether an " +
    "MCP server exists, and whether an agent toolkit is buildable today. Cite evidence URLs from the material. " +
    "Set confidence honestly (low when the material is thin). Prefer 'unknown' over guessing.";
  const user = `App: ${app.name} (${app.website}), category ${app.category}.\n\nEVIDENCE:\n${evidence}`;
  return { system, user };
}

export async function researchApp(
  app: AppInput,
  deps: { search: Searcher; scrape: Scraper; llm: Llm },
): Promise<AppResearch> {
  const queries = [
    `${app.name} API documentation authentication`,
    `${app.name} pricing free tier developer API access`,
    `${app.name} MCP server model context protocol`,
  ];
  const searchHits = (await Promise.all(queries.map((q) => deps.search.search(q)))).flat();
  const urls = dedupe(searchHits.map((h) => h.url).filter(Boolean)).slice(0, 4);
  const pages = await Promise.all(urls.map((u) => deps.scrape.scrape(u).catch(() => null)));

  const evidence = [
    ...searchHits.slice(0, 12).map((h) => `- ${h.title} — ${h.url}\n  ${h.snippet}`),
    ...pages.filter((p): p is NonNullable<typeof p> => p !== null).map((p) => `--- ${p.url} ---\n${p.markdown.slice(0, 4000)}`),
  ].join("\n\n");

  const { system, user } = buildResearchPrompt(app, evidence);
  const partial = await deps.llm.extract({
    model: "claude-sonnet-5", system, user, schema: Extracted, schemaName: "AppResearchExtract",
  });
  return AppResearch.parse({ ...partial, id: app.id, name: app.name, website: app.website, category: app.category });
}

function dedupe(xs: string[]): string[] { return [...new Set(xs)]; }
