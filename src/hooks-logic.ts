import { renderPlanOpen, renderStopEarly, renderTaskRule, todoItems } from "./render.js";
import type { PluginConfig, RunPlan } from "./types.js";

export type HookContext = {
  trigger?: unknown;
  inputProvenance?: { kind?: unknown };
  sessionKey?: unknown;
  agentId?: unknown;
  runId?: unknown;
};

export function isInternalTurn(ctx: HookContext): boolean {
  if (ctx.trigger === "heartbeat") {
    return true;
  }
  return ctx.inputProvenance?.kind === "internal_system";
}

export function sessionKeyOf(ctx: HookContext): string {
  return typeof ctx.sessionKey === "string" && ctx.sessionKey.trim()
    ? ctx.sessionKey
    : "global";
}

export function agentIdOf(ctx: HookContext): string {
  return typeof ctx.agentId === "string" && ctx.agentId.trim() ? ctx.agentId : "main";
}

export function promptInjection(
  plan: RunPlan | null,
  config: PluginConfig,
  ctx: HookContext,
): string | null {
  if (config.enforcement === "off" || isInternalTurn(ctx)) {
    return null;
  }
  if (!plan || plan.status !== "active") {
    return renderTaskRule();
  }
  if (todoItems(plan).length === 0) {
    return null;
  }
  return renderPlanOpen(plan);
}

export type FinalizeDecision =
  | { action: "revise"; reason: string; instruction: string; idempotencyKey: string; maxAttempts: number }
  | { action: "continue" };

export function finalizeDecision(
  plan: RunPlan | null,
  config: PluginConfig,
): FinalizeDecision {
  if (config.enforcement !== "gate") {
    return { action: "continue" };
  }
  if (!plan || plan.status !== "active" || todoItems(plan).length === 0) {
    return { action: "continue" };
  }
  return {
    action: "revise",
    reason: "required deliverables incomplete",
    instruction: renderStopEarly(plan),
    idempotencyKey: `task-guard:${plan.planId}:open`,
    maxAttempts: config.maxReviseAttempts,
  };
}
