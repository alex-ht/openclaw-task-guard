import { isSearchTool, MIN_QUOTE_CHARS, pasteLines, type PageExtract } from "./extracts.js";
import { isChatItem, MAX_TODO_LINES, sourceCount, type PlanItem, type RunPlan } from "./types.js";

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
    const sources = sourceCount(item);
    const sourcesTag = sources > 0 ? ` | sources=${sources}` : "";
    return `${index + 1}. id=${item.id} ${locationTag(item)} | content: ${oneLine(item.content)} | format: ${oneLine(item.format)}${sourcesTag}`;
  });
  const extra = items.length - shown.length;
  if (extra > 0) {
    lines.push(`... +${extra} more`);
  }
  return lines;
}

function evidenceToken(item: PlanItem): string {
  return isChatItem(item) ? "<short proof>" : item.location.trim();
}

function pagesClause(item: PlanItem | undefined, opened: number): string {
  if (!item || isChatItem(item)) {
    return "";
  }
  const sources = sourceCount(item);
  if (sources <= 0) {
    return "";
  }
  const shown = Math.min(Math.max(opened, 0), sources);
  return ` Pages ${shown}/${sources}.`;
}

function nextPinnedUrl(extracts: PageExtract[], candidates: string[]): string | undefined {
  const opened = new Set(extracts.map((entry) => entry.url));
  return candidates.find((url) => !opened.has(url));
}

function sourceShape(
  label: "NOW" | "NEXT",
  item: PlanItem,
  search: boolean,
  opened: number,
  pasteReady: boolean,
  manyUrls: number,
  extracts: PageExtract[],
  candidates: string[],
): string {
  const verb = label === "NOW" ? "finish" : "do";
  const sources = sourceCount(item);
  const shown = Math.min(Math.max(opened, 0), sources);
  const file = item.location.trim();
  if (shown >= sources) {
    if (pasteReady) {
      return `${label}: ${verb} ${item.id}. Pages ${shown}/${sources}. Stop fetching. Append these lines to ${file}, then call task_mark id=${item.id} status=done evidence=${file}. Do not speak.`;
    }
    return `${label}: ${verb} ${item.id}. Pages ${shown}/${sources}. Stop fetching. In ${file} each source is the https URL alone on one line, then a line starting with > and a sentence copied from that page (at least ${MIN_QUOTE_CHARS} characters). Then call task_mark id=${item.id} status=done evidence=${file}.`;
  }
  if (manyUrls >= 2) {
    return `${label}: ${verb} ${item.id}. Pages ${shown}/${sources}. This call had ${manyUrls} https URLs, so it opened no page. Call again with exactly one https URL. Do not write the file yet.`;
  }
  const pinned = nextPinnedUrl(extracts, candidates);
  if (search) {
    if (pinned) {
      return `${label}: ${verb} ${item.id}. Pages ${shown}/${sources}. Search blocked until pages are open. Fetch exactly one URL now: ${pinned}. Do not search again. Do not write the file yet.`;
    }
    return `${label}: ${verb} ${item.id}. Pages ${shown}/${sources}. Search blocked until pages are open. Pick one concrete https URL from prior search results and call a fetch tool with exactly that one URL. Do not search again. Do not write the file yet.`;
  }
  if (pinned) {
    return `${label}: ${verb} ${item.id}. Pages ${shown}/${sources}. Call a fetch tool with exactly one https URL: ${pinned}. Do not write the file yet.`;
  }
  return `${label}: ${verb} ${item.id}. Pages ${shown}/${sources}. Call a fetch tool with one https URL you have not opened yet (exactly one URL in the arguments). Do not write the file yet.`;
}

function readyPaste(item: PlanItem, opened: number, extracts: PageExtract[]): string[] {
  const sources = sourceCount(item);
  if (sources <= 0 || isChatItem(item) || opened < sources) {
    return [];
  }
  return pasteLines(extracts, sources);
}

