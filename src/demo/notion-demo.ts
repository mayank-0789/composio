import "dotenv/config";
import { writeFileSync } from "node:fs";
import { Composio, AuthConfigTypes, AuthSchemeTypes, AuthScheme } from "@composio/core";

const USER = "research-agent";

function env(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env ${k}`);
  return v;
}

async function ensureNotionConnection(composio: Composio) {
  const existing: any = await composio.authConfigs.list({ toolkitSlug: "notion" } as any).catch(() => null);
  const items = existing?.items ?? existing ?? [];
  const acId: string = items.length
    ? items[0].id
    : (await composio.authConfigs.create("notion", { type: AuthConfigTypes.CUSTOM, authScheme: AuthSchemeTypes.API_KEY } as any) as any).id;
  const accts: any = await composio.connectedAccounts.list({ userIds: [USER] } as any).catch(() => null);
  const active = (accts?.items ?? accts ?? []).some((a: any) => (a.toolkit?.slug ?? a.toolkitSlug) === "notion" && a.status === "ACTIVE");
  if (!active) {
    const conn: any = await composio.connectedAccounts.initiate(USER, acId, { config: AuthScheme.APIKey({ api_key: env("NOTION_TOKEN") }) } as any);
    if (conn?.waitForConnection) await conn.waitForConnection(30000).catch(() => {});
  }
}

async function exec(composio: Composio, slug: string, args: object): Promise<any> {
  return composio.tools.execute(slug, { userId: USER, arguments: args as any, version: "latest", dangerouslySkipVersionCheck: true });
}

async function main() {
  const composio = new Composio({ apiKey: env("COMPOSIO_API_KEY") });
  const steps: Array<{ tool: string; input: unknown; output: unknown }> = [];
  await ensureNotionConnection(composio);

  const search = await exec(composio, "NOTION_SEARCH_NOTION_PAGE", { query: "" });
  const pages: any[] = search?.data?.results ?? search?.data?.response_data?.results ?? [];
  steps.push({ tool: "NOTION_SEARCH_NOTION_PAGE", input: { query: "" }, output: { found: pages.length } });
  if (!pages.length) {
    throw new Error("No Notion page shared with the integration. In Notion, open a page → ⋯ → Connections → add your integration, then re-run.");
  }
  const parentId: string = pages[0].id;
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";

  const marker = `Verified live at ${stamp}: a Claude agent wrote this line through Composio's Notion toolkit (NOTION_ADD_MULTIPLE_PAGE_CONTENT) — proof that an app the research agent verdicted "buildable-now" actually builds into a working agent action.`;
  const addParent = await exec(composio, "NOTION_ADD_MULTIPLE_PAGE_CONTENT", { parent_block_id: parentId, content_blocks: [{ content: marker, block_property: "paragraph" }] });
  steps.push({ tool: "NOTION_ADD_MULTIPLE_PAGE_CONTENT → published page", input: { parent_block_id: parentId }, output: { successful: addParent?.successful } });

  const title = `Agent-created sub-page — ${stamp}`;
  const created = await exec(composio, "NOTION_CREATE_NOTION_PAGE", { parent_id: parentId, title });
  const childId: string | undefined = created?.data?.id ?? created?.data?.response_data?.id;
  const childUrl: string | undefined = created?.data?.url ?? created?.data?.response_data?.url;
  steps.push({ tool: "NOTION_CREATE_NOTION_PAGE", input: { parent_id: parentId, title }, output: { childId, childUrl, successful: created?.successful } });

  if (childId) {
    try {
      const c = await exec(composio, "NOTION_ADD_MULTIPLE_PAGE_CONTENT", { parent_block_id: childId, content_blocks: [{ content: "Created by the Composio research agent as a buildability proof.", block_property: "paragraph" }] });
      steps.push({ tool: "NOTION_ADD_MULTIPLE_PAGE_CONTENT → new sub-page", input: { parent_block_id: childId }, output: { successful: c?.successful } });
    } catch (e) { steps.push({ tool: "NOTION_ADD_MULTIPLE_PAGE_CONTENT → new sub-page", input: {}, output: { error: (e as Error).message.slice(0, 160) } }); }
  }

  const publicUrl = process.env.NOTION_PUBLIC_URL ?? childUrl;
  writeFileSync("data/demo.json", JSON.stringify({ publicUrl, childUrl, childId, ranAt: stamp, steps }, null, 2));
  console.log("demo done → public:", publicUrl);
}

main().catch((e) => { console.error("DEMO FAILED:", (e as Error).message); process.exit(1); });
