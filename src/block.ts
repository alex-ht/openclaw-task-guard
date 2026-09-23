import { isSearchTool, urlsInParams, type PageExtract } from "./extracts.js";
import { firstTodo, renderNowDetail } from "./render.js";
import { isChatItem, sourceCount, type RunPlan } from "./types.js";

const WRITE_TOOLS = new Set(["write", "edit", "exec"]);
const OPEN_WHEN_FULL = new Set(["write", "edit", "exec", "read", "task_plan", "task_mark"]);

export type ToolBlockInput = {
  enforcement: "off" | "remind" | "gate";
  plan: RunPlan | null;
  opened: number;
  searched: boolean;
  extracts: PageExtract[];
  candidates?: string[];
  toolName: string;
  params: unknown;
};

function nowDetail(
  item: NonNullable<ReturnType<typeof firstTodo>>,
  search: boolean,
  opened: number,
  extracts: PageExtract[],
  manyUrls: number,
  candidates: string[],
): string {
  return renderNowDetail(item, search, opened, extracts, manyUrls, candidates);
}

export function toolBlockReason(input: ToolBlockInput): string | null {
  if (input.enforcement !== "gate" || !input.plan || input.plan.status !== "active") {
    return null;
  }
  const item = firstTodo(input.plan);
  if (!item || isChatItem(item)) {
    return null;
  }
  const name = input.toolName.trim().toLowerCase();
  if (name === "task_plan" || name === "task_mark") {
    return null;
  }
  const sources = sourceCount(item);
  const search = isSearchTool(name);
  const urls = search ? 0 : urlsInParams(input.params).length;
  const candidates = input.candidates ?? [];
  if (sources >= 1 && input.opened < sources) {
    if (WRITE_TOOLS.has(name)) {
      return nowDetail(item, false, input.opened, input.extracts, 0, candidates);
    }
    // After any search, or once at least one page is open, block further search and pin a fetch.
    if (search && (input.searched || input.opened > 0)) {
      return nowDetail(item, true, input.opened, input.extracts, 0, candidates);
    }
    if (urls >= 2) {
      return nowDetail(item, false, input.opened, input.extracts, urls, candidates);
    }
    return null;
  }
  if (sources >= 1 && input.opened >= sources) {
    if (search || (!OPEN_WHEN_FULL.has(name) && urls >= 1)) {
      return nowDetail(item, false, input.opened, input.extracts, 0, candidates);
    }
    return null;
  }
  if (sources <= 0 && input.searched) {
    if (WRITE_TOOLS.has(name) || search || urls >= 2) {
      return nowDetail(item, true, 0, [], urls >= 2 ? urls : 0, candidates);
    }
    return null;
  }
  return null;
}
