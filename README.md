# Composio 100-App Buildability Research Agent

An agent that researches 100 SaaS apps — auth method, self-serve vs gated access, API
surface, existing MCP, and whether each could be an AI-agent toolkit today — then
**verifies its own accuracy** and renders a single self-contained case-study page.

Built for the Composio "AI Product Ops" take-home. It dogfoods Composio's own SDK + MCP,
uses Claude for extraction, and Firecrawl for scraping.

## Status

Pipeline core is complete and unit-tested (27 tests, `tsc` clean). The live 100-app run,
the Notion toolkit demo, and the Netlify deploy run once LLM API billing is enabled.

## Setup

Requires Node >= 20.

```bash
npm install
cp .env.example .env      # then fill in the 4 keys below
npm test
```

`.env` keys: `COMPOSIO_API_KEY`, `ANTHROPIC_API_KEY`, `FIRECRAWL_API_KEY`, `NOTION_TOKEN`.

## Run the research agent

```bash
npm run pipeline                  # research -> verify -> cluster over all 100
npm run pipeline -- --limit=5     # first 5 apps (smoke test)
npm run pipeline -- --stage=research   # a single stage (research | verify | cluster)
npm run pipeline -- --dry-run     # replay from cached data, zero API calls
npm run pipeline -- --refresh     # bust the cache and re-fetch
npm run site:build                # generate public/index.html from data/*.json
npm run demo:notion               # live Composio Notion toolkit demo
```

## How it works

`data/apps.json` (100 apps) → per-app Claude tool-loop over Composio Search + Firecrawl →
strict zod schema (`src/schema.ts`) → verification loops → clustering →
`site/build.ts` → `public/index.html`.

Every search/scrape/LLM call is cached under `data/raw/`, so replay and `--dry-run` are
deterministic and free; a cold run re-hits the network.

## Verification

- **Loop 1 (critic):** a stronger Claude pass re-checks every field against its evidence.
- **Loop 2 (browser):** loads pricing/signup pages to settle self-serve vs gated.
- **Loop 3 (human):** a hand-audited sample (`data/ground-truth.json`) sets ground truth;
  `src/verify/audit.ts` scores first-pass vs verified accuracy and lists the misses.

## Layout

```
src/      pipeline modules (schema, cache, SDK wrappers, research, verify/, cluster, pipeline)
site/     self-contained HTML case-study renderer
test/     vitest unit tests
data/     apps.json input + cached & generated outputs
docs/     design spec + task-by-task implementation plan
```
