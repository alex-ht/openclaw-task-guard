import { isChatItem, MAX_TODO_LINES, type PlanItem, type RunPlan } from "./types.js";

export function locationTag(item: PlanItem): string {
  return isChatItem(item) ? "CHAT" : `FILE=${item.location.trim()}`;
}

export function todoItems(plan: RunPlan): PlanItem[] {
  return plan.items.filter((item) => item.status === "todo");
}

export function firstTodo(plan: RunPlan): PlanItem | undefined {
  return todoItems(plan)[0];
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function renderTodoLines(items: PlanItem[], max = MAX_TODO_LINES): string[] {
  const shown = items.slice(0, max);
  const lines = shown.map((item, index) => {
    return `${index + 1}. id=${item.id} ${locationTag(item)} | content: ${oneLine(item.content)} | format: ${oneLine(item.format)}`;
  });
  const extra = items.length - shown.length;
  if (extra > 0) {
    lines.push(`... +${extra} more`);
  }
  return lines;
}

export function renderNowLine(item: PlanItem): string {
  return `NOW: finish ${item.id}, then call task_mark id=${item.id} status=done evidence=${isChatItem(item) ? "<short proof>" : item.location}`;
}

export function renderTaskRule(): string {
  return [
    "TASK RULE",
    "If the user asked for a concrete output (file, report, table, JSON, formatted reply):",
    "1. Call task_plan now, before other work.",
    "2. Each item needs content + format + location + kind=file.",
    "3. location is the output path. task_mark done checks that file exists.",
    "4. Last item = the final output file. Do not deliver in chat.",
    "If this is only a question, ignore this rule.",
  ].join("\n");
}

export function renderToolProgress(plan: RunPlan): string | null {
  const todos = todoItems(plan);
  const current = todos[0];
  if (!current) {
    return null;
  }
  const done = plan.items.filter((item) => item.status === "done").length;
  return [
    `TASK OPEN. ${done} done, ${todos.length} open. No text until every item is marked, unless the task cannot be done.`,
    renderNowLine(current),
  ].join("\n");
}

export function renderPlanOpen(plan: RunPlan): string {
  const todos = todoItems(plan);
  const current = todos[0];
  const lines = [
    "TASK OPEN. No text until every item is marked, unless the task cannot be done.",
    "TODO:",
    ...renderTodoLines(todos),
  ];
  if (current) {
    lines.push(renderNowLine(current));
  }
  return lines.join("\n");
}

export function renderStopEarly(plan: RunPlan): string {
  return ["STOP. You sent text before the plan was done.", renderPlanOpen(plan)].join("\n");
}

export function renderPlanReady(plan: RunPlan): string {
  const todos = todoItems(plan);
  const current = todos[0];
  const lines = ["PLAN READY", "TODO:", ...renderTodoLines(todos)];
  if (current) {
    lines.push(
      `NEXT: do ${current.id}, then call task_mark id=${current.id} status=done evidence=${isChatItem(current) ? "<short proof>" : current.location}`,
    );
  }
  return lines.join("\n");
}

export function renderPlanDone(): string {
  return ["PLAN DONE", "All items marked. You may speak."].join("\n");
}

export function renderError(message: string, next?: string): string {
  const lines = [`ERROR. ${oneLine(message)}`];
  if (next) {
    lines.push(next);
  }
  return lines.join("\n");
}

export function renderMarkSuccess(plan: RunPlan): string {
  if (plan.status === "done" || todoItems(plan).length === 0) {
    return renderPlanDone();
  }
  return renderPlanOpen(plan);
}
