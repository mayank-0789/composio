import { readFileSync } from "node:fs";
import { AppInput } from "./schema.js";

export function loadApps(path = "data/apps.json"): AppInput[] {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return AppInput.array().parse(raw);
}
