# Composio 100-App Research Agent — Design Spec

- **Date:** 2026-07-09
- **Owner:** Mayank Goyal (with Claude Code)
- **Status:** Approved design → implementation planning
- **Assignment:** Composio "AI Product Ops Intern" take-home. Budget 6–8h; early submission rewarded.

---

## 1. Context & goal

Composio turns apps into tools AI agents can call (managed auth + LLM-ready tool schemas + MCP, across 1,000+ apps). Before Composio builds a toolkit for an app, someone researches it: auth method, whether a developer can self-serve credentials, the API surface, whether an MCP already exists, and whether it is buildable today. This is done across hundreds of apps and does not scale by hand.

**This project is a working, honest, at-scale version of that research** over a fixed set of **100 apps** (10 categories × 10), plus proof it can be trusted and proof it can be built on.

**We deliver:**
1. A runnable **research agent** (TypeScript, Claude + Composio SDK/MCP) that fills a 100×N matrix.
2. **Verification loops** producing an honest **first-pass → verified accuracy lift** on a hand-audited sample.
3. **Clustered insights** — the headline patterns, stated plainly.
4. A single **self-explanatory HTML case-study page** deployed to **Netlify**.
5. A **live single-app Composio toolkit demo** (Notion) as proof of buildability.
6. A public **GitHub repo + README**.

## 2. Success criteria

- A reviewer understands the HTML page in **~2 minutes with no narration**.
- **Accuracy is provable**: honest first-pass → verified lift on a stratified sample, with hits AND misses shown.
- The agent genuinely **dogfoods Composio** (SDK + MCP), not just plain scraping.
- Repo runs from a clean checkout via README; a **dry-run mode** reproduces results with zero API calls.
- **Honesty**: apps that are gated or defeated the agent are reported as findings, with evidence.

## 3. Scope

**In scope:** research pipeline, 3 verification loops, clustering, the HTML page, the Notion live demo, repo + README, Netlify deploy.

**Out of scope (YAGNI):** building real Composio toolkits for all 100 apps; paid app accounts; a hosted always-on backend; user auth; multi-user support; a database (flat JSON files are enough for 100 rows).

## 4. Tech stack & secrets

| Concern | Choice |
|---|---|
| Language / runtime | TypeScript on Node (tsx for running) |
| Agent brain | Claude via `@anthropic-ai/sdk` |
| Integration layer | Composio SDK (`@composio/core`) + `@composio/anthropic` provider, plus Composio MCP |
| Web search | Composio `COMPOSIO_SEARCH` toolkit (managed) |
| Scraping | Firecrawl (via Composio Firecrawl toolkit or direct SDK) |
| Validation | `zod` |
| Page hosting | Netlify (static single HTML) |
| Source | Public GitHub repo |

**Secrets (in `.env`, never committed; `.env.example` documents them):**
`COMPOSIO_API_KEY`, `ANTHROPIC_API_KEY`, `FIRECRAWL_API_KEY`, `NOTION_TOKEN` (demo only).

> **SDK note:** exact `@composio/core` method signatures (tools.get / tools.execute / connected accounts / MCP session creation) must be verified against current docs during implementation; treat code snippets in this spec as intent, not final API.

## 5. Repo structure

```
composio-assesmnet/
├─ README.md                 # setup + how to run (incl. dry-run)
├─ package.json
├─ tsconfig.json
├─ .env.example              # documents the 4 keys
├─ .gitignore                # .env, node_modules, dist
├─ data/
│  ├─ apps.json              # the 100 apps (input, committed)
│  ├─ raw/                   # cached search+scrape per app (committed for reproducibility)
│  ├─ results.json           # first-pass answers
│  ├─ verified.json          # after verification loops
│  └─ accuracy.json          # sample audit: ground truth, hits/misses, first% → verified%
├─ src/
│  ├─ schema.ts              # zod AppResearch schema + types
│  ├─ apps.ts                # load/normalize the 100 apps
│  ├─ composio.ts            # Composio client + toolkit wiring (search, firecrawl)
│  ├─ llm.ts                 # Claude client + model selection helpers
│  ├─ research.ts            # per-app research agent (tool-calling loop → schema)
│  ├─ verify/
│  │  ├─ critic.ts           # loop 1: LLM critic re-check vs evidence
│  │  ├─ browser.ts          # loop 2: browser-use on self-serve/gated (sample + low-conf)
│  │  └─ audit.ts            # loop 3: human sample harness + accuracy scoring
│  ├─ cluster.ts             # pattern aggregations
│  ├─ pipeline.ts            # orchestrates research → verify → cluster
│  └─ demo/
│     └─ notion-demo.ts      # live single-app Composio action (Notion)
└─ site/
   ├─ build.ts               # generate self-contained index.html from data/*
   └─ template/              # HTML/CSS/JS template (inline, no external deps)
```

Commands (npm scripts): `research`, `verify`, `cluster`, `pipeline`, `site:build`, `demo:notion`, plus `--dry-run` flag that reads only `data/raw` + committed JSON.

## 6. Data schema (`AppResearch`, zod-validated)

```
id: number
name: string
website: string
category: string                       # one of the 10
one_liner: string                      # what it does, one line
auth_methods: Array<{
  method: "OAuth2" | "API key" | "Basic" | "Token" | "Other"
  notes?: string
}>
self_serve: "self-serve-free" | "self-serve-trial" | "paid-plan"
          | "admin-approval" | "partnership-contact-sales" | "unknown"
self_serve_notes?: string
api_surface: {
  type: "REST" | "GraphQL" | "SDK-only" | "none" | "unknown"
  breadth: "narrow" | "medium" | "broad" | "unknown"
  notes?: string
}
existing_mcp: { exists: "yes" | "no" | "unknown"; url?: string }
buildability: "buildable-now" | "buildable-with-caveats" | "blocked"
main_blocker: string | null
evidence: Array<{ url: string; supports: string }>   # >=1 for key claims
confidence: number                     # 0..1, agent self-reported
flags: string[]                        # e.g. "OSS-not-SaaS", "enterprise-only", "deprecated"
```

