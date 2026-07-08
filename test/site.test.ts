import { describe, it, expect } from "vitest";
import { renderPage } from "../site/template.js";

const records: any = [{
  id: 1, name: "Stripe", website: "stripe.com", category: "Finance and Fintech", one_liner: "Payments.",
  auth_methods: [{ method: "API key" }], self_serve: "self-serve-free",
  api_surface: { type: "REST", breadth: "broad" }, existing_mcp: { exists: "no" },
  buildability: "buildable-now", main_blocker: null,
  evidence: [{ url: "https://stripe.com/docs/api", supports: "REST" }], confidence: 0.9, flags: [],
}];
const clusters: any = { authDistribution: { "API key": 1 }, selfServeByCategory: { "Finance and Fintech": { "self-serve-free": 1 } }, mcpCoverage: { yes: 0, no: 1, unknown: 0 }, buildability: { "buildable-now": 1 }, topBlocker: null, headlines: ["API key dominates."] };
const accuracy: any = { firstPass: { overall: 0.74, perField: {}, misses: [] }, afterLoops: { overall: 0.93, perField: {}, misses: [] } };

describe("renderPage", () => {
  it("produces one self-contained HTML doc with the headline, matrix, and accuracy lift", () => {
    const html = renderPage({ records, clusters, accuracy });
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("API key dominates.");
    expect(html).toContain("Stripe");
    expect(html).toContain("74");
    expect(html).toContain("93");
    expect(html).not.toContain("http://cdn");
  });
});
