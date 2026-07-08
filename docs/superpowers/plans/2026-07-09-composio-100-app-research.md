# Composio 100-App Research Agent — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TypeScript agent that researches 100 apps (auth, self-serve, API surface, MCP, buildability) using Composio's SDK + MCP and Claude, verifies its own accuracy with layered loops, clusters the results into patterns, and renders one self-contained HTML case study — plus a live Notion toolkit demo.

**Architecture:** A dependency-injected pipeline. Thin SDK wrappers (`composio.ts`, `llm.ts`) sit behind narrow interfaces so all higher-level logic (`research.ts`, `verify/*`, `cluster.ts`, `pipeline.ts`) is pure and unit-testable with mocks. A two-layer content-addressed cache (web I/O + LLM output) makes replay byte-identical and free; a cold run re-hits the network. Data flows `apps.json → research → verify → cluster → site/build → index.html`.

**Tech Stack:** TypeScript (ESM), Node ≥ 20, tsx (run), vitest (test), zod (validation), `@composio/core` + `@composio/anthropic` (Composio SDK + MCP), `@anthropic-ai/sdk` (Claude), `@mendable/firecrawl-js` (scraping).

## Global Constraints

- **Comments:** default to NONE. At most a single-line `//` comment, only where intent isn't obvious. Never multi-line comment blocks or restatements of the code. (Applies to plan code too.)
- **Quality gate:** after each task, an independent reviewer/verifier agent checks the deliverable before it's marked done (spawn `Explore`/`general-purpose` or run `/code-review`). Do not self-certify nontrivial code.
- **Models (pinned, exact strings):** research/extraction = `claude-sonnet-5`; escalated critic (confidence < 0.6) = `claude-opus-4-8`. Always `temperature: 0`.
- **Determinism:** every network + LLM call goes through the cache. Replay/`--dry-run` recomputes nothing. Commit `data/raw/` and the output JSONs so the reported run is reproducible.
- **Secrets:** `COMPOSIO_API_KEY`, `ANTHROPIC_API_KEY`, `FIRECRAWL_API_KEY`, `NOTION_TOKEN` — read from `.env` (via `process.env`), never hard-coded, never committed. `.env` is gitignored.
- **Module style:** ESM (`"type": "module"`), named exports, one responsibility per file. All I/O-bound modules take collaborators as constructor/factory args (DI) so tests inject fakes.
- **No placeholders in shipped code:** no `any` where a type is known; validate every external payload with zod before use.

---

## File Structure

| File | Responsibility |
|---|---|
| `package.json`, `tsconfig.json`, `vitest.config.ts` | project + test config, npm scripts |
| `.env.example` | documents the 4 keys |
| `data/apps.json` | the 100 apps (input, committed) |
| `data/raw/<id>/*` | cached search + scrape + llm output (committed after real run) |
| `data/{results,verified,accuracy,clusters}.json` | pipeline outputs |
| `data/ground-truth.json` | human hand-audit for the sample (committed) |
| `src/schema.ts` | zod schemas + inferred types (the data contract) |
| `src/apps.ts` | load/validate `apps.json` |
| `src/cache.ts` | content-addressed two-layer file cache + `stableHash` |
| `src/composio.ts` | Composio SDK wrapper → `ResearchTools` (search) + Notion tools |
| `src/firecrawl.ts` | Firecrawl wrapper → `scrape` |
| `src/llm.ts` | Claude wrapper → schema-validated `extract` |
| `src/research.ts` | per-app research orchestration → `AppResearch` |
| `src/verify/critic.ts` | loop 1: LLM critic vs evidence |
| `src/verify/browser.ts` | loop 2: self-serve/gated check from pricing page |
| `src/verify/audit.ts` | loop 3 scoring: accuracy + misses (pure) |
| `src/cluster.ts` | pattern aggregations (pure) |
| `src/pipeline.ts` | orchestrate research → verify → cluster; CLI flags |
| `src/demo/notion-demo.ts` | live Composio+MCP Notion action |
| `site/build.ts` | render `index.html` from data (pure) |
| `site/template.ts` | HTML/CSS string builder helpers |
| `README.md` | setup + how to run (incl. dry-run) |
| `netlify.toml` | publish dir + no-build static config |

---

