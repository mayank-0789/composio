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
