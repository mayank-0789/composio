import { describe, it, expect } from "vitest";
import { scoreAccuracy, normalizeField } from "../src/verify/audit.js";

const rec = (over: Record<string, unknown>) => ({
  id: 1, name: "A", website: "a.com", category: "X", one_liner: "x",
  auth_methods: [{ method: "API key" }], self_serve: "self-serve-free",
  api_surface: { type: "REST", breadth: "broad" }, existing_mcp: { exists: "no" },
  buildability: "buildable-now", main_blocker: null,
  evidence: [{ url: "https://a.com", supports: "x" }], confidence: 0.9, flags: [], ...over,
}) as any;

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
