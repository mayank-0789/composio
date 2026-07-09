import { z } from "zod";
import { AppResearch } from "../schema.js";
import type { Llm } from "../llm.js";

const CriticOut = z.object({
  verdicts: z.array(z.object({
    field: z.string(),
    status: z.enum(["supported", "unsupported", "contradicted"]),
    note: z.string(),
  })),
  revised: AppResearch,
});
export type Verdict = z.infer<typeof CriticOut>["verdicts"][number];
export type CriticResult = { app_id: number; verdicts: Verdict[]; revised: AppResearch; rawRevised: AppResearch };

// Fields whose value we only overwrite on a *contradicted* verdict; each carries its dependent notes.
const GATED: Array<{ keys: (keyof AppResearch)[]; match: string }> = [
  { keys: ["auth_methods"], match: "auth" },
  { keys: ["self_serve", "self_serve_notes"], match: "self_serve" },
  { keys: ["api_surface"], match: "api_surface" },
  { keys: ["existing_mcp"], match: "existing_mcp" },
  { keys: ["buildability", "main_blocker"], match: "buildability" },
];
const canon = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

// Accept the critic's edit for a field only when it explicitly marked that field "contradicted"
// (evidence actively disagrees). An "unsupported" verdict (evidence merely absent) must not override
// a first-pass answer that carried its own evidence — that is what over-corrects true positives.
export function gateRevision(original: AppResearch, revised: AppResearch, verdicts: Verdict[]): AppResearch {
  const contradicted = (match: string) =>
    verdicts.some((v) => v.status === "contradicted" && (canon(v.field).includes(canon(match)) || canon(match).includes(canon(v.field))));
  // keep the critic's judgment on safe, non-categorical fields (confidence, flags, one_liner, evidence)
  const out: AppResearch = { ...revised };
  for (const { keys, match } of GATED) {
    if (!contradicted(match)) for (const k of keys) (out as Record<string, unknown>)[k] = original[k];
  }
  return AppResearch.parse(out);
}

export async function criticReview(
  record: AppResearch, evidenceText: string, deps: { llm: Llm },
): Promise<CriticResult> {
  const model = record.confidence < 0.6 ? "claude-opus-4-8" : "claude-sonnet-5";
  const system =
    "You are a skeptical fact-checker verifying an app-research record against the EVIDENCE. For each field decide " +
    "if the evidence supports it, does not support it, or contradicts it, and correct any wrong field in `revised`. " +
    "Use 'contradicted' only when the evidence actively disagrees with the field; use 'unsupported' when the evidence " +
    "is merely silent. Apply these checks strictly:\n" +
    "- existing_mcp: mark 'yes' ONLY if the evidence shows a dedicated Model Context Protocol (MCP) server for this app. " +
    "A link to the app's own GitHub repo, homepage, or API docs is NOT an MCP server — set exists='no' (or 'unknown' if genuinely unclear) and drop the url.\n" +
    "- buildability: an app a developer cannot call over a hosted/public API — e.g. an open-source CLI or library with no hosted service, or an enterprise product with no self-serve API — is NOT 'buildable-now'; use 'blocked' (no viable path) or 'buildable-with-caveats' and state the blocker.\n" +
    "- self_serve / auth_methods / api_surface: base strictly on how a developer actually obtains and uses credentials per the evidence.\n" +
    "Do not invent evidence. When evidence is insufficient, prefer 'unknown' and lower confidence.";
  const user = `RECORD:\n${JSON.stringify(record, null, 2)}\n\nEVIDENCE:\n${evidenceText}`;
  const out = await deps.llm.extract({ model, system, user, schema: CriticOut, schemaName: "CriticOut" });
  return { app_id: record.id, verdicts: out.verdicts, revised: gateRevision(record, out.revised, out.verdicts), rawRevised: out.revised };
}