Every record is validated; on invalid output the agent retries with the validation error fed back.

## 7. Research agent (per app)

For each app, Claude runs a short **tool-calling loop** with Composio tools:
1. `COMPOSIO_SEARCH` — queries like `"{app} API docs authentication"`, `"{app} pricing free tier developer"`, `"{app} MCP server"`.
2. **Firecrawl** — scrape the hinted docs URL + the pricing/signup page.
3. Claude synthesizes → strict JSON (schema §6), citing `evidence` URLs and setting `confidence`.

- **Model:** Claude **Sonnet 5** for research/extraction (accuracy matters, volume is only 100).
- **Concurrency:** ~5–8 apps in parallel, rate-limit aware.
- **Caching:** every search/scrape response cached to `data/raw/<id>/` so reruns and `--dry-run` are deterministic and free.
- **Human-in-the-loop (reported honestly):** the agent flags low-confidence / ambiguous cases for human adjudication — expected on obscure fintech (Paygent, iPayX, fanbasis), OSS-vs-SaaS traps (Sherlock, Mermaid CLI), and enterprise-gated apps (PitchBook, NotebookLM).

## 8. Verification loops (the crux — graded hardest)

1. **LLM critic (all 100).** A second pass — Claude **Sonnet 5** (escalate to **Opus 4.8** for `confidence < 0.6`) — judges each field *supported / unsupported / contradicted* against the fetched evidence text and proposes corrections. Using a stronger/different tier as critic reduces correlated errors.
2. **Browser-use (self-serve/gated dimension; sample + low-confidence).** Actually load each target app's signup/pricing page and detect "Sign up free" vs "Contact sales / request access." This is the hardest, most business-critical call. Implementation: Firecrawl page fetch first; escalate to real browser automation (Playwright headless or Composio Browserbase toolkit) only where a static fetch is inconclusive.
3. **Human hand-audit (~15 apps).** A stratified sample — **≥1 per category + all trap apps** — hand-checked against real docs to establish ground truth.

**Accuracy scoring (`audit.ts`).** Compare first-pass vs post-loop answers to human ground truth on the sample → per-field accuracy + overall lift (e.g. "74% → 93%"). Store in `data/accuracy.json`; render honest **hits AND misses** on the page.

## 9. Insight / clustering (`cluster.ts`)

From `verified.json`, compute:
- Auth-method distribution — overall and by category.
- Self-serve vs gated split — overall and by category → **"easy wins vs outreach needed."**
- Existing-MCP coverage.
- Buildability breakdown + the single most common blocker.
- **3–5 plain-English headline takeaways** for the top of the page.

## 10. Live toolkit demo (`demo/notion-demo.ts`)

Connect **Notion** via Composio (Access-token connection) and have a Claude agent perform a real action live — create/update a page in a designated Notion page — proving an app we verdicted "buildable" actually is. Capture the tool-call log (and a short screen recording) for the page, plus a one-command runnable script. Prerequisite handled at build time: share a specific Notion page with the integration.

## 11. Deliverable page (`site/build.ts` → `index.html`)

Single self-contained HTML (inline CSS/JS, data embedded, no external requests), deployed to Netlify. Reading order:
1. **Headline patterns** — the 3–5 takeaways, prominent.
2. **Findings matrix** — 100 apps, filterable/sortable, color-coded auth + self-serve/gated.
3. **The agent** — what it does, a small architecture diagram, and where a human was needed.
4. **Proof** — the Notion live demo (embedded log/recording + link) and how to run.
5. **Verification** — accuracy-lift chart (first vs verified) + sample audit table (honest hits/misses).
6. **Limitations** — apps that defeated us, with evidence.

Visual design (look/feel) decided at build time; a live browser preview will be offered then.

## 12. Testing

- `zod` validation on every record (hard gate in the pipeline).
- Unit tests for `cluster.ts` aggregations against a fixture (deterministic).
- Snapshot test for `site/build.ts` output.
- `--dry-run` mode exercised in CI-style local check (no network, uses committed `data/raw`).

## 13. Cost & time guardrails

- Volume is modest: 100 apps × (~2 searches + ~2 scrapes + 1–2 LLM calls), critic ~100 calls, browser-use ~20. Aggressive caching keeps reruns free.
- Rough timebox: research 2h · verification 2h · page 1.5h · demo 1h · buffer 1.5h.

## 14. Risks & open questions

- **Composio search/scrape quality** on obscure apps → mitigated by Firecrawl + human audit on those.
- **Exact Composio TS SDK API** → verify against current docs during implementation.
- **Browser-use setup cost** → kept minimal by using it only where static fetch is inconclusive.
- **Trap apps** (OSS libraries, CLIs, enterprise-gated) → treated as valid findings, flagged, and surfaced in Limitations rather than forced into a misleading verdict.

## 15. Deliverables checklist (definition of done)

- [ ] `data/verified.json` for all 100 apps, schema-valid.
- [ ] `data/accuracy.json` with first→verified lift + hits/misses on ≥15-app sample.
- [ ] Clustered patterns computed and rendered.
- [ ] Notion live demo runs and is captured.
- [ ] `index.html` self-contained, deployed to Netlify (live link).
- [ ] Public GitHub repo with README (setup + dry-run).
- [ ] Page honestly reports limitations and misses.
