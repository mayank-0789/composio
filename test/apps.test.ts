import { describe, it, expect } from "vitest";
import { loadApps } from "../src/apps.js";

describe("loadApps", () => {
  it("loads and validates 100 apps", () => {
    const apps = loadApps();
    expect(apps).toHaveLength(100);
    expect(apps[0]).toHaveProperty("category");
  });
});
