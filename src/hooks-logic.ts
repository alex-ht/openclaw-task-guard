import type { PageExtract } from "./extracts.js";
import { renderPlanOpen, renderStopEarly, renderTaskRule, renderToolProgress, todoItems } from "./render.js";
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
  opened = 0,
  extracts: PageExtract[] = [],
  candidates: string[] = [],
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
  return renderPlanOpen(plan, opened, extracts, candidates);
}

export function promptSystemContext(
  plan: RunPlan | null,
  config: PluginConfig,
  ctx: HookContext,
  opened = 0,
  extracts: PageExtract[] = [],
  candidates: string[] = [],
): string | null {
  if (config.enforcement === "off" || isInternalTurn(ctx)) {
    return null;
  }
  if (!plan || plan.status !== "active" || todoItems(plan).length === 0) {
    return null;
  }
  return renderPlanOpen(plan, opened, extracts, candidates);
}

const PROGRESS_HEAD = /^TASK OPEN\. \d+ done, \d+ open\.(?: Pages \d+\/\d+\.)? No text until every item is marked, unless the task cannot be done\.$/;

function withoutProgressPrefix(text: string): string {
  const lines = text.split("\n");
  if (!PROGRESS_HEAD.test(lines[0] ?? "")) {
    return text;
  }
  lines.shift();
  if ((lines[0] ?? "").startsWith("NOW: ")) {
    lines.shift();
    while (lines.length > 0 && /^(https:\/\/|>)/.test((lines[0] ?? "").trim())) {
      lines.shift();
    }
  }
  if ((lines[0] ?? "").startsWith("task_mark id=")) {
    lines.shift();
  }
  return lines.join("\n").replace(/^\n/, "");
}

type TextBlock = { type?: unknown; text?: unknown };

function isProgressBlock(block: TextBlock): boolean {
  return block.type === "text" && typeof block.text === "string" && PROGRESS_HEAD.test(block.text.split("\n")[0] ?? "");
}

export function applyToolProgress(
  message: unknown,
  plan: RunPlan | null,
  config: PluginConfig,
  toolName: string | undefined,
  opened = 0,
  extracts: PageExtract[] = [],
  manyUrls = 0,
  candidates: string[] = [],
): Record<string, unknown> | undefined {
  if (config.enforcement === "off" || toolName === "task_plan" || toolName === "task_mark") {
    return undefined;
  }
  if (!plan || plan.status !== "active") {
    return undefined;
  }
  const progress = renderToolProgress(plan, opened, toolName, extracts, manyUrls, candidates);
  if (!progress || !message || typeof message !== "object") {
    return undefined;
  }
  const msg = message as { role?: unknown; content?: unknown };
  if (msg.role !== "toolResult") {
    return undefined;
  }
  if (typeof msg.content === "string") {
    const next = `${progress}\n${withoutProgressPrefix(msg.content)}`.replace(/\n$/, "");
    if (next === msg.content) {
      return undefined;
    }
    msg.content = next;
    return msg as Record<string, unknown>;
  }
  if (!Array.isArray(msg.content)) {
    msg.content = [{ type: "text", text: progress }];
    return msg as Record<string, unknown>;
  }
  const blocks = msg.content as TextBlock[];
  const first = blocks[0];
  if (first && isProgressBlock(first)) {
    if (first.text === progress) {
      return undefined;
    }
    first.text = progress;
    return msg as Record<string, unknown>;
  }
  blocks.unshift({ type: "text", text: progress });
  return msg as Record<string, unknown>;
}

export type FinalizeDecision =
  | { action: "revise"; reason: string; instruction: string; idempotencyKey: string; maxAttempts: number }
  | { action: "continue" };

export function finalizeDecision(
  plan: RunPlan | null,
  config: PluginConfig,
  opened = 0,
  extracts: PageExtract[] = [],
  candidates: string[] = [],
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
    instruction: renderStopEarly(plan, opened, extracts, candidates),
    idempotencyKey: `task-guard:${plan.planId}:open`,
    maxAttempts: config.maxReviseAttempts,
  };
}
