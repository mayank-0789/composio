# Composio 100-App Buildability Research Agent

An agent that researches 100 SaaS apps — **auth method, self-serve vs. gated access, API
surface, existing MCP, and whether each could be an AI-agent toolkit today** — then
**verifies its own accuracy** against live docs and a hand-audited sample, and renders a
single self-contained case-study page.

Built for the Composio "AI Product Ops" take-home. It dogfoods Composio's SDK and managed
toolkits (the `COMPOSIO_SEARCH` web toolkit for research and the Notion toolkit for the live
demo), uses Claude for extraction, and Firecrawl for scraping.

**Live page:** _deployed to Netlify — link in the submission._
**Live proof:** the agent wrote to a real Notion page via Composio →
<https://mica-bat-f8b.notion.site/Composio-Toolkit-Demo-398bf69013b180fbb1f1d6592b8f153b>

## What it found (100 apps)

- **OAuth2** is the dominant auth method (71/100) — a managed-auth layer covers most of the field.
- **76/100** apps are self-serve; **70/100** are "instant wins" (self-serve credentials **and**
  buildable now). The rest need a paid plan, admin approval, or a sales conversation.
- **72** buildable now · **26** with caveats · **2** blocked outright.

## Accuracy — measured honestly

On a **15-app stratified hand-audit** (≥1 per category + every trap app), scored across 43
fields:

| | Accuracy |
|---|---|
| First pass | **81%** |
| After verification loops | **84%** (1 field corrected, 0 regressions) |

The more useful finding is *how*: **a naive LLM self-critic actually lowered accuracy** — it
wrongly flipped Stripe to "contact sales." So a correction is applied only when the critic
marks a field `contradicted` (evidence disagrees), never on a bare `unsupported`. The durable
value of verification here is **triage** (flagging what a human must check), not blanket
auto-correction. The page shows the hits, the misses, and the per-field breakdown — including
`existing_mcp`, our weakest field (~60%), which over-detects "yes".

## Setup

Requires Node >= 22.

```bash
npm install
cp .env.example .env      # optional — only needed for a cold re-run (see below)
npm test                  # 39 unit tests, tsc-clean
```

## Run

```bash
npm run pipeline -- --dry-run     # replay from committed cache — zero API calls, reproduces every number
npm run pipeline                  # cold run: research -> verify -> cluster over all 100 (re-hits web + LLM)
npm run pipeline -- --limit=5     # first 5 apps (smoke test)
npm run pipeline -- --stage=verify  # a single stage (research | verify | cluster)
npm run pipeline -- --refresh     # bust the cache and re-fetch
npm run site:build                # regenerate public/index.html from data/*.json
npm run demo:notion               # live Composio Notion toolkit demo
```

**Reproducibility.** `npm run pipeline -- --dry-run` reproduces every reported number
byte-for-byte from the committed `data/*.json` (results, verified, accuracy, clusters) — no
network, no keys. Search and LLM responses are content-addressed and committed under
`data/raw/{search,llm}`, so a cold research run largely replays for free. Scraped doc pages
(`data/raw/scrape/`) are cached locally but git-ignored — they mirror third-party docs
verbatim (including the example API keys those docs contain) and are re-fetched on a cold run;
every evidence URL is stored in each record, so sources stay checkable.

## How it works

`data/apps.json` (100 apps) → per-app Claude tool-loop over Composio Search + Firecrawl-scraped
docs → strict zod schema (`src/schema.ts`) → three verification loops → clustering →
`site/build.ts` → `public/index.html` (inline CSS/JS, data embedded, no external requests).

**Verification loops**

- **Loop 1 — LLM critic (`src/verify/critic.ts`).** A second Claude pass (Opus for low-confidence
  cases) judges each field *supported / unsupported / contradicted* against the scraped evidence.
  Edits are **gated to `contradicted`** so a merely-unsupported hunch can't override an
  evidence-backed first pass.
- **Loop 2 — self-serve check (`src/verify/browser.ts`).** Loads the pricing/signup page. It only
  *confirms* self-serve access — a bare "contact sales" on a marketing page never downgrades an
  answer, since enterprise sales coexists with self-serve.
- **Loop 3 — human audit (`src/verify/audit.ts`).** A hand-audited sample (`data/ground-truth.json`)
  sets ground truth; the scorer reports first-pass vs. verified accuracy and every remaining miss.

## Layout

```
src/      pipeline modules (schema, cache, SDK wrappers, research, verify/, cluster, pipeline)
src/demo/ live Composio Notion toolkit demo
site/     self-contained HTML case-study renderer
test/     vitest unit tests (39)
data/     apps.json input + committed cache & generated outputs
```
