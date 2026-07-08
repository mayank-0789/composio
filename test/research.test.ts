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
