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
import { scoreAccuracy, type GroundTruth } from "./verify/audit.js";
import { computeClusters } from "./cluster.js";

const STAGES = ["all", "research", "verify", "cluster"] as const;
type Stage = (typeof STAGES)[number];

export function parseArgs(argv: string[]) {
  const has = (f: string) => argv.includes(f);
  const val = (k: string) => argv.find((a) => a.startsWith(`${k}=`))?.split("=")[1];
  const rawStage = val("--stage");
  const stage: Stage = (STAGES as readonly string[]).includes(rawStage ?? "") ? (rawStage as Stage) : "all";
  const limNum = val("--limit") !== undefined ? Number(val("--limit")) : undefined;
  const limit = limNum !== undefined && Number.isFinite(limNum) && limNum > 0 ? limNum : undefined;
  return { stage, dryRun: has("--dry-run"), refresh: has("--refresh"), limit };
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
    llm: createLlm({ apiKey: env("ANTHROPIC_API_KEY") }, cache),
  };
  let apps = loadApps();
  if (opts.limit) apps = apps.slice(0, opts.limit);
  const out: AppResearch[] = [];
  for (const app of apps) {
    try { out.push(await researchApp(app, deps)); console.log(`ok ${app.id} ${app.name}`); }
    catch (e) { console.error(`FAIL ${app.id} ${app.name}: ${(e as Error).message}`); }
  }
  writeFileSync("data/results.json", JSON.stringify(out, null, 2));
}

async function runVerify(opts: { dryRun: boolean; refresh: boolean }) {
  const records = AppResearch.array().parse(JSON.parse(readFileSync("data/results.json", "utf8")));
  if (!opts.dryRun) {
    const cache = createFileCache("data/raw", { refresh: opts.refresh });
    const llm = createLlm({ apiKey: env("ANTHROPIC_API_KEY") }, cache);
    const scraper = createScraper({ apiKey: env("FIRECRAWL_API_KEY") }, cache);
    const revised: AppResearch[] = [];
    for (const r of records) {
      const pages = await Promise.all(r.evidence.map((e) =>
        scraper.scrape(e.url)
          .then((p) => `--- ${e.url} ---\n${p.markdown.slice(0, 4000)}`)
          .catch(() => `--- ${e.url} --- (unavailable)`)));
      const evidenceText = pages.join("\n\n");
      let rev: AppResearch;
      try { rev = (await criticReview(r, evidenceText, { llm })).revised; }
      catch { rev = r; }
      if (rev.confidence < 0.6) {
        const homepage = `https://${rev.website.split("/")[0]}`;
        try {
          const check = await checkSelfServe(rev, homepage, { scrape: scraper, llm });
          rev = { ...rev, self_serve: check.self_serve, self_serve_notes: `[loop2] ${check.signal} @ ${check.evidence_url}` };
        } catch {}
      }
      revised.push(rev);
      console.log(`verified ${r.id} ${r.name}`);
    }
    writeFileSync("data/verified.json", JSON.stringify(revised, null, 2));
  }
  const verified = AppResearch.array().parse(JSON.parse(readFileSync("data/verified.json", "utf8")));
  const truth: GroundTruth[] = existsSync("data/ground-truth.json")
    ? JSON.parse(readFileSync("data/ground-truth.json", "utf8")) : [];
  const firstPass = scoreAccuracy(records, truth);
  const afterLoops = scoreAccuracy(verified, truth);
  writeFileSync("data/accuracy.json", JSON.stringify({ firstPass, afterLoops }, null, 2));
}

function runCluster() {
  const verified = AppResearch.array().parse(JSON.parse(readFileSync("data/verified.json", "utf8")));
  writeFileSync("data/clusters.json", JSON.stringify(computeClusters(verified), null, 2));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.stage === "all" || opts.stage === "research") await runResearch(opts);
  if (opts.stage === "all" || opts.stage === "verify") await runVerify(opts);
  if (opts.stage === "all" || opts.stage === "cluster") runCluster();
}

const invokedDirectly = process.argv[1]?.endsWith("pipeline.ts");
if (invokedDirectly) main().catch((e) => { console.error(e); process.exit(1); });
