import { describe, it, expect, vi } from "vitest";
import { criticReview } from "../src/verify/critic.js";

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
