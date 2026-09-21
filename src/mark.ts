import { checkDeliverable } from "./format-check.js";
import { firstTodo, renderError, renderMarkSuccess, renderNowLine } from "./render.js";
import type { ItemStatus, RunPlan } from "./types.js";

export type MarkInput = {
  id: string;
  status: ItemStatus;
  evidence?: string;
};

function allSettled(plan: RunPlan): boolean {
  return plan.items.every((item) => item.status === "done" || item.status === "cancel");
}

export async function markItem(
  plan: RunPlan,
  input: MarkInput,
): Promise<{ text: string; plan: RunPlan }> {
  const id = typeof input.id === "string" ? input.id.trim() : "";
  const item = plan.items.find((entry) => entry.id === id);
  if (!item) {
    const current = firstTodo(plan);
    return {
      text: renderError(
        `Unknown id=${id || "(empty)"}. Use an id from TODO.`,
        current ? renderNowLine(current) : undefined,
      ),
      plan,
    };
  }

  if (input.status !== "done" && input.status !== "cancel") {
    return {
      text: renderError("status must be done or cancel.", renderNowLine(item)),
      plan,
    };
  }

  if (input.status === "cancel") {
    item.status = "cancel";
    item.evidence = input.evidence?.trim() || undefined;
  } else {
    const evidence = input.evidence?.trim() ?? "";
    if (!evidence) {
      return {
        text: renderError(
          "status=done requires evidence (file path or short proof).",
          renderNowLine(item),
        ),
        plan,
      };
    }
    const check = await checkDeliverable(item, evidence);
    if (!check.ok) {
      return {
        text: renderError(check.message, renderNowLine(item)),
        plan,
      };
    }
    item.status = "done";
    item.evidence = evidence;
  }

  plan.status = allSettled(plan) ? "done" : "active";
  return { text: renderMarkSuccess(plan), plan };
}