## Task 1: Project scaffold + apps.json + test harness

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.env.example`, `data/apps.json`
- Test: `test/scaffold.test.ts`

**Interfaces:**
- Produces: npm scripts `test`, `research`, `verify`, `cluster`, `pipeline`, `site:build`, `demo:notion`; committed `data/apps.json` (array of `{id:number,name:string,website:string,category:string}`, length 100).

- [ ] **Step 1: Write the failing test**

```ts
// test/scaffold.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("scaffold", () => {
  it("apps.json has 100 valid rows", () => {
    const apps = JSON.parse(readFileSync("data/apps.json", "utf8"));
    expect(apps).toHaveLength(100);
    for (const a of apps) {
      expect(typeof a.id).toBe("number");
      expect(a.name.length).toBeGreaterThan(0);
      expect(a.website.length).toBeGreaterThan(0);
      expect(a.category.length).toBeGreaterThan(0);
    }
    expect(new Set(apps.map((a: any) => a.id)).size).toBe(100);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/scaffold.test.ts`
Expected: FAIL — `data/apps.json` does not exist.

- [ ] **Step 3: Create config files**

`package.json`:
```json
{
  "name": "composio-100-app-research",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "vitest run",
    "research": "tsx src/pipeline.ts --stage=research",
    "verify": "tsx src/pipeline.ts --stage=verify",
    "cluster": "tsx src/pipeline.ts --stage=cluster",
    "pipeline": "tsx src/pipeline.ts",
    "site:build": "tsx site/build.ts",
    "demo:notion": "tsx src/demo/notion-demo.ts"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.30.0",
    "@composio/core": "^0.1.0",
    "@composio/anthropic": "^0.1.0",
    "@mendable/firecrawl-js": "^1.0.0",
    "dotenv": "^16.4.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "@types/node": "^22.0.0"
  }
}
```
> `@composio/*` version floors are placeholders — Step 4 pins the real latest.

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["node"],
    "outDir": "dist"
  },
  "include": ["src", "site", "test"]
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node", include: ["test/**/*.test.ts"] } });
```

`.env.example`:
```
COMPOSIO_API_KEY=
ANTHROPIC_API_KEY=
FIRECRAWL_API_KEY=
NOTION_TOKEN=
```

- [ ] **Step 4: Install deps and pin Composio**

Run: `npm install` then `npm install @composio/core@latest @composio/anthropic@latest`
Expected: lockfile written; note the resolved `@composio/*` versions for Task 4.

- [ ] **Step 5: Create data/apps.json**

Transcribe all 100 apps from the assignment table into `data/apps.json`. Shape per row: `{ "id": 1, "name": "Salesforce", "website": "salesforce.com", "category": "CRM and Sales" }`. Use the 10 category names exactly as in the assignment ("CRM and Sales", "Support and Helpdesk", "Communications and Messaging", "Marketing, Ads, Email and Social", "Ecommerce", "Data, SEO and Scraping", "Developer, Infra and Data platforms", "Productivity and Project Management", "Finance and Fintech", "AI, Research and Media-native"). ids 1–100 in the table's order.

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run test/scaffold.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts .env.example data/apps.json test/scaffold.test.ts package-lock.json
git commit -m "chore: scaffold project + 100-app dataset + test harness"
```

---

## Task 2: Data schema (`src/schema.ts`)

**Files:**
- Create: `src/schema.ts`
- Test: `test/schema.test.ts`

**Interfaces:**
- Produces: `AppInput` (type + zod), `AppResearch` (type + zod), enums `AuthMethod`, `SelfServe`, `ApiType`, `Breadth`, `Buildability`; helper `parseAppResearch(input: unknown): AppResearch`.

- [ ] **Step 1: Write the failing test**

```ts
// test/schema.test.ts
import { describe, it, expect } from "vitest";
import { AppResearch, parseAppResearch } from "../src/schema.js";

const valid = {
  id: 1, name: "Stripe", website: "stripe.com", category: "Finance and Fintech",
  one_liner: "Payments API.",
  auth_methods: [{ method: "API key" }],
  self_serve: "self-serve-free",
  api_surface: { type: "REST", breadth: "broad" },
  existing_mcp: { exists: "no" },
  buildability: "buildable-now",
  main_blocker: null,
  evidence: [{ url: "https://stripe.com/docs/api", supports: "REST API + API key auth" }],
  confidence: 0.9, flags: [],
};

describe("AppResearch schema", () => {
  it("accepts a valid record", () => {
    expect(() => parseAppResearch(valid)).not.toThrow();
  });
  it("rejects unknown self_serve enum", () => {
    expect(() => parseAppResearch({ ...valid, self_serve: "maybe" })).toThrow();
  });
  it("requires at least one evidence item", () => {
    expect(() => parseAppResearch({ ...valid, evidence: [] })).toThrow();
  });
  it("clamps confidence to 0..1", () => {
    expect(() => parseAppResearch({ ...valid, confidence: 1.5 })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/schema.test.ts`
Expected: FAIL — cannot import `../src/schema.js`.

- [ ] **Step 3: Write the implementation**

```ts
// src/schema.ts
import { z } from "zod";

export const AuthMethod = z.enum(["OAuth2", "API key", "Basic", "Token", "Other"]);
export const SelfServe = z.enum([
  "self-serve-free", "self-serve-trial", "paid-plan",
  "admin-approval", "partnership-contact-sales", "unknown",
]);
export const ApiType = z.enum(["REST", "GraphQL", "SDK-only", "none", "unknown"]);
export const Breadth = z.enum(["narrow", "medium", "broad", "unknown"]);
export const Buildability = z.enum(["buildable-now", "buildable-with-caveats", "blocked"]);

export const AppInput = z.object({
  id: z.number(), name: z.string().min(1),
  website: z.string().min(1), category: z.string().min(1),
});
export type AppInput = z.infer<typeof AppInput>;

export const AppResearch = z.object({
  id: z.number(),
  name: z.string(),
  website: z.string(),
  category: z.string(),
  one_liner: z.string().min(1),
  auth_methods: z.array(z.object({ method: AuthMethod, notes: z.string().optional() })).min(1),
  self_serve: SelfServe,
  self_serve_notes: z.string().optional(),
  api_surface: z.object({ type: ApiType, breadth: Breadth, notes: z.string().optional() }),
  existing_mcp: z.object({ exists: z.enum(["yes", "no", "unknown"]), url: z.string().url().optional() }),
  buildability: Buildability,
  main_blocker: z.string().nullable(),
  evidence: z.array(z.object({ url: z.string().url(), supports: z.string() })).min(1),
  confidence: z.number().min(0).max(1),
  flags: z.array(z.string()),
});
export type AppResearch = z.infer<typeof AppResearch>;

export function parseAppResearch(input: unknown): AppResearch {
  return AppResearch.parse(input);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/schema.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/schema.ts test/schema.test.ts
git commit -m "feat: add AppResearch zod schema + types"
```

---

## Task 3: Apps loader (`src/apps.ts`)

**Files:**
- Create: `src/apps.ts`
- Test: `test/apps.test.ts`

**Interfaces:**
- Consumes: `AppInput` from `src/schema.ts`.
- Produces: `loadApps(path?: string): AppInput[]` (default path `data/apps.json`, validates each row).

- [ ] **Step 1: Write the failing test**

```ts
// test/apps.test.ts
import { describe, it, expect } from "vitest";
import { loadApps } from "../src/apps.js";

describe("loadApps", () => {
  it("loads and validates 100 apps", () => {
    const apps = loadApps();
    expect(apps).toHaveLength(100);
    expect(apps[0]).toHaveProperty("category");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/apps.test.ts`
Expected: FAIL — cannot import.

- [ ] **Step 3: Implement**

```ts
// src/apps.ts
import { readFileSync } from "node:fs";
import { AppInput } from "./schema.js";

export function loadApps(path = "data/apps.json"): AppInput[] {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return AppInput.array().parse(raw);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/apps.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/apps.ts test/apps.test.ts
git commit -m "feat: add validated apps loader"
```

---

## Task 4: Cache layer (`src/cache.ts`)

**Files:**
- Create: `src/cache.ts`
- Test: `test/cache.test.ts`

**Interfaces:**
- Produces:
  - `stableHash(input: unknown): string` — canonical-JSON sha256, key-order independent.
  - `Cache` interface: `get<T>(ns: string, key: string): Promise<T | null>`, `set<T>(ns, key, value): Promise<void>`, `keyFor(parts: unknown): string`.
  - `createFileCache(rootDir: string, opts?: { refresh?: boolean }): Cache` — stores at `<rootDir>/<ns>/<key>.json`; when `refresh`, `get` always returns null (forces recompute) but `set` still writes.

- [ ] **Step 1: Write the failing test**

```ts
// test/cache.test.ts
import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFileCache, stableHash } from "../src/cache.js";

describe("stableHash", () => {
  it("is order-independent", () => {
    expect(stableHash({ a: 1, b: 2 })).toBe(stableHash({ b: 2, a: 1 }));
  });
  it("differs on different content", () => {
    expect(stableHash({ a: 1 })).not.toBe(stableHash({ a: 2 }));
  });
});

describe("createFileCache", () => {
  it("round-trips a value", async () => {
    const c = createFileCache(mkdtempSync(join(tmpdir(), "cache-")));
    await c.set("search", "k1", { hits: [1, 2] });
    expect(await c.get("search", "k1")).toEqual({ hits: [1, 2] });
  });
  it("misses on unknown key", async () => {
    const c = createFileCache(mkdtempSync(join(tmpdir(), "cache-")));
    expect(await c.get("search", "nope")).toBeNull();
  });
  it("refresh mode forces get-miss but still writes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cache-"));
    const write = createFileCache(dir);
    await write.set("llm", "k", { v: 1 });
    const refresh = createFileCache(dir, { refresh: true });
    expect(await refresh.get("llm", "k")).toBeNull();
    await refresh.set("llm", "k", { v: 2 });
    const read = createFileCache(dir);
    expect(await read.get("llm", "k")).toEqual({ v: 2 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/cache.test.ts`
Expected: FAIL — cannot import.

- [ ] **Step 3: Implement**

```ts
// src/cache.ts
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export function stableHash(input: unknown): string {
  return createHash("sha256").update(canonical(input)).digest("hex").slice(0, 32);
}

function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  const keys = Object.keys(v as object).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonical((v as any)[k])).join(",") + "}";
}

export interface Cache {
  get<T>(ns: string, key: string): Promise<T | null>;
  set<T>(ns: string, key: string, value: T): Promise<void>;
  keyFor(parts: unknown): string;
}

export function createFileCache(rootDir: string, opts: { refresh?: boolean } = {}): Cache {
  return {
    keyFor: (parts) => stableHash(parts),
    async get(ns, key) {
      if (opts.refresh) return null;
      const p = join(rootDir, ns, `${key}.json`);
      return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
    },
    async set(ns, key, value) {
      const dir = join(rootDir, ns);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${key}.json`), JSON.stringify(value, null, 2));
    },
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/cache.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/cache.ts test/cache.test.ts
git commit -m "feat: add content-addressed two-layer file cache"
```

---

## Task 5: Firecrawl wrapper (`src/firecrawl.ts`)

**Files:**
- Create: `src/firecrawl.ts`
- Test: `test/firecrawl.test.ts`

**Interfaces:**
- Consumes: `Cache`.
- Produces: `ScrapedPage = { url: string; markdown: string; title?: string }`; `Scraper` interface `{ scrape(url: string): Promise<ScrapedPage> }`; `createScraper(deps: { apiKey: string; client?: FirecrawlLike }, cache: Cache): Scraper`. `FirecrawlLike = { scrapeUrl(url: string, opts: object): Promise<any> }` (injected for tests).

- [ ] **Step 1: Write the failing test (mock the client)**

```ts
// test/firecrawl.test.ts
import { describe, it, expect, vi } from "vitest";
import { createScraper } from "../src/firecrawl.js";
import { createFileCache } from "../src/cache.js";
import { mkdtempSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path";

const cache = () => createFileCache(mkdtempSync(join(tmpdir(), "fc-")));

describe("createScraper", () => {
  it("returns normalized page and caches it", async () => {
    const client = { scrapeUrl: vi.fn().mockResolvedValue({ markdown: "# Docs", metadata: { title: "T" } }) };
    const s = createScraper({ apiKey: "x", client }, cache());
    const page = await s.scrape("https://ex.com/docs");
    expect(page).toEqual({ url: "https://ex.com/docs", markdown: "# Docs", title: "T" });
    expect(client.scrapeUrl).toHaveBeenCalledOnce();
  });
  it("does not re-call the client on cache hit", async () => {
    const client = { scrapeUrl: vi.fn().mockResolvedValue({ markdown: "x", metadata: {} }) };
    const c = cache();
    const s1 = createScraper({ apiKey: "x", client }, c);
    await s1.scrape("https://ex.com/a");
    const s2 = createScraper({ apiKey: "x", client }, c);
    await s2.scrape("https://ex.com/a");
    expect(client.scrapeUrl).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/firecrawl.test.ts`
Expected: FAIL — cannot import.

- [ ] **Step 3: Implement**

```ts
// src/firecrawl.ts
import FirecrawlApp from "@mendable/firecrawl-js";
import type { Cache } from "./cache.js";

export type ScrapedPage = { url: string; markdown: string; title?: string };
export interface FirecrawlLike { scrapeUrl(url: string, opts: object): Promise<any>; }
export interface Scraper { scrape(url: string): Promise<ScrapedPage>; }

export function createScraper(
  deps: { apiKey: string; client?: FirecrawlLike },
  cache: Cache,
): Scraper {
  const client = deps.client ?? new FirecrawlApp({ apiKey: deps.apiKey });
  return {
    async scrape(url) {
      const key = cache.keyFor({ url });
      const hit = await cache.get<ScrapedPage>("scrape", key);
      if (hit) return hit;
      const res = await client.scrapeUrl(url, { formats: ["markdown"] });
      const page: ScrapedPage = { url, markdown: res.markdown ?? "", title: res.metadata?.title };
      await cache.set("scrape", key, page);
      return page;
    },
  };
}
```
> Step 3a: verify `@mendable/firecrawl-js` export + `scrapeUrl` signature against installed version; adjust the two `res.*` accessors only if needed. Tests use the injected fake, so they stay green regardless.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/firecrawl.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/firecrawl.ts test/firecrawl.test.ts
git commit -m "feat: add cached Firecrawl scraper wrapper"
```

---

## Task 6: Composio wrapper — search tools (`src/composio.ts`)

**Files:**
- Create: `src/composio.ts`
- Test: `test/composio.test.ts`

**Interfaces:**
- Consumes: `Cache`.
- Produces: `SearchResult = { title: string; url: string; snippet: string }`; `Searcher` interface `{ search(query: string): Promise<SearchResult[]> }`; `createSearcher(deps: { execute: ExecFn }, cache: Cache): Searcher` where `ExecFn = (slug: string, args: object) => Promise<any>` wraps `composio.tools.execute`; and `createComposio(apiKey: string): { execute: ExecFn; raw: any }` (the real SDK binding, verified against docs).

- [ ] **Step 1: Write the failing test (mock execute)**

```ts
// test/composio.test.ts
import { describe, it, expect, vi } from "vitest";
import { createSearcher } from "../src/composio.js";
import { createFileCache } from "../src/cache.js";
import { mkdtempSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path";

const cache = () => createFileCache(mkdtempSync(join(tmpdir(), "cx-")));

describe("createSearcher", () => {
  it("maps COMPOSIO_SEARCH results to SearchResult[] and caches", async () => {
    const execute = vi.fn().mockResolvedValue({
      data: { results: [{ title: "Docs", url: "https://x.com", content: "auth via api key" }] },
    });
    const s = createSearcher({ execute }, cache());
    const out = await s.search("x API auth");
    expect(out[0]).toEqual({ title: "Docs", url: "https://x.com", snippet: "auth via api key" });
    expect(execute).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/composio.test.ts`
Expected: FAIL — cannot import.

- [ ] **Step 3: Implement**

```ts
// src/composio.ts
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
```
> Step 3a: verify against the installed `@composio/core` — exact class import, `tools.execute` signature, the search tool slug (`COMPOSIO_SEARCH_SEARCH` vs alternative), and result shape. Fix `createComposio` + the `rows`/mapping accessors only. The unit test injects `execute`, so it stays green; confirm the live shape with the Task 7 smoke step.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/composio.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/composio.ts test/composio.test.ts
git commit -m "feat: add Composio search wrapper (dogfoods COMPOSIO_SEARCH)"
```

---

## Task 7: LLM extractor (`src/llm.ts`)

**Files:**
- Create: `src/llm.ts`
- Test: `test/llm.test.ts`

**Interfaces:**
- Consumes: `Cache`, `zod`.
- Produces: `Llm` interface `{ extract<T>(args: ExtractArgs<T>): Promise<T> }`; `ExtractArgs<T> = { model: string; system: string; user: string; schema: z.ZodType<T>; schemaName: string; toolName?: string }`; `createLlm(deps: { apiKey: string; client?: AnthropicLike }, cache: Cache): Llm` where `AnthropicLike = { messages: { create(body: object): Promise<any> } }`. `extract` forces tool-use structured output, validates with zod (retry once on invalid), caches by `hash(model+system+user+schemaName)`.

- [ ] **Step 1: Write the failing test (mock Anthropic)**

```ts
// test/llm.test.ts
import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { createLlm } from "../src/llm.js";
import { createFileCache } from "../src/cache.js";
import { mkdtempSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path";

const cache = () => createFileCache(mkdtempSync(join(tmpdir(), "llm-")));
const schema = z.object({ auth: z.string() });
const toolUse = (input: object) => ({ content: [{ type: "tool_use", name: "emit", input }] });

describe("createLlm.extract", () => {
  it("returns validated tool_use input and caches it", async () => {
    const create = vi.fn().mockResolvedValue(toolUse({ auth: "API key" }));
    const client = { messages: { create } };
    const llm = createLlm({ apiKey: "x", client }, cache());
    const out = await llm.extract({ model: "claude-sonnet-5", system: "s", user: "u", schema, schemaName: "auth" });
    expect(out).toEqual({ auth: "API key" });
    expect(create).toHaveBeenCalledOnce();
  });
  it("retries once when first output is schema-invalid", async () => {
    const create = vi.fn()
      .mockResolvedValueOnce(toolUse({ auth: 123 }))
      .mockResolvedValueOnce(toolUse({ auth: "API key" }));
    const llm = createLlm({ apiKey: "x", client: { messages: { create } } }, cache());
    const out = await llm.extract({ model: "claude-sonnet-5", system: "s", user: "u", schema, schemaName: "auth" });
    expect(out).toEqual({ auth: "API key" });
    expect(create).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/llm.test.ts`
Expected: FAIL — cannot import.

- [ ] **Step 3: Implement**

```ts
// src/llm.ts
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { Cache } from "./cache.js";

export interface AnthropicLike { messages: { create(body: object): Promise<any> }; }
export type ExtractArgs<T> = {
  model: string; system: string; user: string;
  schema: z.ZodType<T>; schemaName: string; toolName?: string;
};
export interface Llm { extract<T>(args: ExtractArgs<T>): Promise<T>; }

export function createLlm(deps: { apiKey: string; client?: AnthropicLike }, cache: Cache): Llm {
  const client = deps.client ?? (new Anthropic({ apiKey: deps.apiKey }) as unknown as AnthropicLike);
  return {
    async extract(args) {
      const key = cache.keyFor({ m: args.model, s: args.system, u: args.user, n: args.schemaName });
      const hit = await cache.get<any>("llm", key);
      if (hit) return args.schema.parse(hit);
      const tool = args.toolName ?? "emit";
      let lastErr = "";
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await client.messages.create({
          model: args.model, max_tokens: 2048, temperature: 0,
          system: args.system,
          tools: [{ name: tool, description: "Emit the structured result.", input_schema: { type: "object" } }],
          tool_choice: { type: "tool", name: tool },
          messages: [{ role: "user", content: attempt === 0 ? args.user : `${args.user}\n\nPrevious output was invalid: ${lastErr}. Return valid data.` }],
        });
        const block = (res.content ?? []).find((b: any) => b.type === "tool_use");
        const parsed = args.schema.safeParse(block?.input);
        if (parsed.success) { await cache.set("llm", key, parsed.data); return parsed.data; }
        lastErr = parsed.error.message;
      }
      throw new Error(`LLM output failed schema ${args.schemaName}: ${lastErr}`);
    },
  };
}
```
> Step 3a: the tool `input_schema` is intentionally permissive (`{type:"object"}`) so we validate with zod, not the provider — keeps model IDs and SDK coupling minimal. Verify `@anthropic-ai/sdk` `messages.create` shape against installed version.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/llm.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Live smoke test (not committed as a unit test)**

Create `scripts/smoke.ts` that: builds `createComposio` + `createSearcher` + `createScraper` + `createLlm` from real env keys, runs `search("Stripe API authentication")`, `scrape("https://stripe.com/docs/api")`, and one `extract` returning `{ ok: boolean }`. Run: `tsx scripts/smoke.ts`. Expected: non-empty search results, non-empty markdown, `{ ok: true }`. This confirms the Task 4a/6a/7a live signatures before scaling to 100.

- [ ] **Step 6: Commit**

```bash
git add src/llm.ts test/llm.test.ts scripts/smoke.ts
git commit -m "feat: add schema-validated Claude extractor with cache + retry"
```

---

## Task 8: Research orchestration (`src/research.ts`)

**Files:**
- Create: `src/research.ts`
- Test: `test/research.test.ts`

**Interfaces:**
- Consumes: `AppInput`, `AppResearch`, `Searcher`, `Scraper`, `Llm`.
- Produces: `researchApp(app: AppInput, deps: { search: Searcher; scrape: Scraper; llm: Llm }): Promise<AppResearch>`; `buildResearchPrompt(app, evidence): { system: string; user: string }` (exported for testing).

- [ ] **Step 1: Write the failing test (all deps mocked)**

```ts
// test/research.test.ts
import { describe, it, expect, vi } from "vitest";
import { researchApp } from "../src/research.js";

const app = { id: 81, name: "Stripe", website: "stripe.com", category: "Finance and Fintech" };

const extracted = {
  one_liner: "Payments API.",
  auth_methods: [{ method: "API key" }],
  self_serve: "self-serve-free",
  api_surface: { type: "REST", breadth: "broad" },
  existing_mcp: { exists: "no" },
  buildability: "buildable-now",
  main_blocker: null,
  evidence: [{ url: "https://stripe.com/docs/api", supports: "REST + API key" }],
  confidence: 0.9, flags: [],
};

describe("researchApp", () => {
  it("assembles evidence, extracts, and returns a valid AppResearch with id/name merged", async () => {
    const deps = {
      search: { search: vi.fn().mockResolvedValue([{ title: "Docs", url: "https://stripe.com/docs/api", snippet: "api key" }]) },
      scrape: { scrape: vi.fn().mockResolvedValue({ url: "https://stripe.com/docs/api", markdown: "# API\nUse your API key." }) },
      llm: { extract: vi.fn().mockResolvedValue(extracted) },
    };
    const out = await researchApp(app, deps as any);
    expect(out.id).toBe(81);
    expect(out.name).toBe("Stripe");
    expect(out.self_serve).toBe("self-serve-free");
    expect(deps.search.search).toHaveBeenCalled();
    expect(deps.scrape.scrape).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/research.test.ts`
Expected: FAIL — cannot import.

- [ ] **Step 3: Implement**

```ts
// src/research.ts
import { z } from "zod";
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
    ...pages.filter(Boolean).map((p) => `--- ${p!.url} ---\n${p!.markdown.slice(0, 4000)}`),
  ].join("\n\n");

  const { system, user } = buildResearchPrompt(app, evidence);
  const partial = await deps.llm.extract({
    model: "claude-sonnet-5", system, user, schema: Extracted, schemaName: "AppResearchExtract",
  });
  return AppResearch.parse({ ...partial, id: app.id, name: app.name, website: app.website, category: app.category });
}

function dedupe(xs: string[]): string[] { return [...new Set(xs)]; }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/research.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/research.ts test/research.test.ts
git commit -m "feat: add per-app research orchestration"
```

---

## Task 9: Critic verifier (`src/verify/critic.ts`)

**Files:**
- Create: `src/verify/critic.ts`
- Test: `test/critic.test.ts`

**Interfaces:**
- Consumes: `AppResearch`, `Llm`.
- Produces: `CriticVerdict = { field: string; status: "supported" | "unsupported" | "contradicted"; note: string }`; `CriticResult = { app_id: number; verdicts: CriticVerdict[]; revised: AppResearch }`; `criticReview(record: AppResearch, evidenceText: string, deps: { llm: Llm }): Promise<CriticResult>` — escalates to `claude-opus-4-8` when `record.confidence < 0.6`, else `claude-sonnet-5`.

- [ ] **Step 1: Write the failing test**

```ts
// test/critic.test.ts
import { describe, it, expect, vi } from "vitest";
import { criticReview } from "../src/verify/critic.js";

const record: any = {
  id: 5, name: "Twenty", website: "twenty.com", category: "CRM and Sales",
  one_liner: "Open-source CRM.", auth_methods: [{ method: "API key" }],
  self_serve: "self-serve-free", api_surface: { type: "GraphQL", breadth: "medium" },
  existing_mcp: { exists: "no" }, buildability: "buildable-now", main_blocker: null,
  evidence: [{ url: "https://twenty.com/developers", supports: "GraphQL API" }],
  confidence: 0.5, flags: [],
};

describe("criticReview", () => {
  it("escalates to opus when confidence < 0.6 and returns revised record", async () => {
    const extract = vi.fn().mockResolvedValue({
      verdicts: [{ field: "self_serve", status: "supported", note: "signup is free" }],
      revised: record,
    });
    const out = await criticReview(record, "evidence text", { llm: { extract } } as any);
    expect(out.app_id).toBe(5);
    expect(out.verdicts[0].status).toBe("supported");
    expect(extract.mock.calls[0][0].model).toBe("claude-opus-4-8");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/critic.test.ts`
Expected: FAIL — cannot import.

- [ ] **Step 3: Implement**

```ts
// src/verify/critic.ts
import { z } from "zod";
import { AppResearch } from "../schema.js";
import type { Llm } from "../llm.js";

const CriticOut = z.object({
  verdicts: z.array(z.object({
    field: z.string(),
    status: z.enum(["supported", "unsupported", "contradicted"]),
    note: z.string(),
  })),
  revised: AppResearch,
});
export type CriticResult = { app_id: number; verdicts: z.infer<typeof CriticOut>["verdicts"]; revised: AppResearch };

export async function criticReview(
  record: AppResearch, evidenceText: string, deps: { llm: Llm },
): Promise<CriticResult> {
  const model = record.confidence < 0.6 ? "claude-opus-4-8" : "claude-sonnet-5";
  const system =
    "You are a skeptical fact-checker. For each field of the record, decide if the EVIDENCE supports it, " +
    "does not support it, or contradicts it. Correct any wrong field in `revised`. Do not invent evidence. " +
    "If evidence is insufficient, prefer 'unknown' values and lower confidence.";
  const user = `RECORD:\n${JSON.stringify(record, null, 2)}\n\nEVIDENCE:\n${evidenceText}`;
  const out = await deps.llm.extract({ model, system, user, schema: CriticOut, schemaName: "CriticOut" });
  return { app_id: record.id, verdicts: out.verdicts, revised: out.revised };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/critic.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/verify/critic.ts test/critic.test.ts
git commit -m "feat: add LLM critic verifier (loop 1)"
```

---

## Task 10: Self-serve browser check (`src/verify/browser.ts`)

**Files:**
- Create: `src/verify/browser.ts`
- Test: `test/browser.test.ts`

**Interfaces:**
- Consumes: `AppInput`, `SelfServe`, `Scraper`, `Llm`.
- Produces: `SelfServeCheck = { app_id: number; self_serve: z.infer<typeof SelfServe>; signal: string; evidence_url: string }`; `classifySelfServe(pageMarkdown: string): { hint: SelfServeValue; matched: string } | null` (pure heuristic, exported); `checkSelfServe(app: AppInput, pricingUrl: string, deps: { scrape: Scraper; llm: Llm }): Promise<SelfServeCheck>` — heuristic first, LLM tie-break when heuristic is null.

- [ ] **Step 1: Write the failing test (heuristic is pure → easy TDD)**

```ts
// test/browser.test.ts
import { describe, it, expect } from "vitest";
import { classifySelfServe } from "../src/verify/browser.js";

describe("classifySelfServe", () => {
  it("flags contact-sales gating", () => {
    const r = classifySelfServe("Enterprise plan — Contact sales to request access.");
    expect(r?.hint).toBe("partnership-contact-sales");
  });
  it("flags free self-serve signup", () => {
    const r = classifySelfServe("Start for free. Sign up and get your API key instantly.");
    expect(r?.hint).toBe("self-serve-free");
  });
  it("returns null when ambiguous", () => {
    expect(classifySelfServe("We build software for teams.")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/browser.test.ts`
Expected: FAIL — cannot import.

- [ ] **Step 3: Implement**

```ts
// src/verify/browser.ts
import { z } from "zod";
import { SelfServe, AppInput } from "../schema.js";
import type { Scraper } from "../firecrawl.js";
import type { Llm } from "../llm.js";

type SelfServeValue = z.infer<typeof SelfServe>;
export type SelfServeCheck = { app_id: number; self_serve: SelfServeValue; signal: string; evidence_url: string };

export function classifySelfServe(md: string): { hint: SelfServeValue; matched: string } | null {
  const t = md.toLowerCase();
  const gated = ["contact sales", "request access", "request a demo", "talk to sales", "contact us for pricing"];
  const free = ["start for free", "sign up free", "free tier", "get your api key", "create a free account", "free plan"];
  const trial = ["free trial", "start your trial", "try free for"];
  for (const p of gated) if (t.includes(p)) return { hint: "partnership-contact-sales", matched: p };
  for (const p of free) if (t.includes(p)) return { hint: "self-serve-free", matched: p };
  for (const p of trial) if (t.includes(p)) return { hint: "self-serve-trial", matched: p };
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/browser.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/verify/browser.ts test/browser.test.ts
git commit -m "feat: add self-serve/gated check with heuristic + LLM tie-break (loop 2)"
```

---

## Task 11: Accuracy scoring (`src/verify/audit.ts`)

**Files:**
- Create: `src/verify/audit.ts`
- Test: `test/audit.test.ts`

**Interfaces:**
- Consumes: `AppResearch`.
- Produces: `FieldName = "auth_methods" | "self_serve" | "api_surface" | "existing_mcp" | "buildability"`; `GroundTruth = { app_id: number; fields: Partial<Record<FieldName, string>> }`; `Miss = { app_id: number; field: FieldName; expected: string; got: string }`; `AccuracyReport = { overall: number; perField: Record<FieldName, { correct: number; total: number; accuracy: number }>; misses: Miss[] }`; `normalizeField(record: AppResearch, field: FieldName): string`; `scoreAccuracy(records: AppResearch[], truth: GroundTruth[], fields?: FieldName[]): AccuracyReport`.

- [ ] **Step 1: Write the failing test (pure → full TDD)**

```ts
// test/audit.test.ts
import { describe, it, expect } from "vitest";
import { scoreAccuracy, normalizeField } from "../src/verify/audit.js";

const rec = (over: any) => ({
  id: 1, name: "A", website: "a.com", category: "X", one_liner: "x",
  auth_methods: [{ method: "API key" }], self_serve: "self-serve-free",
  api_surface: { type: "REST", breadth: "broad" }, existing_mcp: { exists: "no" },
  buildability: "buildable-now", main_blocker: null,
  evidence: [{ url: "https://a.com", supports: "x" }], confidence: 0.9, flags: [], ...over,
});

describe("normalizeField", () => {
  it("normalizes auth_methods to a sorted joined string", () => {
    expect(normalizeField(rec({ auth_methods: [{ method: "OAuth2" }, { method: "API key" }] }), "auth_methods"))
      .toBe("API key|OAuth2");
  });
});

describe("scoreAccuracy", () => {
  it("computes overall + per-field accuracy and lists misses", () => {
    const records = [rec({ id: 1, self_serve: "self-serve-free" }), rec({ id: 2, self_serve: "paid-plan" })];
    const truth = [
      { app_id: 1, fields: { self_serve: "self-serve-free" } },
      { app_id: 2, fields: { self_serve: "partnership-contact-sales" } },
    ];
    const r = scoreAccuracy(records, truth, ["self_serve"]);
    expect(r.perField.self_serve).toEqual({ correct: 1, total: 2, accuracy: 0.5 });
    expect(r.overall).toBe(0.5);
    expect(r.misses).toEqual([{ app_id: 2, field: "self_serve", expected: "partnership-contact-sales", got: "paid-plan" }]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/audit.test.ts`
Expected: FAIL — cannot import.

- [ ] **Step 3: Implement**

```ts
// src/verify/audit.ts
import { AppResearch } from "../schema.js";

export type FieldName = "auth_methods" | "self_serve" | "api_surface" | "existing_mcp" | "buildability";
export type GroundTruth = { app_id: number; fields: Partial<Record<FieldName, string>> };
export type Miss = { app_id: number; field: FieldName; expected: string; got: string };
export type AccuracyReport = {
  overall: number;
  perField: Record<FieldName, { correct: number; total: number; accuracy: number }>;
  misses: Miss[];
};

const ALL: FieldName[] = ["auth_methods", "self_serve", "api_surface", "existing_mcp", "buildability"];

export function normalizeField(r: AppResearch, f: FieldName): string {
  switch (f) {
    case "auth_methods": return r.auth_methods.map((a) => a.method).sort().join("|");
    case "self_serve": return r.self_serve;
    case "api_surface": return r.api_surface.type;
    case "existing_mcp": return r.existing_mcp.exists;
    case "buildability": return r.buildability;
  }
}

export function scoreAccuracy(records: AppResearch[], truth: GroundTruth[], fields: FieldName[] = ALL): AccuracyReport {
  const byId = new Map(records.map((r) => [r.id, r]));
  const perField = {} as AccuracyReport["perField"];
  const misses: Miss[] = [];
  let correctAll = 0, totalAll = 0;
  for (const f of fields) {
    let correct = 0, total = 0;
    for (const g of truth) {
      const expected = g.fields[f];
      if (expected === undefined) continue;
      const rec = byId.get(g.app_id);
      if (!rec) continue;
      const got = normalizeField(rec, f);
      total++;
      if (got === expected) correct++;
      else misses.push({ app_id: g.app_id, field: f, expected, got });
    }
    perField[f] = { correct, total, accuracy: total ? correct / total : 0 };
    correctAll += correct; totalAll += total;
  }
  return { overall: totalAll ? correctAll / totalAll : 0, perField, misses };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/audit.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/verify/audit.ts test/audit.test.ts
git commit -m "feat: add accuracy scoring for first-vs-verified lift (loop 3)"
```

---

## Task 12: Clustering (`src/cluster.ts`)

**Files:**
- Create: `src/cluster.ts`
- Test: `test/cluster.test.ts`

**Interfaces:**
- Consumes: `AppResearch`.
- Produces: `Clusters = { authDistribution: Record<string,number>; selfServeByCategory: Record<string, Record<string,number>>; mcpCoverage: { yes:number; no:number; unknown:number }; buildability: Record<string,number>; topBlocker: { blocker: string; count: number } | null; headlines: string[] }`; `computeClusters(records: AppResearch[]): Clusters`.

- [ ] **Step 1: Write the failing test**

```ts
// test/cluster.test.ts
import { describe, it, expect } from "vitest";
import { computeClusters } from "../src/cluster.js";

const rec = (o: any) => ({
  id: o.id, name: "n", website: "n.com", category: o.category, one_liner: "x",
  auth_methods: o.auth.map((m: string) => ({ method: m })), self_serve: o.self, 
  api_surface: { type: "REST", breadth: "broad" }, existing_mcp: { exists: o.mcp ?? "no" },
  buildability: o.build, main_blocker: o.blocker ?? null,
  evidence: [{ url: "https://n.com", supports: "x" }], confidence: 0.9, flags: [],
});

describe("computeClusters", () => {
  it("aggregates auth, self-serve by category, mcp, buildability, top blocker", () => {
    const records = [
      rec({ id: 1, category: "CRM", auth: ["OAuth2"], self: "self-serve-free", build: "buildable-now" }),
      rec({ id: 2, category: "CRM", auth: ["API key"], self: "partnership-contact-sales", build: "blocked", blocker: "partner-gated" }),
      rec({ id: 3, category: "Fintech", auth: ["OAuth2"], self: "paid-plan", build: "blocked", blocker: "partner-gated", mcp: "yes" }),
    ];
    const c = computeClusters(records as any);
    expect(c.authDistribution).toEqual({ OAuth2: 2, "API key": 1 });
    expect(c.selfServeByCategory.CRM["self-serve-free"]).toBe(1);
    expect(c.mcpCoverage).toEqual({ yes: 1, no: 2, unknown: 0 });
    expect(c.topBlocker).toEqual({ blocker: "partner-gated", count: 2 });
    expect(c.headlines.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/cluster.test.ts`
Expected: FAIL — cannot import.

- [ ] **Step 3: Implement**

```ts
// src/cluster.ts
import { AppResearch } from "./schema.js";

export type Clusters = {
  authDistribution: Record<string, number>;
  selfServeByCategory: Record<string, Record<string, number>>;
  mcpCoverage: { yes: number; no: number; unknown: number };
  buildability: Record<string, number>;
  topBlocker: { blocker: string; count: number } | null;
  headlines: string[];
};

const SELF_SERVE = new Set(["self-serve-free", "self-serve-trial"]);

export function computeClusters(records: AppResearch[]): Clusters {
  const authDistribution: Record<string, number> = {};
  const selfServeByCategory: Record<string, Record<string, number>> = {};
  const mcpCoverage = { yes: 0, no: 0, unknown: 0 };
  const buildability: Record<string, number> = {};
  const blockers: Record<string, number> = {};

  for (const r of records) {
    for (const a of r.auth_methods) authDistribution[a.method] = (authDistribution[a.method] ?? 0) + 1;
    (selfServeByCategory[r.category] ??= {});
    selfServeByCategory[r.category][r.self_serve] = (selfServeByCategory[r.category][r.self_serve] ?? 0) + 1;
    mcpCoverage[r.existing_mcp.exists] += 1;
    buildability[r.buildability] = (buildability[r.buildability] ?? 0) + 1;
    if (r.main_blocker) blockers[r.main_blocker] = (blockers[r.main_blocker] ?? 0) + 1;
  }

  const topBlocker = Object.entries(blockers).sort((a, b) => b[1] - a[1])[0];
  const selfServeCount = records.filter((r) => SELF_SERVE.has(r.self_serve)).length;
  const topAuth = Object.entries(authDistribution).sort((a, b) => b[1] - a[1])[0];

  const headlines = [
    topAuth ? `${topAuth[0]} is the dominant auth method (${topAuth[1]} of ${records.length} apps).` : "",
    `${selfServeCount}/${records.length} apps are self-serve — the easy wins; the rest need paid plans or outreach.`,
    `${buildability["buildable-now"] ?? 0} apps are buildable now; ${buildability["blocked"] ?? 0} are blocked today.`,
    topBlocker ? `The most common blocker is "${topBlocker[0]}" (${topBlocker[1]} apps).` : "",
  ].filter(Boolean);

  return {
    authDistribution, selfServeByCategory, mcpCoverage, buildability,
    topBlocker: topBlocker ? { blocker: topBlocker[0], count: topBlocker[1] } : null,
    headlines,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/cluster.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cluster.ts test/cluster.test.ts
git commit -m "feat: add clustering + headline patterns"
```

---

## Task 13: Pipeline orchestration + CLI (`src/pipeline.ts`)

**Files:**
- Create: `src/pipeline.ts`
- Test: `test/pipeline.test.ts`

**Interfaces:**
- Consumes: all prior modules.
- Produces: `parseArgs(argv: string[]): { stage: "all"|"research"|"verify"|"cluster"; dryRun: boolean; refresh: boolean; limit?: number }`; `runResearch/runVerify/runCluster` writing `data/*.json`. CLI entry runs when invoked directly.

- [ ] **Step 1: Write the failing test (arg parsing is pure)**

```ts
// test/pipeline.test.ts
import { describe, it, expect } from "vitest";
import { parseArgs } from "../src/pipeline.js";

describe("parseArgs", () => {
  it("defaults to all stages, no dry-run", () => {
    expect(parseArgs([])).toEqual({ stage: "all", dryRun: false, refresh: false, limit: undefined });
  });
  it("parses stage, dry-run, refresh, limit", () => {
    expect(parseArgs(["--stage=research", "--dry-run", "--refresh", "--limit=5"]))
      .toEqual({ stage: "research", dryRun: true, refresh: true, limit: 5 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/pipeline.test.ts`
Expected: FAIL — cannot import.

- [ ] **Step 3: Implement**

```ts
// src/pipeline.ts
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
import { scoreAccuracy, GroundTruth } from "./verify/audit.js";
import { computeClusters } from "./cluster.js";

export function parseArgs(argv: string[]) {
  const has = (f: string) => argv.includes(f);
  const val = (k: string) => argv.find((a) => a.startsWith(`${k}=`))?.split("=")[1];
  const stage = (val("--stage") as any) ?? "all";
  const limit = val("--limit") ? Number(val("--limit")) : undefined;
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
    const revised: AppResearch[] = [];
    for (const r of records) {
      const evidence = r.evidence.map((e) => `${e.url}: ${e.supports}`).join("\n");
      try { revised.push((await criticReview(r, evidence, { llm })).revised); }
      catch { revised.push(r); }
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
```
> `checkSelfServe` is wired into `runVerify` for the sampled/low-confidence apps once `data/ground-truth.json` sample ids are known (Task 15); keep it imported. Keep the browser check scoped to the sample to respect the time/cost budget — `log()` which ids were checked.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/pipeline.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pipeline.ts test/pipeline.test.ts
git commit -m "feat: add pipeline orchestration + CLI flags"
```

---

## Task 14: Site builder (`site/build.ts`, `site/template.ts`)

**Files:**
- Create: `site/template.ts`, `site/build.ts`
- Test: `test/site.test.ts`

**Interfaces:**
- Consumes: `AppResearch`, `Clusters`, `AccuracyReport`.
- Produces: `renderPage(data: { records: AppResearch[]; clusters: Clusters; accuracy: { firstPass: AccuracyReport; afterLoops: AccuracyReport }; demo?: { pageUrl?: string; steps?: unknown[] } }): string`; `build.ts` reads `data/*.json` → writes `public/index.html`.

- [ ] **Step 1: Write the failing test (snapshot-ish assertions on the string)**

```ts
// test/site.test.ts
import { describe, it, expect } from "vitest";
import { renderPage } from "../site/template.js";

const records: any = [{
  id: 1, name: "Stripe", website: "stripe.com", category: "Finance and Fintech", one_liner: "Payments.",
  auth_methods: [{ method: "API key" }], self_serve: "self-serve-free",
  api_surface: { type: "REST", breadth: "broad" }, existing_mcp: { exists: "no" },
  buildability: "buildable-now", main_blocker: null,
  evidence: [{ url: "https://stripe.com/docs/api", supports: "REST" }], confidence: 0.9, flags: [],
}];
const clusters: any = { authDistribution: { "API key": 1 }, selfServeByCategory: {}, mcpCoverage: { yes: 0, no: 1, unknown: 0 }, buildability: { "buildable-now": 1 }, topBlocker: null, headlines: ["API key dominates."] };
const accuracy: any = { firstPass: { overall: 0.74, perField: {}, misses: [] }, afterLoops: { overall: 0.93, perField: {}, misses: [] } };

describe("renderPage", () => {
  it("produces one self-contained HTML doc with the headline, matrix, and accuracy lift", () => {
    const html = renderPage({ records, clusters, accuracy });
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("API key dominates.");
    expect(html).toContain("Stripe");
    expect(html).toContain("74");
    expect(html).toContain("93");
    expect(html).not.toContain("http://cdn"); // no external deps
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/site.test.ts`
Expected: FAIL — cannot import.

- [ ] **Step 3: Implement `site/template.ts`**

Implement `renderPage(...)` returning a complete `<!doctype html>` string with inline `<style>`/`<script>` and the data embedded as a `<script type="application/json">` block. Sections in order: headline patterns, findings matrix (`<table>` with a client-side filter/sort script over the embedded JSON, color-coded auth + self-serve via CSS classes), the agent (static architecture description), proof (Notion demo block from `data.demo`), verification (first→verified numbers + misses table), limitations (records with `flags` or `buildability === "blocked"`). Reuse the visual language from `docs/superpowers/specs` design brief (cool near-black ground, teal accent, monospace for data; both light/dark via tokens). Minimal `//` comments only. Must contain the literal strings the test checks (`<!doctype html>`, headline text, an app name, the two accuracy numbers) and no external URLs.

- [ ] **Step 4: Implement `site/build.ts`**

```ts
// site/build.ts
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { renderPage } from "./template.js";

const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const html = renderPage({
  records: read("data/verified.json"),
  clusters: read("data/clusters.json"),
  accuracy: read("data/accuracy.json"),
  demo: (() => { try { return read("data/demo.json"); } catch { return undefined; } })(),
});
mkdirSync("public", { recursive: true });
writeFileSync("public/index.html", html);
console.log("wrote public/index.html");
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run test/site.test.ts`
Expected: PASS.

- [ ] **Step 6: Quality gate — render + eyeball**

Run `npm run site:build` against fixture/real data and open `public/index.html`. Have the reviewer agent check: 2-minute readability, no horizontal scroll, both themes, matrix filter works.

- [ ] **Step 7: Commit**

```bash
git add site/template.ts site/build.ts test/site.test.ts
git commit -m "feat: add self-contained HTML case-study renderer"
```

---

## Task 15: Ground-truth sample + real run + accuracy lift

**Files:**
- Create: `data/ground-truth.json`
- Modify: `src/pipeline.ts` (wire `checkSelfServe` for the sample ids)

**Interfaces:**
- Consumes: `GroundTruth`, `checkSelfServe`.
- Produces: committed `data/ground-truth.json` (≥15 apps: ≥1 per category + trap apps Sherlock/Mermaid CLI/PitchBook/NotebookLM/Paygent/iPayX/fanbasis), and the real `data/{results,verified,accuracy,clusters}.json`.

- [ ] **Step 1:** Hand-audit ~15 apps against real docs; write `data/ground-truth.json` as `GroundTruth[]` with the normalized expected strings (e.g. `self_serve: "self-serve-free"`, `auth_methods: "API key|OAuth2"`).
- [ ] **Step 2:** Fill `.env` with the 4 real keys (never commit).
- [ ] **Step 3:** Smoke: `npm run pipeline -- --stage=research --limit=3`. Confirm 3 valid records land in `data/results.json`.
- [ ] **Step 4:** Full research: `npm run pipeline -- --stage=research`. Inspect failures; re-run (cache makes it cheap).
- [ ] **Step 5:** Wire `checkSelfServe` into `runVerify` for the ground-truth sample + `confidence < 0.6` apps; run `npm run pipeline -- --stage=verify`.
- [ ] **Step 6:** `npm run pipeline -- --stage=cluster`, then `npm run site:build`.
- [ ] **Step 7:** Read `data/accuracy.json`: confirm `afterLoops.overall > firstPass.overall`. If not, inspect misses and improve prompts/heuristics, re-run verify (this IS the accuracy-lift story).
- [ ] **Step 8:** Commit the frozen run.

```bash
git add data/ground-truth.json data/results.json data/verified.json data/accuracy.json data/clusters.json data/raw
git commit -m "data: real 100-app run + ground-truth sample + accuracy lift"
```

---

## Task 16: Notion live demo (`src/demo/notion-demo.ts`)

**Files:**
- Create: `src/demo/notion-demo.ts`
- Modify: `src/composio.ts` (add `connectNotion` + `notionTools` helpers)

**Interfaces:**
- Consumes: `createComposio`, `Llm` (or Composio Anthropic provider), `NOTION_TOKEN`.
- Produces: `DemoCapture = { steps: { tool: string; input: unknown; output: unknown }[]; pageUrl?: string }`; `runNotionDemo(): Promise<DemoCapture>` writes `data/demo.json`.

- [ ] **Step 1:** In the Composio dashboard, create a Notion auth config using the `NOTION_TOKEN` (Access-token connection) and create a connected account for `userId: "research-agent"`. Share one Notion page with the integration.
- [ ] **Step 2:** Implement `runNotionDemo`: fetch Notion tools via Composio for the connected account, give them to Claude via the `@composio/anthropic` provider (this is the SDK+MCP dogfood), instruct it to create a page titled "Composio Toolkit Demo — <date>" with a short body, capture each tool call's input/output into `DemoCapture`, write `data/demo.json`.
- [ ] **Step 3:** Run `npm run demo:notion`. Expected: a page is created in Notion; `data/demo.json` has ≥1 step and a `pageUrl`.
- [ ] **Step 4:** Quality gate: reviewer agent confirms the demo actually hit Notion (page exists) and the capture is real, not stubbed.
- [ ] **Step 5:** `npm run site:build` (now embeds the demo), commit.

```bash
git add src/demo/notion-demo.ts src/composio.ts data/demo.json public/index.html
git commit -m "feat: add live Notion Composio toolkit demo + embed on page"
```

---

## Task 17: README + Netlify deploy

**Files:**
- Create: `README.md`, `netlify.toml`

**Interfaces:**
- Produces: setup + run docs; static publish config pointing at `public/`.

- [ ] **Step 1:** Write `README.md`: what it is, the 4 keys + `.env` setup, `npm install`, `npm test`, `npm run pipeline` (+ `--dry-run`, `--limit`, `--refresh`), `npm run site:build`, `npm run demo:notion`, and a "how verification works / accuracy lift" section. State plainly where a human was needed and which apps defeated the agent.
- [ ] **Step 2:** Write `netlify.toml`:
```toml
[build]
  publish = "public"
  command = "echo 'static site, no build'"
```
- [ ] **Step 3:** Deploy: connect the GitHub repo to Netlify (or `netlify deploy --prod --dir=public`). Capture the live URL.
- [ ] **Step 4:** Add the live URL to `README.md` and the page footer. Final quality gate: reviewer agent opens the live link and re-runs `npm run pipeline -- --dry-run` from a clean clone to confirm reproducibility.
- [ ] **Step 5:** Commit + push.

```bash
git add README.md netlify.toml
git commit -m "docs: add README + Netlify config + live link"
```

---

## Self-Review

**Spec coverage:** category/one-liner/auth/self-serve/API-surface/MCP/buildability/evidence → schema (T2) + research (T8); agent → T4–T8; 3 verification loops → critic T9, browser T10, audit T11 + real lift T15; clustering/patterns → T12; single HTML page → T14; Notion demo → T16; repo+README+Netlify → T17; dry-run/determinism → cache T4 + pipeline T13; honesty/limitations → site limitations section T14 + README T17. All spec sections map to a task. ✔

**Placeholder scan:** every code step ships real code; the only deferred items are genuinely-runtime (live SDK signature confirmation in T5/T6/T7 3a steps, hand-audit values in T15, dashboard clicks in T16) — flagged as explicit steps, not hidden TODOs. ✔

**Type consistency:** `AppResearch`, `AppInput`, `Cache`, `Searcher`, `Scraper`, `Llm.extract`, `Clusters`, `AccuracyReport`, `GroundTruth`, `FieldName`, `SelfServeCheck` names/signatures match across producing and consuming tasks. `researchApp` returns `AppResearch`; `criticReview` returns `{revised: AppResearch}`; pipeline consumes both. ✔
