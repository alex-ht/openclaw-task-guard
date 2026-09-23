import { randomUUID } from "node:crypto";
import { looksLikePath } from "./format-check.js";
import { formatNamedFiles, locationBasename } from "./requested-files.js";
import { renderError, renderPlanReady } from "./render.js";
import type { ItemKind, PlanItem, PlanItemInput, RunPlan } from "./types.js";

export const MAX_SOURCES = 2;

function parseSources(value: unknown): number | null {
  if (value === undefined || value === null) {
    return 0;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > MAX_SOURCES) {
    return null;
  }
  return value;
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function parseKind(value: unknown): ItemKind | "" {
  return value === "file" || value === "chat" ? value : "";
}

export type CreatePlanOptions = {
  requestedBasenames?: Set<string>;
};

export function createPlan(
  items: PlanItemInput[],
  options?: CreatePlanOptions,
): { text: string; plan?: RunPlan } {
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
          `Item ${i + 1} needs title, content, format, location, and kind=file.`,
          "Fix items and call task_plan again.",
        ),
      };
    }
    if (kind === "chat") {
      return {
        text: renderError(
          `Item ${i + 1}: kind must be file. location is the output path. Do not deliver in chat.`,
          "Fix items and call task_plan again.",
        ),
      };
    }
    if (location.toLowerCase() === "chat" || !looksLikePath(location)) {
      return {
        text: renderError(
          `Item ${i + 1}: kind=file requires location to be a file path (not "chat").`,
          "Fix items and call task_plan again.",
        ),
      };
    }
    const sources = parseSources(items[i]?.sources);
    if (sources === null) {
      return {
        text: renderError(
          `Item ${i + 1}: sources must be a whole number from 0 to ${MAX_SOURCES}. For a research task use 2.`,
          "Fix items and call task_plan again.",
        ),
      };
    }
    const requested = options?.requestedBasenames;
    if (requested && requested.size > 0 && !requested.has(locationBasename(location))) {
      return {
        text: renderError(
          `Item ${i + 1}: location must be a file the user named (${formatNamedFiles(requested)}). The plan is task_plan, not a file.`,
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
      kind,
      status: "todo",
      ...(sources > 0 ? { sources } : {}),
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
