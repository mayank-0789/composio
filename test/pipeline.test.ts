import { describe, it, expect } from "vitest";
import { parseArgs } from "../src/pipeline.js";

describe("parseArgs", () => {
  it("defaults to all stages, no dry-run", () => {
    expect(parseArgs([])).toEqual({ stage: "all", dryRun: false, refresh: false, limit: undefined });
  });
  it("parses stage, dry-run, refresh, limit", () => {
    expect(parseArgs(["--stage=research", "--dry-run", "--refresh", "--limit=5"]))
      .toEqual({ stage: "research", dryRun: true, refresh: true, limit: 5 });
  });
});
