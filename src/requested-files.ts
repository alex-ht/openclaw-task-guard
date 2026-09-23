const FILE_TOKEN = /(?:^|[^\w./-])((?:[\w.-]+\/)*[\w.-]+\.[A-Za-z]{2,8})(?![\w])/g;

const MAX_NAMED_FILES = 6;

type PromptIdentity = {
  agentId?: unknown;
  sessionKey?: unknown;
  runId?: unknown;
};

const byRun = new Map<string, Set<string>>();
const latestRunBySession = new Map<string, string>();

function textOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function agentOf(ctx: PromptIdentity): string {
  return textOf(ctx.agentId) || "main";
}

function sessionOf(ctx: PromptIdentity): string {
  return textOf(ctx.sessionKey) || "global";
}

function runOf(ctx: PromptIdentity): string {
  return textOf(ctx.runId);
}

function sessionMapKey(ctx: PromptIdentity): string {
  return `${agentOf(ctx)}\0${sessionOf(ctx)}`;
}

function runMapKey(ctx: PromptIdentity, runId: string): string {
  return `${sessionMapKey(ctx)}\0${runId}`;
}

export function locationBasename(location: string): string {
  const trimmed = location.trim().replace(/\\/g, "/");
  const base = trimmed.split("/").pop() ?? trimmed;
  return base.toLowerCase();
}

export function mentionedBasenames(prompt: string): Set<string> {
  const names = new Set<string>();
  for (const match of prompt.matchAll(FILE_TOKEN)) {
    const token = match[1] ?? "";
    const base = locationBasename(token);
    const dot = base.lastIndexOf(".");
    if (dot < 2) {
      continue;
    }
    const stem = base.slice(0, dot);
    const ext = base.slice(dot + 1);
    if (!/^[a-z]{2,8}$/.test(ext) || !/[a-z]/.test(stem)) {
      continue;
    }
    names.add(base);
  }
  return names;
}

export function formatNamedFiles(names: Set<string>): string {
  const sorted = [...names].sort();
  const shown = sorted.slice(0, MAX_NAMED_FILES);
  const extra = sorted.length - shown.length;
  const list = shown.join(", ");
  return extra > 0 ? `${list}, +${extra} more` : list;
}

export function rememberRequestedFiles(ctx: PromptIdentity, prompt: string): void {
  const sessionKey = sessionMapKey(ctx);
  const runId = runOf(ctx);
  const previous = latestRunBySession.get(sessionKey);
  if (previous !== undefined && previous !== runId) {
    byRun.delete(`${sessionKey}\0${previous}`);
  }
  byRun.set(runMapKey(ctx, runId), mentionedBasenames(prompt));
  latestRunBySession.set(sessionKey, runId);
}

export function forgetRequestedFiles(ctx: PromptIdentity): void {
  const sessionKey = sessionMapKey(ctx);
  const runId = latestRunBySession.get(sessionKey);
  latestRunBySession.delete(sessionKey);
  if (runId !== undefined) {
    byRun.delete(runMapKey(ctx, runId));
  }
  byRun.delete(runMapKey(ctx, ""));
}

export function requestedBasenamesFor(ctx: PromptIdentity): Set<string> | undefined {
  const runId = runOf(ctx);
  if (runId) {
    return byRun.get(runMapKey(ctx, runId));
  }
  const latest = latestRunBySession.get(sessionMapKey(ctx));
  if (latest === undefined) {
    return undefined;
  }
  return byRun.get(runMapKey(ctx, latest));
}
