import { describe, it, expect } from "vitest";
import { classifySelfServe } from "../src/verify/browser.js";

describe("classifySelfServe", () => {
  it("flags contact-sales gating", () => {
    const r = classifySelfServe("Enterprise plan — Contact sales to request access.");
    expect(r?.hint).toBe("partnership-contact-sales");
  });
  it("flags free self-serve signup", () => {
    const r = classifySelfServe("Start for free. Sign up and get your API key instantly.");
    expect(r?.hint).toBe("self-serve-free");
  });
  it("prefers self-serve when a page shows both a free tier and a contact-sales CTA", () => {
    const r = classifySelfServe("Start for free. Enterprise? Contact sales to talk to sales.");
    expect(r?.hint).toBe("self-serve-free");
  });
  it("returns null when ambiguous", () => {
    expect(classifySelfServe("We build software for teams.")).toBeNull();
  });
});
