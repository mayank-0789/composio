import { z } from "zod";
import { AppInput } from "../schema.js";
import type { Searcher } from "../composio.js";
import type { Llm } from "../llm.js";

const McpVerdict = z.object({
  exists: z.enum(["yes", "no", "unknown"]),
  url: z.string().optional(),
  reason: z.string(),
});
export type McpCheck = z.infer<typeof McpVerdict>;

export async function checkMcp(app: AppInput, deps: { search: Searcher; llm: Llm }): Promise<McpCheck> {
  const s = await deps.search.search(`${app.name} Model Context Protocol MCP server`).catch(() => ({ answer: "", results: [] }));
  const evidence = [s.answer, ...s.results.slice(0, 6).map((r) => `- ${r.title} — ${r.url}`)].filter(Boolean).join("\n").slice(0, 3500);
  return deps.llm.extract({
    model: "claude-sonnet-5", schemaName: "McpVerdict", schema: McpVerdict,
    system: "Decide whether a DEDICATED Model Context Protocol (MCP) server exists for this app — a distinct server or package that exposes the app's capabilities over MCP (official or a well-known community one). The app's own product repo, homepage, or REST API docs do NOT count as an MCP server. Answer 'yes' (with the MCP server URL) only when the evidence clearly shows one; 'no' when the evidence indicates none exists; 'unknown' when unclear.",
    user: `App: ${app.name}\n\nEVIDENCE:\n${evidence}`,
  });
}
