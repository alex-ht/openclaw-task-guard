export type ItemStatus = "todo" | "done" | "cancel";

export type PlanStatus = "active" | "done" | "cancel";

export type PlanItemInput = {
  title: string;
  content: string;
  format: string;
  location: string;
};

export type PlanItem = PlanItemInput & {
  id: string;
  status: ItemStatus;
  evidence?: string;
};

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
