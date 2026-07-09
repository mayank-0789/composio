import { AppResearch } from "./schema.js";

export type Clusters = {
  authDistribution: Record<string, number>;
  selfServeByCategory: Record<string, Record<string, number>>;
  mcpCoverage: { yes: number; no: number; unknown: number };
  buildability: Record<string, number>;
  topBlocker: { blocker: string; count: number } | null;
  blockerThemes: Record<string, number>;
  headlines: string[];
};

const SELF_SERVE = new Set(["self-serve-free", "self-serve-trial"]);

// Raw main_blocker strings are unique per app; the real pattern is the *theme*.
function blockerTheme(r: AppResearch): string {
  const t = `${r.main_blocker ?? ""} ${r.flags.join(" ")}`.toLowerCase();
  if (/no (hosted|public) api|open-source|open source|\bcli\b|library|self-host|not a saas|\bpackage\b/.test(t)) return "no hosted public API (open-source / CLI)";
  if (/enterprise|partner|contact sales|approval|gated|request access/.test(t)) return "enterprise / partnership / approval gate";
  if (/paid|subscription|no free|free tier|trial only/.test(t)) return "requires a paid plan";
  if (/mcp/.test(t)) return "MCP still maturing (pilot / beta / none)";
  return "other";
}

export function computeClusters(records: AppResearch[]): Clusters {
  const authDistribution: Record<string, number> = {};
  const authApps: Record<string, number> = {};
  const selfServeByCategory: Record<string, Record<string, number>> = {};
  const mcpCoverage = { yes: 0, no: 0, unknown: 0 };
  const buildability: Record<string, number> = {};
  const blockers: Record<string, number> = {};

  for (const r of records) {
    for (const a of r.auth_methods) authDistribution[a.method] = (authDistribution[a.method] ?? 0) + 1;
    for (const m of new Set(r.auth_methods.map((a) => a.method))) authApps[m] = (authApps[m] ?? 0) + 1;
    (selfServeByCategory[r.category] ??= {});
    selfServeByCategory[r.category][r.self_serve] = (selfServeByCategory[r.category][r.self_serve] ?? 0) + 1;
    mcpCoverage[r.existing_mcp.exists] += 1;
    buildability[r.buildability] = (buildability[r.buildability] ?? 0) + 1;
    if (r.main_blocker) blockers[r.main_blocker] = (blockers[r.main_blocker] ?? 0) + 1;
  }

  const topBlocker = Object.entries(blockers).sort((a, b) => b[1] - a[1])[0];
  const selfServeCount = records.filter((r) => SELF_SERVE.has(r.self_serve)).length;
  const topAuth = Object.entries(authApps).sort((a, b) => b[1] - a[1])[0];

  const buildableNow = buildability["buildable-now"] ?? 0;
  const caveats = buildability["buildable-with-caveats"] ?? 0;
  const blocked = buildability["blocked"] ?? 0;
  const instantWins = records.filter((r) => SELF_SERVE.has(r.self_serve) && r.buildability === "buildable-now").length;
  const needsOutreach = records.filter((r) =>
    ["partnership-contact-sales", "admin-approval"].includes(r.self_serve) || r.buildability === "blocked").length;
  const blockerThemes: Record<string, number> = {};
  let blockedTotal = 0;
  for (const r of records) if (r.buildability !== "buildable-now" && r.main_blocker) {
    blockerThemes[blockerTheme(r)] = (blockerThemes[blockerTheme(r)] ?? 0) + 1;
    blockedTotal++;
  }
  const topTheme = Object.entries(blockerThemes).sort((a, b) => b[1] - a[1])[0];
  const headlines = [
    topAuth ? `${topAuth[0]} is the dominant auth method (${topAuth[1]} of ${records.length} apps) — a managed-auth layer covers most of the field.` : "",
    `${selfServeCount}/${records.length} apps are self-serve — the easy wins; the rest need paid plans or outreach.`,
    `${instantWins}/${records.length} apps are instant wins — self-serve credentials AND buildable now — while ${needsOutreach} need a paid plan, admin approval, or a sales conversation first.`,
    topTheme ? `The most common blocker isn't technical — it's ${topTheme[0]} (${topTheme[1]} of the ${blockedTotal} not-buildable-now apps); the work there is outreach, not engineering.` : "",
  ].filter(Boolean);

  return {
    authDistribution, selfServeByCategory, mcpCoverage, buildability,
    topBlocker: topBlocker ? { blocker: topBlocker[0], count: topBlocker[1] } : null,
    blockerThemes,
    headlines,
  };
}
