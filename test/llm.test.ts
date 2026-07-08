import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { createLlm } from "../src/llm.js";
import { createFileCache } from "../src/cache.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cache = () => createFileCache(mkdtempSync(join(tmpdir(), "llm-")));
const schema = z.object({ auth: z.string() });
const toolUse = (input: object) => ({ content: [{ type: "tool_use", name: "emit", input }] });

describe("createLlm.extract", () => {
  it("passes a JSON Schema derived from the zod schema as the tool input_schema", async () => {
    const create = vi.fn().mockResolvedValue(toolUse({ auth: "API key" }));
    const llm = createLlm({ apiKey: "x", client: { messages: { create } } }, cache());
    await llm.extract({ model: "claude-sonnet-5", system: "s", user: "u", schema, schemaName: "auth" });
    const body: any = create.mock.calls[0][0];
    expect(body.tools[0].input_schema.type).toBe("object");
    expect(body.tools[0].input_schema.properties).toHaveProperty("auth");
    expect(body.temperature).toBe(0);
  });
  it("returns validated tool_use input and caches it", async () => {
    const create = vi.fn().mockResolvedValue(toolUse({ auth: "API key" }));
    const llm = createLlm({ apiKey: "x", client: { messages: { create } } }, cache());
    const out = await llm.extract({ model: "claude-sonnet-5", system: "s", user: "u", schema, schemaName: "auth" });
    expect(out).toEqual({ auth: "API key" });
    expect(create).toHaveBeenCalledOnce();
  });
  it("retries once when first output is schema-invalid", async () => {
    const create = vi.fn()
      .mockResolvedValueOnce(toolUse({ auth: 123 }))
      .mockResolvedValueOnce(toolUse({ auth: "API key" }));
    const llm = createLlm({ apiKey: "x", client: { messages: { create } } }, cache());
    const out = await llm.extract({ model: "claude-sonnet-5", system: "s", user: "u", schema, schemaName: "auth" });
    expect(out).toEqual({ auth: "API key" });
    expect(create).toHaveBeenCalledTimes(2);
  });
});
