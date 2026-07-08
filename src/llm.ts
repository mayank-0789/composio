import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { Cache } from "./cache.js";

export interface AnthropicLike {
  messages: { create(body: object): Promise<{ content?: Array<{ type: string; input?: unknown }> }> };
}
export type ExtractArgs<T> = {
  model: string; system: string; user: string;
  schema: z.ZodType<T>; schemaName: string; toolName?: string;
};
export interface Llm { extract<T>(args: ExtractArgs<T>): Promise<T>; }

export function createLlm(deps: { apiKey: string; client?: AnthropicLike }, cache: Cache): Llm {
  const client = deps.client ?? (new Anthropic({ apiKey: deps.apiKey }) as unknown as AnthropicLike);
  return {
    async extract(args) {
      const key = cache.keyFor({ m: args.model, s: args.system, u: args.user, n: args.schemaName });
      const hit = await cache.get<unknown>("llm", key);
      if (hit !== null) return args.schema.parse(hit);
      const tool = args.toolName ?? "emit";
      let lastErr = "";
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await client.messages.create({
          model: args.model, max_tokens: 2048, temperature: 0,
          system: args.system,
          tools: [{ name: tool, description: "Emit the structured result.", input_schema: { type: "object" } }],
          tool_choice: { type: "tool", name: tool },
          messages: [{ role: "user", content: attempt === 0 ? args.user : `${args.user}\n\nPrevious output was invalid: ${lastErr}. Return valid data.` }],
        });
        const block = (res.content ?? []).find((b) => b.type === "tool_use");
        const parsed = args.schema.safeParse(block?.input);
        if (parsed.success) { await cache.set("llm", key, parsed.data); return parsed.data; }
        lastErr = parsed.error.message;
      }
      throw new Error(`LLM output failed schema ${args.schemaName}: ${lastErr}`);
    },
  };
}
