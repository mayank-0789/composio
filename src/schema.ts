import { z } from "zod";

export const AuthMethod = z.enum(["OAuth2", "API key", "Basic", "Token", "Other"]);
export const SelfServe = z.enum([
  "self-serve-free", "self-serve-trial", "paid-plan",
  "admin-approval", "partnership-contact-sales", "unknown",
]);
export const ApiType = z.enum(["REST", "GraphQL", "SDK-only", "none", "unknown"]);
export const Breadth = z.enum(["narrow", "medium", "broad", "unknown"]);
export const Buildability = z.enum(["buildable-now", "buildable-with-caveats", "blocked"]);

export const AppInput = z.object({
  id: z.number(), name: z.string().min(1),
  website: z.string().min(1), category: z.string().min(1),
});
export type AppInput = z.infer<typeof AppInput>;

export const AppResearch = z.object({
  id: z.number(),
  name: z.string(),
  website: z.string(),
  category: z.string(),
  one_liner: z.string().min(1),
  auth_methods: z.array(z.object({ method: AuthMethod, notes: z.string().optional() })).min(1),
  self_serve: SelfServe,
  self_serve_notes: z.string().optional(),
  api_surface: z.object({ type: ApiType, breadth: Breadth, notes: z.string().optional() }),
  existing_mcp: z.object({ exists: z.enum(["yes", "no", "unknown"]), url: z.string().url().optional() }),
  buildability: Buildability,
  main_blocker: z.string().nullable(),
  evidence: z.array(z.object({ url: z.string().url(), supports: z.string() })).min(1),
  confidence: z.number().min(0).max(1),
  flags: z.array(z.string()),
});
export type AppResearch = z.infer<typeof AppResearch>;

export function parseAppResearch(input: unknown): AppResearch {
  return AppResearch.parse(input);
}
