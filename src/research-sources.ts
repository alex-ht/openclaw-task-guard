import { isChatItem, sourceCount, type PluginConfig, type RunPlan } from "./types.js";
import { savePlan, savePlanSync } from "./store.js";

/** Default citation budget for research after a search tool ran. */
export const DEFAULT_RESEARCH_SOURCES = 2;

export function upgradeResearchSources(plan: RunPlan): { plan: RunPlan; upgraded: boolean } {
  let upgraded = false;
  const items = plan.items.map((item) => {
    if (item.status !== "todo" || isChatItem(item) || sourceCount(item) > 0) {
      return item;
    }
    upgraded = true;
    return { ...item, sources: DEFAULT_RESEARCH_SOURCES };
  });
  if (!upgraded) {
    return { plan, upgraded: false };
  }
  return { plan: { ...plan, items }, upgraded: true };
}

export async function ensureResearchSources(
  config: PluginConfig,
  agentId: string,
  sessionKey: string,
  plan: RunPlan | null,
  searched: boolean,
): Promise<RunPlan | null> {
  if (!plan || plan.status !== "active" || !searched) {
    return plan;
  }
  const result = upgradeResearchSources(plan);
  if (result.upgraded) {
    await savePlan(config, agentId, sessionKey, result.plan);
  }
  return result.plan;
}

export function ensureResearchSourcesSync(
  config: PluginConfig,
  agentId: string,
  sessionKey: string,
  plan: RunPlan | null,
  searched: boolean,
): RunPlan | null {
  if (!plan || plan.status !== "active" || !searched) {
    return plan;
  }
  const result = upgradeResearchSources(plan);
  if (result.upgraded) {
    savePlanSync(config, agentId, sessionKey, result.plan);
  }
  return result.plan;
}
