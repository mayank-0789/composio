import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { renderPage } from "./template.js";

const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const demo = (() => { try { return read("data/demo.json"); } catch { return undefined; } })();

const html = renderPage({
  records: read("data/verified.json"),
  clusters: read("data/clusters.json"),
  accuracy: read("data/accuracy.json"),
  demo,
});

mkdirSync("public", { recursive: true });
writeFileSync("public/index.html", html);
console.log("wrote public/index.html");
