import { randomUUID } from "node:crypto";
import { looksLikePath } from "./format-check.js";
import { renderError, renderPlanReady } from "./render.js";
import type { ItemKind, PlanItem, PlanItemInput, RunPlan } from "./types.js";

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function parseKind(value: unknown): ItemKind | "" {
  return value === "file" || value === "chat" ? value : "";
}

export function createPlan(items: PlanItemInput[]): { text: string; plan?: RunPlan } {
  if (!Array.isArray(items) || items.length === 0) {
    return {
      text: renderError(
        "Need at least one item with title, content, format, location, kind.",
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
    const kind = parseKind(items[i]?.kind);
    if (!title || !content || !format || !location || !kind) {
      return {
        text: renderError(
          `Item ${i + 1} needs title, content, format, location, and kind (file or chat).`,
          "Fix items and call task_plan again.",
        ),
      };
    }
    if (kind === "chat" && location.toLowerCase() !== "chat") {
      return {
        text: renderError(
          `Item ${i + 1}: kind=chat requires location="chat".`,
          "Fix items and call task_plan again.",
        ),
      };
    }
    if (kind === "file" && (location.toLowerCase() === "chat" || !looksLikePath(location))) {
      return {
        text: renderError(
          `Item ${i + 1}: kind=file requires location to be a file path (not "chat").`,
          "Fix items and call task_plan again.",
        ),
      };
    }
    nextItems.push({
      id: `item-${i + 1}`,
      title,
      content,
      format,
      location: kind === "chat" ? "chat" : location,
      kind,
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
