import type { AppResearch } from "../src/schema.js";
import type { Clusters } from "../src/cluster.js";
import type { AccuracyReport } from "../src/verify/audit.js";

type Accuracy = { firstPass: AccuracyReport; afterLoops: AccuracyReport };
type Demo = { publicUrl?: string; pageUrl?: string; ranAt?: string; steps?: Array<{ tool?: string; input?: unknown; output?: unknown }> };
type PageData = { records: AppResearch[]; clusters: Clusters; accuracy: Accuracy; demo?: Demo };

const esc = (s: unknown): string =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const safeUrl = (u: unknown): string => { const s = String(u ?? ""); return /^https?:\/\//i.test(s) ? s : ""; };

const pct = (n: number) => Math.round(n * 100);

function selfServeClass(v: string): string {
  if (v === "self-serve-free" || v === "self-serve-trial") return "good";
  if (v === "paid-plan" || v === "admin-approval") return "warn";
  if (v === "partnership-contact-sales") return "crit";
  return "neutral";
}
function buildClass(v: string): string {
  if (v === "buildable-now") return "good";
  if (v === "buildable-with-caveats") return "warn";
  return "crit";
}

function matrixRows(records: AppResearch[]): string {
  return records.map((r) => {
    const auth = r.auth_methods.map((a) => esc(a.method)).join(", ");
    const evUrl = safeUrl(r.evidence[0]?.url);
    const ev = evUrl ? `<a href="${esc(evUrl)}" target="_blank" rel="noopener">docs ↗</a>` : "";
    return `<tr data-category="${esc(r.category)}" data-name="${esc(r.name.toLowerCase())}">
      <td class="num">${r.id}</td>
      <td class="app"><span class="app-name">${esc(r.name)}</span><span class="one-liner">${esc(r.one_liner)}</span></td>
      <td class="cat">${esc(r.category)}</td>
      <td class="mono">${auth}</td>
      <td><span class="badge ${selfServeClass(r.self_serve)}">${esc(r.self_serve)}</span></td>
      <td class="mono">${esc(r.api_surface.type)}<span class="dim"> / ${esc(r.api_surface.breadth)}</span></td>
      <td class="mono">${esc(r.existing_mcp.exists)}</td>
      <td><span class="badge ${buildClass(r.buildability)}">${esc(r.buildability)}</span></td>
      <td class="blocker">${r.main_blocker ? esc(r.main_blocker) : "<span class=\"dim\">—</span>"}</td>
      <td>${ev}</td>
    </tr>`;
  }).join("\n");
}

function headlineList(c: Clusters): string {
  return c.headlines.map((h) => `<li>${esc(h)}</li>`).join("\n");
}

function selfServeByCategory(c: Clusters): string {
  const cats = Object.keys(c.selfServeByCategory);
  return cats.map((cat) => {
    const counts = c.selfServeByCategory[cat];
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const free = (counts["self-serve-free"] ?? 0) + (counts["self-serve-trial"] ?? 0);
    return `<div class="cat-row"><span class="cat-name">${esc(cat)}</span>
      <span class="cat-bar"><span class="cat-fill" style="width:${total ? (free / total) * 100 : 0}%"></span></span>
      <span class="cat-num mono">${free}/${total}</span></div>`;
  }).join("\n");
}

function missesTable(a: Accuracy): string {
  const misses = a.afterLoops.misses;
  if (!misses.length) return `<p class="dim">No misses on the audited sample after verification.</p>`;
  return `<table class="misses"><thead><tr><th>App</th><th>Field</th><th>Agent said</th><th>Truth</th></tr></thead><tbody>${
    misses.map((m) => `<tr><td class="num">${m.app_id}</td><td class="mono">${esc(m.field)}</td><td><span class="badge crit">${esc(m.got)}</span></td><td><span class="badge good">${esc(m.expected)}</span></td></tr>`).join("")
  }</tbody></table>`;
}

function limitations(records: AppResearch[]): string {
  // "Fought back" = genuinely hard: blocked, low-confidence, no clear API, or unknown access — not every flagged nuance.
  const hard = records
    .filter((r) => r.buildability === "blocked" || r.confidence < 0.65 || r.self_serve === "unknown" || r.api_surface.type === "none")
    .sort((a, b) => a.confidence - b.confidence);
  if (!hard.length) return `<p class="dim">No apps flagged as traps or blockers.</p>`;
  const item = (r: AppResearch): string => {
    const why = r.buildability === "blocked"
      ? `<span class="badge crit">blocked</span> ${esc(r.main_blocker ?? "no viable public API")}`
      : `<span class="badge warn">confidence ${r.confidence.toFixed(2)}</span> ${esc(r.main_blocker ?? r.self_serve_notes ?? "low-confidence — flagged for human review")}`;
    return `<li><b>${esc(r.name)}</b> — ${why}</li>`;
  };
  return `<ul class="limits">${hard.map(item).join("")}</ul>`;
}

function demoBlock(demo?: Demo): string {
  if (!demo || !demo.steps?.length) {
    return `<p class="dim">Live Notion toolkit demo runs via <code>npm run demo:notion</code>; the captured run embeds here once executed.</p>`;
  }
  const steps = demo.steps.map((s) =>
    `<div class="step"><span class="mono">${esc(s.tool ?? "tool")}</span></div>`).join("");
  const linkUrl = safeUrl(demo.publicUrl ?? demo.pageUrl);
  const when = demo.ranAt ? `<span class="dim" style="font-family:var(--mono);font-size:12px"> · live-run ${esc(demo.ranAt)}</span>` : "";
  const link = linkUrl ? `<p><a href="${esc(linkUrl)}" target="_blank" rel="noopener">Open the live Notion page the agent wrote to ↗</a>${when}</p>` : "";
  return `<div class="demo">${steps}</div>${link}`;
}

export function renderPage(data: PageData): string {
  const { records, clusters, accuracy } = data;
  const first = pct(accuracy.firstPass.overall);
  const after = pct(accuracy.afterLoops.overall);
  const sample = accuracy.firstPass.perField
    ? Object.values(accuracy.firstPass.perField).reduce((n, v) => n + v.total, 0)
    : 0;
  const perField = accuracy.afterLoops.perField as Record<string, { correct: number; total: number; accuracy: number }>;
  const fieldChips = Object.keys(perField).filter((f) => perField[f]?.total)
    .map((f) => `<span class="tag">${esc(f)}: ${Math.round(perField[f].accuracy * 100)}% (${perField[f].correct}/${perField[f].total})</span>`).join(" ");
  const firstMiss = new Set(accuracy.firstPass.misses.map((m) => `${m.app_id}/${m.field}`));
  const afterMiss = new Set(accuracy.afterLoops.misses.map((m) => `${m.app_id}/${m.field}`));
  const fixed = [...firstMiss].filter((x) => !afterMiss.has(x)).length;
  const regressions = [...afterMiss].filter((x) => !firstMiss.has(x)).length;
  const buildableNow = clusters.buildability["buildable-now"] ?? 0;
  const categories = [...new Set(records.map((r) => r.category))];

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Composio — 100-App Buildability Research</title>
<style>
:root{--ground:#FAFBFB;--surface:#FFF;--surface-2:#F0F4F3;--border:#DBE3E2;--ink:#0F1E1C;--muted:#566564;--accent:#0C8578;--accent-soft:rgba(12,133,120,.09);--good:#0E8A5F;--good-soft:rgba(14,138,95,.10);--warn:#A35A08;--warn-soft:rgba(163,90,8,.10);--crit:#C6392C;--crit-soft:rgba(198,57,44,.09);--mono:ui-monospace,"SF Mono",Menlo,monospace;--sans:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
@media (prefers-color-scheme:dark){:root{--ground:#080B0C;--surface:#0F1517;--surface-2:#141C1F;--border:#212E32;--ink:#E7EEEC;--muted:#93A3A1;--accent:#2DD4BF;--accent-soft:rgba(45,212,191,.11);--good:#34D399;--good-soft:rgba(52,211,153,.12);--warn:#FBBF24;--warn-soft:rgba(251,191,36,.13);--crit:#F87171;--crit-soft:rgba(248,113,113,.12)}}
:root[data-theme="dark"]{--ground:#080B0C;--surface:#0F1517;--surface-2:#141C1F;--border:#212E32;--ink:#E7EEEC;--muted:#93A3A1;--accent:#2DD4BF;--accent-soft:rgba(45,212,191,.11);--good:#34D399;--good-soft:rgba(52,211,153,.12);--warn:#FBBF24;--warn-soft:rgba(251,191,36,.13);--crit:#F87171;--crit-soft:rgba(248,113,113,.12)}
:root[data-theme="light"]{--ground:#FAFBFB;--surface:#FFF;--surface-2:#F0F4F3;--border:#DBE3E2;--ink:#0F1E1C;--muted:#566564;--accent:#0C8578;--accent-soft:rgba(12,133,120,.09);--good:#0E8A5F;--good-soft:rgba(14,138,95,.10);--warn:#A35A08;--warn-soft:rgba(163,90,8,.10);--crit:#C6392C;--crit-soft:rgba(198,57,44,.09)}
*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);font-family:var(--sans);line-height:1.6;-webkit-font-smoothing:antialiased}
.wrap{max-width:1100px;margin:0 auto;padding:0 24px}
.topbar{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--ground) 88%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--border)}
.topbar-in{display:flex;align-items:center;justify-content:space-between;height:52px}
.brand{font-family:var(--mono);font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);display:flex;gap:9px;align-items:center}
.dot{width:7px;height:7px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.toggle{font-family:var(--mono);font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);background:var(--surface-2);border:1px solid var(--border);border-radius:999px;padding:6px 12px;cursor:pointer}
.hero{padding:56px 0 36px;border-bottom:1px solid var(--border)}
.eyebrow{font-family:var(--mono);font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--accent);margin:0 0 16px}
h1{font-size:clamp(28px,5vw,44px);line-height:1.07;letter-spacing:-.02em;margin:0 0 16px;font-weight:680;text-wrap:balance}
.lede{font-size:clamp(15px,2vw,18px);color:var(--muted);max-width:64ch;margin:0}
section{padding:44px 0;border-bottom:1px solid var(--border)}
.kicker{font-family:var(--mono);font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:0 0 8px}
h2{font-size:clamp(20px,3vw,26px);letter-spacing:-.015em;margin:0 0 18px;font-weight:640}
.headlines{list-style:none;padding:0;margin:0;display:grid;gap:12px}
.headlines li{font-size:clamp(16px,2.4vw,20px);font-weight:560;padding-left:20px;position:relative}
.headlines li::before{content:"◆";position:absolute;left:0;color:var(--accent);font-size:12px;top:5px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:28px}
@media (max-width:760px){.grid2{grid-template-columns:1fr}}
.cat-row{display:grid;grid-template-columns:150px 1fr 52px;gap:12px;align-items:center;margin-bottom:8px;font-size:13px}
.cat-name{color:var(--muted)}
.cat-bar{height:8px;background:var(--surface-2);border-radius:999px;overflow:hidden}
.cat-fill{display:block;height:100%;background:var(--accent)}
.cat-num{text-align:right;color:var(--muted)}
.controls{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px}
.controls input,.controls select{font-family:var(--sans);font-size:13px;padding:8px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--ink)}
.controls input{flex:1;min-width:180px}
.tbl-scroll{overflow-x:auto;border:1px solid var(--border);border-radius:12px}
table{width:100%;border-collapse:collapse;font-size:13px}
thead th{text-align:left;padding:10px 12px;font-family:var(--mono);font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);border-bottom:1px solid var(--border);cursor:pointer;white-space:nowrap;background:var(--surface-2)}
tbody td{padding:10px 12px;border-bottom:1px solid var(--border);vertical-align:top}
tbody tr:last-child td{border-bottom:none}
.num{font-family:var(--mono);color:var(--muted);width:1%}
.mono{font-family:var(--mono);font-size:12px}
.app-name{display:block;font-weight:600}
.one-liner{display:block;color:var(--muted);font-size:12px;max-width:32ch}
.cat{color:var(--muted);white-space:nowrap}
.dim{color:var(--muted)}
.blocker{color:var(--muted);max-width:24ch}
a{color:var(--accent)}
.badge{font-family:var(--mono);font-size:11px;padding:2px 7px;border-radius:5px;border:1px solid var(--border);white-space:nowrap}
.badge.good{color:var(--good);background:var(--good-soft);border-color:color-mix(in srgb,var(--good) 40%,transparent)}
.badge.warn{color:var(--warn);background:var(--warn-soft);border-color:color-mix(in srgb,var(--warn) 40%,transparent)}
.badge.crit{color:var(--crit);background:var(--crit-soft);border-color:color-mix(in srgb,var(--crit) 40%,transparent)}
.badge.neutral{color:var(--muted);background:var(--surface-2)}
.lift{display:flex;align-items:center;gap:20px;flex-wrap:wrap;background:var(--accent-soft);border:1px solid var(--accent);border-radius:12px;padding:20px 24px}
.lift .big{font-family:var(--mono);font-size:clamp(24px,5vw,34px);font-weight:700;color:var(--accent);font-variant-numeric:tabular-nums}
.lift .big .arrow{opacity:.5;margin:0 8px}
.lift p{margin:0;color:var(--ink);max-width:44ch;font-size:14px}
.tag{font-family:var(--mono);font-size:11px;padding:2px 6px;border-radius:5px;background:var(--surface-2);border:1px solid var(--border);color:var(--muted)}
.limits{padding-left:0;list-style:none;display:grid;gap:10px}
.limits li{padding:10px 14px;background:var(--surface);border:1px solid var(--border);border-radius:8px;font-size:14px}
.misses{margin-top:8px}
.demo{display:flex;gap:8px;flex-wrap:wrap}
.demo .step{font-family:var(--mono);font-size:12px;padding:6px 10px;border:1px solid var(--border);border-radius:7px;background:var(--surface-2)}
code{font-family:var(--mono);font-size:12px;background:var(--surface-2);padding:2px 6px;border-radius:5px}
footer{padding:30px 0 60px;color:var(--muted);font-family:var(--mono);font-size:12px}
.flow{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
.flow .node{font-family:var(--mono);font-size:12px;padding:8px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface)}
.flow .arrow{align-self:center;color:var(--muted)}
</style>
</head>
<body>
<div class="topbar"><div class="wrap topbar-in"><div class="brand"><span class="dot"></span> Composio · Buildability Research</div><button class="toggle" id="tg" type="button">Theme</button></div></div>
<div class="wrap">
<header class="hero">
<p class="eyebrow">100 apps · researched by an agent · accuracy-verified</p>
<h1>Which of these 100 apps can be an agent toolkit today — and which need a sales call?</h1>
<p class="lede">An agent (Claude + Composio's SDK &amp; managed toolkits + Firecrawl) researched every app's auth, self-serve path, API surface and existing MCP, then verified its own answers against live docs and a hand-audited sample.</p>
</header>

<section>
<p class="kicker">The headline</p>
<h2>What the 100 apps tell us</h2>
<ul class="headlines">
${headlineList(clusters)}
</ul>
<div class="grid2" style="margin-top:26px">
<div><p class="kicker">Self-serve share by category</p>${selfServeByCategory(clusters)}</div>
<div><p class="kicker">Buildable today</p><div class="lift"><div class="big">${buildableNow}<span class="dim" style="font-size:16px"> / ${records.length}</span></div><p>apps a developer could turn into an agent toolkit right now with self-serve credentials.</p></div></div>
</div>
</section>

<section>
<p class="kicker">The findings</p>
<h2>All ${records.length} apps</h2>
<p class="dim" style="margin:-8px 0 16px;font-size:14px;max-width:70ch">Filterable and sortable. Colour marks self-serve access and buildability. <b>Caveat:</b> the <span class="tag">MCP</span> column is the agent's least-reliable call (~60% on our audit) — it over-detects "yes"; treat it as a lead to verify, not ground truth.</p>
<div class="controls">
<input id="q" type="text" placeholder="Search app…" aria-label="Search apps">
<select id="cat" aria-label="Filter by category"><option value="">All categories</option>${categories.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("")}</select>
</div>
<div class="tbl-scroll">
<table id="matrix">
<thead><tr>
<th data-sort="num">#</th><th data-sort="str">App</th><th data-sort="str">Category</th><th data-sort="str">Auth</th><th data-sort="str">Self-serve</th><th data-sort="str">API</th><th data-sort="str">MCP</th><th data-sort="str">Buildable</th><th data-sort="str">Blocker</th><th>Evidence</th>
</tr></thead>
<tbody>
${matrixRows(records)}
</tbody>
</table>
</div>
</section>

<section>
<p class="kicker">The agent</p>
<h2>What it does, and where a human was needed</h2>
<div class="flow">
<span class="node">100 apps</span><span class="arrow">→</span>
<span class="node">Composio Search + Firecrawl</span><span class="arrow">→</span>
<span class="node">Claude extract → schema</span><span class="arrow">→</span>
<span class="node">verify loops</span><span class="arrow">→</span>
<span class="node">this page</span>
</div>
<p>Per app, Claude runs a short tool-calling loop over Composio's search toolkit and Firecrawl-scraped docs, then extracts a strict, evidence-cited record. <b>A human was needed</b> for the deliberately hard cases — obscure fintech, OSS-vs-SaaS ambiguity, and enterprise-gated apps — where the agent flagged low confidence and a person adjudicated against real docs.</p>
</section>

<section>
<p class="kicker">The proof</p>
<h2>A real Composio toolkit, live</h2>
<p>To prove a "buildable" verdict actually builds, a Claude agent connected Notion through Composio and performed a real action:</p>
${demoBlock(data.demo)}
</section>

<section>
<p class="kicker">The verification</p>
<h2>How we know it's trustworthy — and where it isn't</h2>
<div class="grid2">
<div>
<div class="lift"><div class="big">${first}%<span class="arrow">→</span>${after}%</div><p>Accuracy on a ${sample}-field hand-audit — a 15-app stratified sample (≥1 per category, plus every trap app), first pass versus after the verification loops.</p></div>
<p style="margin-top:14px;font-size:14px;color:var(--muted)">The loops corrected <b>${fixed}</b> field${fixed === 1 ? "" : "s"} with <b>${regressions}</b> regression${regressions === 1 ? "" : "s"}. The catch: <b>Mermaid CLI</b> looks like a SaaS but is an open-source library with no hosted API — correctly downgraded from <span class="badge good">buildable-now</span> to <span class="badge crit">blocked</span>.</p>
</div>
<div>
<p class="kicker">Per-field accuracy, after verification</p>
<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">${fieldChips}</div>
<p style="font-size:14px;color:var(--muted)"><b>The honest finding:</b> a naive LLM self-critic <i>lowered</i> accuracy — it wrongly flipped Stripe to "contact sales." So a correction is accepted only when the critic marks a field <span class="tag">contradicted</span> (evidence disagrees), never on a bare <span class="tag">unsupported</span>. Verification's real value here is <b>triage</b> — flagging what a human must check — not blanket auto-correction. <code>existing_mcp</code> stays our weakest field and we show it. <span class="dim">(The audit scores the four decision fields above; <code>auth_methods</code> is reported but not formally scored.)</span></p>
</div>
</div>
<p class="kicker" style="margin-top:26px">The misses we still get wrong — shown honestly</p>
${missesTable(accuracy)}
</section>

<section>
<p class="kicker">Honesty</p>
<h2>Limitations &amp; the apps that fought back</h2>
<p class="dim" style="margin:-6px 0 18px;font-size:14px;max-width:70ch">Two things we'd flag to a reviewer before trusting this at scale: <b>(1) MCP over-detection</b> — the agent marks <code>existing_mcp: yes</code> far too readily (97/100), because it conflates "has an API you could wrap" with "ships a real MCP server"; our audit puts this field at ~60% (on a 5-app slice). <b>(2) Determinism</b> — a transient scrape/LLM error used to silently drop an app to its first-pass answer; the pipeline now logs every fallback, and the committed cache makes the reported run byte-reproducible. Below, the ${records.filter((r) => r.buildability === "blocked" || r.confidence < 0.65 || r.self_serve === "unknown" || r.api_surface.type === "none").length} apps the agent itself was least sure of.</p>
${limitations(records)}
</section>

<footer>Generated from data/verified.json · research agent source in the repo README · self-contained, no external requests.</footer>
</div>
<script>
(function(){
var root=document.documentElement,tg=document.getElementById("tg");
function cur(){var s=root.getAttribute("data-theme");return s||(window.matchMedia("(prefers-color-scheme:dark)").matches?"dark":"light")}
tg.addEventListener("click",function(){root.setAttribute("data-theme",cur()==="dark"?"light":"dark")});
var q=document.getElementById("q"),cat=document.getElementById("cat"),tb=document.querySelector("#matrix tbody");
var rows=[].slice.call(tb.querySelectorAll("tr"));
function filter(){var t=q.value.toLowerCase(),c=cat.value;rows.forEach(function(r){var ok=(!t||r.getAttribute("data-name").indexOf(t)>=0)&&(!c||r.getAttribute("data-category")===c);r.style.display=ok?"":"none"})}
q.addEventListener("input",filter);cat.addEventListener("change",filter);
var ths=document.querySelectorAll("#matrix thead th"),dir={};
ths.forEach(function(th,i){if(!th.getAttribute("data-sort"))return;th.addEventListener("click",function(){var kind=th.getAttribute("data-sort");dir[i]=!dir[i];var vis=rows.slice();vis.sort(function(a,b){var x=a.children[i].innerText.trim(),y=b.children[i].innerText.trim();var r=kind==="num"?(parseFloat(x)||0)-(parseFloat(y)||0):x.localeCompare(y);return dir[i]?r:-r});vis.forEach(function(r){tb.appendChild(r)})})});
})();
</script>
</body>
</html>`;
}
