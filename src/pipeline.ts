import "dotenv/config";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { loadApps } from "./apps.js";
import { AppResearch } from "./schema.js";
import { createFileCache } from "./cache.js";
import { createComposio, createSearcher } from "./composio.js";
import { createScraper } from "./firecrawl.js";
import { createLlm } from "./llm.js";
import { researchApp } from "./research.js";
import { criticReview } from "./verify/critic.js";
import { checkSelfServe } from "./verify/browser.js";
import { checkMcp } from "./verify/mcp.js";
import { scoreAccuracy, type GroundTruth } from "./verify/audit.js";
import { computeClusters } from "./cluster.js";

const STAGES = ["all", "research", "verify", "cluster"] as const;
type Stage = (typeof STAGES)[number];
const CONCURRENCY = 5;

export function parseArgs(argv: string[]) {
  const has = (f: string) => argv.includes(f);
  const val = (k: string) => argv.find((a) => a.startsWith(`${k}=`))?.split("=")[1];
  const rawStage = val("--stage");
  const stage: Stage = (STAGES as readonly string[]).includes(rawStage ?? "") ? (rawStage as Stage) : "all";
  const limNum = val("--limit") !== undefined ? Number(val("--limit")) : undefined;
  const limit = limNum !== undefined && Number.isFinite(limNum) && limNum > 0 ? limNum : undefined;
  return { stage, dryRun: has("--dry-run"), refresh: has("--refresh"), limit };
}

async function inBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...await Promise.all(items.slice(i, i + size).map(fn)));
  }
  return out;
}

function env(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env ${k}`);
  return v;
}

async function runResearch(opts: { dryRun: boolean; refresh: boolean; limit?: number }) {
  if (opts.dryRun) { console.log("dry-run: skipping research, keeping data/results.json"); return; }
  const cache = createFileCache("data/raw", { refresh: opts.refresh });
  const { execute } = createComposio(env("COMPOSIO_API_KEY"));
  const deps = {
    search: createSearcher({ execute }, cache),
    scrape: createScraper({ apiKey: env("FIRECRAWL_API_KEY") }, cache),
    llm: createLlm({ apiKey: process.env.ANTHROPIC_API_KEY }, cache),
  };
  let apps = loadApps();
  if (opts.limit) apps = apps.slice(0, opts.limit);
  const results = await inBatches(apps, CONCURRENCY, async (app) => {
    try { const r = await researchApp(app, deps); console.log(`ok ${app.id} ${app.name}`); return r; }
    catch (e) { console.error(`FAIL ${app.id} ${app.name}: ${(e as Error).message}`); return null; }
  });
  const out = results.filter((x): x is AppResearch => x !== null).sort((a, b) => a.id - b.id);
  writeFileSync("data/results.json", JSON.stringify(out, null, 2));
  console.log(`research done: ${out.length}/${apps.length}`);
}

async function runVerify(opts: { dryRun: boolean; refresh: boolean }) {
  const records = AppResearch.array().parse(JSON.parse(readFileSync("data/results.json", "utf8")));
  const truth: GroundTruth[] = existsSync("data/ground-truth.json")
    ? JSON.parse(readFileSync("data/ground-truth.json", "utf8")) : [];
  const truthIds = new Set(truth.map((t) => t.app_id));
  const needsCritic = (r: AppResearch) => truthIds.has(r.id) || r.confidence < 0.6 || r.buildability !== "buildable-now";
  if (!opts.dryRun) {
    const cache = createFileCache("data/raw", { refresh: opts.refresh });
    const llm = createLlm({ apiKey: process.env.ANTHROPIC_API_KEY }, cache);
    const scraper = createScraper({ apiKey: env("FIRECRAWL_API_KEY") }, cache);
    const { execute } = createComposio(env("COMPOSIO_API_KEY"));
    const searcher = createSearcher({ execute }, cache);
    const revised = await inBatches(records, CONCURRENCY, async (r) => {
      if (!needsCritic(r)) return r;
      const pages = await Promise.all(r.evidence.map((e) =>
        scraper.scrape(e.url)
          .then((p) => `--- ${e.url} ---\n${p.markdown.slice(0, 4000)}`)
          .catch(() => `--- ${e.url} --- (unavailable)`)));
      let rev: AppResearch;
      try { rev = (await criticReview(r, pages.join("\n\n"), { llm })).revised; }
      catch (e) { console.error(`critic fell back to first-pass for ${r.id} ${r.name}: ${(e as Error).message}`); rev = r; }
      if (rev.confidence < 0.6) {
        const homepage = `https://${rev.website.split("/")[0]}`;
        try {
          const check = await checkSelfServe(rev, homepage, { scrape: scraper, llm });
          // Loop 2 only *confirms* self-serve access (a strong positive signal). A bare "contact sales"
          // on a marketing page is not evidence against self-serve — enterprise sales coexists with it —
          // so we never downgrade toward gated on that alone.
          const confirmsSelfServe = check.self_serve === "self-serve-free" || check.self_serve === "self-serve-trial";
          if (confirmsSelfServe && check.self_serve !== rev.self_serve) {
            rev = { ...rev, self_serve: check.self_serve, self_serve_notes: `[loop2] ${check.signal} @ ${check.evidence_url}` };
          }
        } catch {}
      }
      try {
        const mcp = await checkMcp(rev, { search: searcher, llm });
        rev = { ...rev, existing_mcp: { exists: mcp.exists, ...(mcp.url && /^https?:\/\//i.test(mcp.url) ? { url: mcp.url } : {}) } };
      } catch {}
      console.log(`verified ${r.id} ${r.name}`);
      return rev;
    });
    revised.sort((a, b) => a.id - b.id);
    writeFileSync("data/verified.json", JSON.stringify(revised, null, 2));
  }
  const verified = AppResearch.array().parse(JSON.parse(readFileSync("data/verified.json", "utf8")));
  const firstPass = scoreAccuracy(records, truth);
  const afterLoops = scoreAccuracy(verified, truth);
  writeFileSync("data/accuracy.json", JSON.stringify({ firstPass, afterLoops }, null, 2));
  console.log(`critiqued ${records.filter(needsCritic).length}/100 | accuracy: first=${(firstPass.overall * 100).toFixed(0)}% verified=${(afterLoops.overall * 100).toFixed(0)}%`);
}

function runCluster() {
  const verified = AppResearch.array().parse(JSON.parse(readFileSync("data/verified.json", "utf8")));
  writeFileSync("data/clusters.json", JSON.stringify(computeClusters(verified), null, 2));
  console.log("clusters written");
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.stage === "all" || opts.stage === "research") await runResearch(opts);
  if (opts.stage === "all" || opts.stage === "verify") await runVerify(opts);
  if (opts.stage === "all" || opts.stage === "cluster") runCluster();
}

const invokedDirectly = process.argv[1]?.endsWith("pipeline.ts");
if (invokedDirectly) main().catch((e) => { console.error(e); process.exit(1); });
