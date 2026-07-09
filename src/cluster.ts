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
  const headlines = [
    topAuth ? `${topAuth[0]} is the dominant auth method (${topAuth[1]} of ${records.length} apps) — a managed-auth layer covers most of the field.` : "",
    `${selfServeCount}/${records.length} apps are self-serve — the easy wins; the rest need paid plans or outreach.`,
    `${buildableNow}/${records.length} apps are buildable into an agent toolkit today; ${caveats} come with caveats and ${blocked} are blocked outright.`,
    `${instantWins}/${records.length} apps are instant wins — self-serve credentials AND buildable now — while ${needsOutreach} need a paid plan, admin approval, or a sales conversation first.`,
  ].filter(Boolean);

  return {
    authDistribution, selfServeByCategory, mcpCoverage, buildability,
    topBlocker: topBlocker ? { blocker: topBlocker[0], count: topBlocker[1] } : null,
    headlines,
  };
}
