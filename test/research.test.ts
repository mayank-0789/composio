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
      search: { search: vi.fn().mockResolvedValue([{ title: "Docs", url: "https://stripe.com/docs/api", snippet: "api key auth" }]) },
      scrape: { scrape: vi.fn().mockResolvedValue({ url: "https://stripe.com/docs/api", markdown: "# API\nUse your API key." }) },
      llm: { extract: vi.fn().mockResolvedValue(extracted) },
    };
    const out = await researchApp(app, deps as any);
    expect(out.id).toBe(81);
    expect(out.name).toBe("Stripe");
    expect(out.self_serve).toBe("self-serve-free");
    expect(deps.search.search).toHaveBeenCalledTimes(3);
    expect(deps.scrape.scrape).toHaveBeenCalled();
  });

  it("feeds the scraped docs and search snippets into the extraction prompt", async () => {
    const deps = {
      search: { search: vi.fn().mockResolvedValue([{ title: "Docs", url: "https://stripe.com/docs/api", snippet: "api key auth" }]) },
      scrape: { scrape: vi.fn().mockResolvedValue({ url: "https://stripe.com/docs/api", markdown: "# API\nUse your API key." }) },
      llm: { extract: vi.fn().mockResolvedValue(extracted) },
    };
    await researchApp(app, deps as any);
    const passed: any = deps.llm.extract.mock.calls[0][0];
    expect(passed.model).toBe("claude-sonnet-5");
    expect(passed.user).toContain("Use your API key.");
    expect(passed.user).toContain("https://stripe.com/docs/api");
    expect(passed.user).toContain("api key auth");
  });

  it("survives a failed search without aborting the whole app", async () => {
    const deps = {
      search: { search: vi.fn().mockRejectedValue(new Error("search down")) },
      scrape: { scrape: vi.fn().mockResolvedValue({ url: "u", markdown: "" }) },
      llm: { extract: vi.fn().mockResolvedValue(extracted) },
    };
    const out = await researchApp(app, deps as any);
    expect(out.id).toBe(81);
    expect(deps.llm.extract).toHaveBeenCalled();
  });
});
