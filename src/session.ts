import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import type { HookContext } from "./hooks-logic.js";
import { agentIdOf, sessionKeyOf } from "./hooks-logic.js";
import type { PluginConfig } from "./types.js";
import { loadPlan, savePlan } from "./store.js";

export function resolveSession(event: Record<string, unknown>, ctx: Record<string, unknown>): HookContext {
  return {
    trigger: ctx.trigger ?? event.trigger,
    inputProvenance: (ctx.inputProvenance ?? event.inputProvenance) as HookContext["inputProvenance"],
    sessionKey: ctx.sessionKey ?? event.sessionKey,
    agentId: ctx.agentId ?? event.agentId,
    runId: ctx.runId ?? event.runId,
  };
}

export async function loadSessionPlan(config: PluginConfig, ctx: HookContext) {
  return loadPlan(config, agentIdOf(ctx), sessionKeyOf(ctx));
}

export async function saveSessionPlan(
  config: PluginConfig,
  ctx: HookContext,
  plan: Parameters<typeof savePlan>[3],
) {
  await savePlan(config, agentIdOf(ctx), sessionKeyOf(ctx), plan);
}

export function enqueueIncomplete(
  api: OpenClawPluginApi,
  ctx: HookContext,
  content: string,
  planId: string,
): void {
  const payload = {
    sessionKey: sessionKeyOf(ctx),
    agentId: agentIdOf(ctx),
    content,
    reason: "task-guard incomplete",
    idempotencyKey: `task-guard:${planId}:open`,
  };
  const workflow = api.session?.workflow?.enqueueNextTurnInjection;
  if (typeof workflow === "function") {
    void workflow(payload);
    return;
  }
  if (typeof api.enqueueNextTurnInjection === "function") {
    void api.enqueueNextTurnInjection(payload);
  }
}