function renderFollowUp(
  label: "NOW" | "NEXT",
  item: PlanItem,
  search = false,
  opened = 0,
  extracts: PageExtract[] = [],
  manyUrls = 0,
  candidates: string[] = [],
): string {
  const sources = sourceCount(item);
  if (search && sources <= 0) {
    const verb = label === "NOW" ? "finish" : "do";
    const pinned = nextPinnedUrl(extracts, candidates);
    if (pinned) {
      return `${label}: ${verb} ${item.id}. This search is not an opened page. Sources set to 2. Fetch exactly one URL now: ${pinned}. Do not write the file yet. Do not speak.`;
    }
    return `${label}: ${verb} ${item.id}. This search is not an opened page. Sources set to 2. Call a fetch tool with exactly one https URL. Do not write the file yet. Do not speak.`;
  }
  if (sources > 0 && !isChatItem(item)) {
    return sourceShape(
      label,
      item,
      search,
      opened,
      readyPaste(item, opened, extracts).length > 0,
      manyUrls,
      extracts,
      candidates,
    );
  }
  const verb = label === "NOW" ? "finish" : "do";
  return `${label}: ${verb} ${item.id}, then call task_mark id=${item.id} status=done evidence=${evidenceToken(item)}`;
}

export function renderNowLine(item: PlanItem, opened = 0): string {
  return renderFollowUp("NOW", item, false, opened);
}

export function renderNowDetail(
  item: PlanItem,
  search = false,
  opened = 0,
  extracts: PageExtract[] = [],
  manyUrls = 0,
  candidates: string[] = [],
): string {
  return renderFollowUp("NOW", item, search, opened, extracts, manyUrls, candidates);
}

export function renderNextLine(item: PlanItem, opened = 0): string {
  return renderFollowUp("NEXT", item, false, opened);
}

export function renderTaskRule(): string {
  return [
    "TASK RULE",
    "If the user asked for a concrete output (file, report, table, JSON, formatted reply):",
    "1. Call task_plan now, before other work.",
    "2. Each item needs content + format + location + kind=file.",
    "3. location is the output path. task_mark done checks that file exists.",
    "4. Each location is a file the user named. The plan is this tool. Do not add a plan or notes file.",
    "5. For researched facts, set sources to 2. Open two https pages and quote one verbatim sentence from each.",
    "If this is only a question, ignore this rule.",
  ].join("\n");
}

function withPaste(lines: string[], item: PlanItem | undefined, opened: number, extracts: PageExtract[]): string[] {
  if (!item) {
    return lines;
  }
  const paste = readyPaste(item, opened, extracts);
  if (paste.length === 0 || lines.length + paste.length > 12) {
    return lines;
  }
  return [...lines, ...paste];
}

export function renderToolProgress(
  plan: RunPlan,
  opened = 0,
  toolName?: string,
  extracts: PageExtract[] = [],
  manyUrls = 0,
  candidates: string[] = [],
): string | null {
  const todos = todoItems(plan);
  const current = todos[0];
  if (!current) {
    return null;
  }
  const done = plan.items.filter((item) => item.status === "done").length;
  const head = `TASK OPEN. ${done} done, ${todos.length} open.${pagesClause(current, opened)} No text until every item is marked, unless the task cannot be done.`;
  const search = Boolean(toolName && isSearchTool(toolName));
  return withPaste(
    [head, renderFollowUp("NOW", current, search, opened, extracts, search ? 0 : manyUrls, candidates)],
    current,
    opened,
    extracts,
  ).join("\n");
}

export function renderPlanOpen(
  plan: RunPlan,
  opened = 0,
  extracts: PageExtract[] = [],
  candidates: string[] = [],
): string {
  const todos = todoItems(plan);
  const current = todos[0];
  const lines = [
    `TASK OPEN.${pagesClause(current, opened)} No text until every item is marked, unless the task cannot be done.`,
    "TODO:",
    ...renderTodoLines(todos),
  ];
  if (current) {
    lines.push(renderFollowUp("NOW", current, false, opened, extracts, 0, candidates));
  }
  return withPaste(lines, current, opened, extracts).join("\n");
}

export function renderStopEarly(
  plan: RunPlan,
  opened = 0,
  extracts: PageExtract[] = [],
  candidates: string[] = [],
): string {
  return ["STOP. You sent text before the plan was done.", renderPlanOpen(plan, opened, extracts, candidates)].join("\n");
}

export function renderPlanReady(plan: RunPlan): string {
  const todos = todoItems(plan);
  const current = todos[0];
  const lines = ["PLAN READY", "TODO:", ...renderTodoLines(todos)];
  if (current) {
    lines.push(renderNextLine(current));
  }
  return lines.join("\n");
}

export function renderPlanDone(): string {
  return ["PLAN DONE", "All items marked. You may speak."].join("\n");
}

export function renderError(message: string, next?: string, extra: string[] = []): string {
  const lines = [`ERROR. ${oneLine(message)}`, ...extra.filter((line) => line.trim())];
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
