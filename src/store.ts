import { createHash } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { inferItemKind, type PlanItem, type PluginConfig, type RunPlan } from "./types.js";

export function expandHome(input: string): string {
  if (input === "~") {
    return homedir();
  }
  if (input.startsWith("~/")) {
    return path.join(homedir(), input.slice(2));
  }
  return input;
}

export function sessionHash(sessionKey: string): string {
  return createHash("sha256").update(sessionKey).digest("hex").slice(0, 16);
}

export function planFilePath(
  config: PluginConfig,
  agentId: string,
  sessionKey: string,
): string {
  const root = expandHome(config.storagePath);
  const agent = agentId.replace(/[^A-Za-z0-9._-]+/g, "_") || "main";
  return path.join(root, agent, `${sessionHash(sessionKey)}.json`);
}

export async function loadPlan(
  config: PluginConfig,
  agentId: string,
  sessionKey: string,
): Promise<RunPlan | null> {
  const file = planFilePath(config, agentId, sessionKey);
  try {
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw) as RunPlan;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.items)) {
      return null;
    }
    return {
      ...parsed,
      items: parsed.items.map((item: PlanItem) => ({
        ...item,
        kind: item.kind === "file" || item.kind === "chat" ? item.kind : inferItemKind(item.location),
      })),
    };
  } catch {
    return null;
  }
}

export async function savePlan(
  config: PluginConfig,
  agentId: string,
  sessionKey: string,
  plan: RunPlan,
): Promise<void> {
  const file = planFilePath(config, agentId, sessionKey);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
}

export function isActivePlan(plan: RunPlan | null): plan is RunPlan {
  return Boolean(plan && plan.status === "active");
}
