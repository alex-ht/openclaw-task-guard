export type ItemStatus = "todo" | "done" | "cancel";

export type PlanStatus = "active" | "done" | "cancel";

export type ItemKind = "file" | "chat";

export type PlanItemInput = {
  title: string;
  content: string;
  format: string;
  location: string;
  kind: ItemKind;
  /** Pages this file must quote. Omit or 0 skips the citation check. */
  sources?: number;
};

export type PlanItem = PlanItemInput & {
  id: string;
  status: ItemStatus;
  evidence?: string;
};

export function sourceCount(item: { sources?: number }): number {
  const value = item.sources;
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 0;
}

export function inferItemKind(location: string): ItemKind {
  return location.trim().toLowerCase() === "chat" ? "chat" : "file";
}

export function itemKindOf(item: { kind?: ItemKind; location: string }): ItemKind {
  if (item.kind === "file" || item.kind === "chat") {
    return item.kind;
  }
  return inferItemKind(item.location);
}

export function isChatItem(item: { kind?: ItemKind; location: string }): boolean {
  return itemKindOf(item) === "chat";
}

export type RunPlan = {
  planId: string;
  items: PlanItem[];
  status: PlanStatus;
};

export type Enforcement = "off" | "remind" | "gate";

export type PluginConfig = {
  enforcement: Enforcement;
  maxReviseAttempts: number;
  storagePath: string;
};

export const DEFAULT_CONFIG: PluginConfig = {
  enforcement: "gate",
  maxReviseAttempts: 2,
  storagePath: "~/.openclaw/state/task-guard",
};

export const MAX_TODO_LINES = 8;
