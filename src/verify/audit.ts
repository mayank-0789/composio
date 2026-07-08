import { AppResearch } from "../schema.js";

export type FieldName = "auth_methods" | "self_serve" | "api_surface" | "existing_mcp" | "buildability";
export type GroundTruth = { app_id: number; fields: Partial<Record<FieldName, string>> };
export type Miss = { app_id: number; field: FieldName; expected: string; got: string };
export type AccuracyReport = {
  overall: number;
  perField: Record<FieldName, { correct: number; total: number; accuracy: number }>;
  misses: Miss[];
};

const ALL: FieldName[] = ["auth_methods", "self_serve", "api_surface", "existing_mcp", "buildability"];

export function normalizeField(r: AppResearch, f: FieldName): string {
  switch (f) {
    case "auth_methods": return r.auth_methods.map((a) => a.method).sort().join("|");
    case "self_serve": return r.self_serve;
    case "api_surface": return r.api_surface.type;
    case "existing_mcp": return r.existing_mcp.exists;
    case "buildability": return r.buildability;
  }
}

export function scoreAccuracy(records: AppResearch[], truth: GroundTruth[], fields: FieldName[] = ALL): AccuracyReport {
  const byId = new Map(records.map((r) => [r.id, r]));
  const perField = {} as AccuracyReport["perField"];
  const misses: Miss[] = [];
  let correctAll = 0, totalAll = 0;
  for (const f of fields) {
    let correct = 0, total = 0;
    for (const g of truth) {
      const expected = g.fields[f];
      if (expected === undefined) continue;
      const rec = byId.get(g.app_id);
      if (!rec) continue;
      const got = normalizeField(rec, f);
      total++;
      if (got === expected) correct++;
      else misses.push({ app_id: g.app_id, field: f, expected, got });
    }
    perField[f] = { correct, total, accuracy: total ? correct / total : 0 };
    correctAll += correct; totalAll += total;
  }
  return { overall: totalAll ? correctAll / totalAll : 0, perField, misses };
}
