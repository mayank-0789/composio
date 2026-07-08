import { describe, it, expect } from "vitest";
import { computeClusters } from "../src/cluster.js";

const rec = (o: Record<string, any>) => ({
  id: o.id, name: "n", website: "n.com", category: o.category, one_liner: "x",
  auth_methods: o.auth.map((m: string) => ({ method: m })), self_serve: o.self,
  api_surface: { type: "REST", breadth: "broad" }, existing_mcp: { exists: o.mcp ?? "no" },
  buildability: o.build, main_blocker: o.blocker ?? null,
  evidence: [{ url: "https://n.com", supports: "x" }], confidence: 0.9, flags: [],
}) as any;

describe("computeClusters", () => {
  it("aggregates auth, self-serve by category, mcp, buildability, top blocker", () => {
    const records = [
      rec({ id: 1, category: "CRM", auth: ["OAuth2"], self: "self-serve-free", build: "buildable-now" }),
      rec({ id: 2, category: "CRM", auth: ["API key"], self: "partnership-contact-sales", build: "blocked", blocker: "partner-gated" }),
      rec({ id: 3, category: "Fintech", auth: ["OAuth2"], self: "paid-plan", build: "blocked", blocker: "partner-gated", mcp: "yes" }),
    ];
    const c = computeClusters(records);
    expect(c.authDistribution).toEqual({ OAuth2: 2, "API key": 1 });
    expect(c.selfServeByCategory.CRM["self-serve-free"]).toBe(1);
    expect(c.mcpCoverage).toEqual({ yes: 1, no: 2, unknown: 0 });
    expect(c.topBlocker).toEqual({ blocker: "partner-gated", count: 2 });
    expect(c.headlines.length).toBeGreaterThan(0);
  });
});
