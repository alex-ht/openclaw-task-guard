import { randomUUID } from "node:crypto";
import { renderError, renderPlanReady } from "./render.js";
import type { PlanItem, PlanItemInput, RunPlan } from "./types.js";

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

export function createPlan(items: PlanItemInput[]): { text: string; plan?: RunPlan } {
  if (!Array.isArray(items) || items.length === 0) {
    return {
      text: renderError(
        "Need at least one item with title, content, format, location.",
        "Call task_plan again with items.",
      ),
    };
  }

  const nextItems: PlanItem[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const title = clean(items[i]?.title);
    const content = clean(items[i]?.content);
    const format = clean(items[i]?.format);
    const location = clean(items[i]?.location);
    if (!title || !content || !format || !location) {
      return {
        text: renderError(
          `Item ${i + 1} needs title, content, format, and location (path or "chat").`,
          "Fix items and call task_plan again.",
        ),
      };
    }
    nextItems.push({
      id: `item-${i + 1}`,
      title,
      content,
      format,
      location,
      status: "todo",
    });
  }

  const last = nextItems[nextItems.length - 1];
  if (!last.content || !last.format) {
    return {
      text: renderError(
        "Last item must be the final output with content+format.",
        "Fix items and call task_plan again.",
      ),
    };
  }

  const plan: RunPlan = {
    planId: randomUUID(),
    items: nextItems,
    status: "active",
  };
  return { text: renderPlanReady(plan), plan };
}
