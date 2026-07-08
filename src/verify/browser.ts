import { z } from "zod";
import { SelfServe, AppInput } from "../schema.js";
import type { Scraper } from "../firecrawl.js";
import type { Llm } from "../llm.js";

type SelfServeValue = z.infer<typeof SelfServe>;
export type SelfServeCheck = { app_id: number; self_serve: SelfServeValue; signal: string; evidence_url: string };

export function classifySelfServe(md: string): { hint: SelfServeValue; matched: string } | null {
  const t = md.toLowerCase();
  const free = ["start for free", "sign up free", "sign up for free", "free tier", "get your api key", "create a free account", "free plan"];
  const trial = ["free trial", "start your trial", "try free for", "start free trial"];
  const gated = ["contact sales", "request access", "request a demo", "talk to sales", "contact us for pricing", "book a demo"];
  for (const p of free) if (t.includes(p)) return { hint: "self-serve-free", matched: p };
  for (const p of trial) if (t.includes(p)) return { hint: "self-serve-trial", matched: p };
  for (const p of gated) if (t.includes(p)) return { hint: "partnership-contact-sales", matched: p };
  return null;
}

const TieBreak = z.object({ self_serve: SelfServe, signal: z.string() });

export async function checkSelfServe(
  app: AppInput, pricingUrl: string, deps: { scrape: Scraper; llm: Llm },
): Promise<SelfServeCheck> {
  const page = await deps.scrape.scrape(pricingUrl).catch(() => null);
  const md = page?.markdown ?? "";
  const heur = classifySelfServe(md);
  if (heur) return { app_id: app.id, self_serve: heur.hint, signal: `heuristic: "${heur.matched}"`, evidence_url: pricingUrl };
  const out = await deps.llm.extract({
    model: "claude-sonnet-5", schemaName: "TieBreak", schema: TieBreak,
    system: "Decide how a developer obtains API credentials for this app from its pricing/signup page. Choose the closest self_serve value.",
    user: `App: ${app.name}\nPage (${pricingUrl}):\n${md.slice(0, 4000)}`,
  });
  return { app_id: app.id, self_serve: out.self_serve, signal: `llm: ${out.signal}`, evidence_url: pricingUrl };
}
