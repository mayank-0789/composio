import { describe, it, expect, vi } from "vitest";
import { criticReview, gateRevision } from "../src/verify/critic.js";

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

describe("gateRevision", () => {
  const revised = { ...record, self_serve: "partnership-contact-sales", buildability: "blocked", main_blocker: "no hosted API", confidence: 0.4 };

  it("keeps the first-pass value when the verdict is merely 'unsupported'", () => {
    const out = gateRevision(record, revised, [
      { field: "self_serve", status: "unsupported", note: "" },
      { field: "buildability", status: "unsupported", note: "" },
    ]);
    expect(out.self_serve).toBe("self-serve-free");
    expect(out.buildability).toBe("buildable-now");
  });

  it("accepts the edit when the verdict is 'contradicted'", () => {
    const out = gateRevision(record, revised, [{ field: "buildability", status: "contradicted", note: "it's a CLI" }]);
    expect(out.buildability).toBe("blocked");
    expect(out.self_serve).toBe("self-serve-free"); // untouched field stays first-pass
  });

  it("still adopts safe non-categorical fields (lowered confidence) regardless of verdict", () => {
    const out = gateRevision(record, revised, [{ field: "self_serve", status: "unsupported", note: "" }]);
    expect(out.confidence).toBe(0.4);
  });
});
