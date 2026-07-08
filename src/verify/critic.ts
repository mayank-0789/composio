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
export type CriticResult = { app_id: number; verdicts: z.infer<typeof CriticOut>["verdicts"]; revised: AppResearch };

export async function criticReview(
  record: AppResearch, evidenceText: string, deps: { llm: Llm },
): Promise<CriticResult> {
  const model = record.confidence < 0.6 ? "claude-opus-4-8" : "claude-sonnet-5";
  const system =
    "You are a skeptical fact-checker. For each field of the record, decide if the EVIDENCE supports it, " +
    "does not support it, or contradicts it. Correct any wrong field in `revised`. Do not invent evidence. " +
    "If evidence is insufficient, prefer 'unknown' values and lower confidence.";
  const user = `RECORD:\n${JSON.stringify(record, null, 2)}\n\nEVIDENCE:\n${evidenceText}`;
  const out = await deps.llm.extract({ model, system, user, schema: CriticOut, schemaName: "CriticOut" });
  return { app_id: record.id, verdicts: out.verdicts, revised: out.revised };
}
