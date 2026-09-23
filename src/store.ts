import { createHash } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { inferItemKind, sourceCount, type PlanItem, type PluginConfig, type RunPlan } from "./types.js";

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

function parsePlan(raw: string): RunPlan | null {
  try {
    const parsed = JSON.parse(raw) as RunPlan;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.items)) {
      return null;
    }
    return {
      ...parsed,
      items: parsed.items.map((item: PlanItem) => {
        const sources = sourceCount(item);
        return {
          ...item,
          kind: item.kind === "file" || item.kind === "chat" ? item.kind : inferItemKind(item.location),
          ...(sources > 0 ? { sources } : { sources: undefined }),
        };
      }),
    };
  } catch {
    return null;
  }
}

export async function loadPlan(
  config: PluginConfig,
  agentId: string,
  sessionKey: string,
): Promise<RunPlan | null> {
  try {
    return parsePlan(await readFile(planFilePath(config, agentId, sessionKey), "utf8"));
  } catch {
    return null;
  }
}

export function loadPlanSync(
  config: PluginConfig,
  agentId: string,
  sessionKey: string,
): RunPlan | null {
  try {
    return parsePlan(readFileSync(planFilePath(config, agentId, sessionKey), "utf8"));
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

export function savePlanSync(
  config: PluginConfig,
  agentId: string,
  sessionKey: string,
  plan: RunPlan,
): void {
  const file = planFilePath(config, agentId, sessionKey);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
}

export function isActivePlan(plan: RunPlan | null): plan is RunPlan {
  return Boolean(plan && plan.status === "active");
}
