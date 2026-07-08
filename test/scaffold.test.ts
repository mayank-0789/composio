import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("scaffold", () => {
  it("apps.json has 100 valid rows", () => {
    const apps = JSON.parse(readFileSync("data/apps.json", "utf8"));
    expect(apps).toHaveLength(100);
    for (const a of apps) {
      expect(typeof a.id).toBe("number");
      expect(a.name.length).toBeGreaterThan(0);
      expect(a.website.length).toBeGreaterThan(0);
      expect(a.category.length).toBeGreaterThan(0);
    }
    expect(new Set(apps.map((a: any) => a.id)).size).toBe(100);
  });
});
