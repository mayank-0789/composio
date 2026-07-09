import Anthropic from "@anthropic-ai/sdk";
import { AnthropicBedrock } from "@anthropic-ai/bedrock-sdk";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { Cache } from "./cache.js";

export interface AnthropicLike {
  messages: { create(body: object): Promise<{ content?: Array<{ type: string; input?: unknown }> }> };
}
export type ExtractArgs<T> = {
  model: string; system: string; user: string;
  schema: z.ZodType<T>; schemaName: string; toolName?: string;
};
export interface Llm { extract<T>(args: ExtractArgs<T>): Promise<T>; }

const BEDROCK_MODELS: Record<string, string | undefined> = {
  "claude-sonnet-5": process.env.BEDROCK_MODEL_SONNET,
  "claude-opus-4-8": process.env.BEDROCK_MODEL_OPUS ?? process.env.BEDROCK_MODEL_SONNET,
};

function buildClient(deps: { apiKey?: string; client?: AnthropicLike }): { client: AnthropicLike; mapModel: (m: string) => string } {
  if (deps.client) return { client: deps.client, mapModel: (m) => m };
  if (process.env.LLM_PROVIDER === "bedrock") {
    const client = new AnthropicBedrock({ awsRegion: process.env.AWS_REGION }) as unknown as AnthropicLike;
    return { client, mapModel: (m) => BEDROCK_MODELS[m] ?? m };
  }
  const client = new Anthropic({ apiKey: deps.apiKey }) as unknown as AnthropicLike;
  return { client, mapModel: (m) => m };
}

export function createLlm(deps: { apiKey?: string; client?: AnthropicLike }, cache: Cache): Llm {
  const { client, mapModel } = buildClient(deps);
  return {
    async extract(args) {
      const key = cache.keyFor({ m: args.model, s: args.system, u: args.user, n: args.schemaName });
      const hit = await cache.get<unknown>("llm", key);
      if (hit !== null) return args.schema.parse(hit);
      const tool = args.toolName ?? "emit";
      const inputSchema = zodToJsonSchema(args.schema, { $refStrategy: "none" }) as Record<string, unknown>;
      delete inputSchema["$schema"];
      let lastErr = "";
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await client.messages.create({
          model: mapModel(args.model), max_tokens: 4096,
          system: args.system,
          tools: [{ name: tool, description: "Emit the structured result.", input_schema: inputSchema }],
          tool_choice: { type: "tool", name: tool },
          messages: [{ role: "user", content: attempt === 0 ? args.user : `${args.user}\n\nPrevious output was invalid: ${lastErr}. Return valid data matching the tool schema exactly.` }],
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
