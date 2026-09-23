import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readFile, rm, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { planFilePath } from "./store.js";
import type { PluginConfig } from "./types.js";

export const MIN_EXTRACT_CHARS = 1500;
export const MAX_EXTRACT_CHARS = 48_000;
export const MAX_EXTRACTS = 8;
export const MIN_QUOTE_CHARS = 60;

export type PageExtract = {
  url: string;
  chars: number;
  text: string;
};

export type ExtractLog = {
  extracts: PageExtract[];
  searched: boolean;
  /** https URLs seen in search results, not yet opened as page extracts. */
  candidates: string[];
};

export type SourceCheck =
  | { ok: true }
  | { ok: false; message: string; lines?: string[] };

const HTTPS_URL = /https:\/\/[^\s<>"'`)\]}]+/gi;
export const MAX_CANDIDATES = 12;

export function emptyExtractLog(): ExtractLog {
  return { extracts: [], searched: false, candidates: [] };
}

export function extractsFilePath(
  config: PluginConfig,
  agentId: string,
  sessionKey: string,
): string {
  return planFilePath(config, agentId, sessionKey).replace(/\.json$/, ".extracts.json");
}

export function comparableSourceText(raw: string): string {
  const unescaped = raw.replace(/\\[nrt]/g, " ");
  const links = unescaped.replace(/\[([^\]]+)\]\((?:https?:\/\/|\/)[^)]*\)/g, "$1");
  const emphasis = links.replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, "$1");
  const quotes = emphasis.replace(/["“”]/g, "");
  return normalizeExtractText(quotes);
}

function isProse(sentence: string): boolean {
  if (/^[#|>*]/.test(sentence)) {
    return false;
  }
  if ((sentence.match(/\|/g) ?? []).length >= 2) {
    return false;
  }
  if ((sentence.match(/#/g) ?? []).length >= 2) {
    return false;
  }
  return true;
}

function isNameList(sentence: string): boolean {
  const commas = (sentence.match(/,/g) ?? []).length;
  return commas >= 3 && !/\d/.test(sentence);
}

export function copyableSentence(text: string): string | undefined {
  const parts = comparableSourceText(text).split(/(?<=[.!?])\s+/);
  const candidates: string[] = [];
  for (const part of parts) {
    const sentence = part.trim();
    if (sentence.length < MIN_QUOTE_CHARS || sentence.length > 240 || isNameList(sentence) || !isProse(sentence)) {
      continue;
    }
    const words = sentence.split(" ").filter((word) => /[A-Za-z]{3,}/.test(word));
    if (new Set(words.map((word) => word.toLowerCase())).size < 6) {
      continue;
    }
    candidates.push(sentence);
  }
  candidates.sort((left, right) => {
    const leftDigit = /\d/.test(left) ? 0 : 1;
    const rightDigit = /\d/.test(right) ? 0 : 1;
    if (leftDigit !== rightDigit) {
      return leftDigit - rightDigit;
    }
    return Math.abs(left.length - 140) - Math.abs(right.length - 140);
  });
  return candidates[0];
}

export function pasteLines(extracts: PageExtract[], required: number): string[] {
  if (required <= 0) {
    return [];
  }
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const extract of extracts) {
    if (seen.has(extract.url)) {
      continue;
    }
    const sentence = copyableSentence(extract.text);
    if (!sentence) {
      continue;
    }
    seen.add(extract.url);
    lines.push(extract.url, `> ${sentence}`);
    if (seen.size >= required) {
      return lines;
    }
  }
  return [];
}

export function pageUrlInFetchResult(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(trimmed) as { url?: unknown; status?: unknown; error?: unknown };
    if (!parsed || typeof parsed !== "object") {
      return undefined;
    }
    if (typeof parsed.url !== "string" || !parsed.url.startsWith("https://")) {
      return undefined;
    }
    if (parsed.error || parsed.status === "error") {
      return undefined;
    }
    if (typeof parsed.status === "number" && parsed.status >= 400) {
      return undefined;
    }
    return parsed.url;
  } catch {
    return undefined;
  }
}

export function urlsInParams(params: unknown): string[] {
  if (!params || typeof params !== "object") {
    return [];
  }
  const strings: string[] = [];
  collectStrings(params, strings);
  return uniqueUrls(strings.flatMap((entry) => urlsInText(entry)));
}

export function countOpenedForResult(
  log: ExtractLog,
  toolName: string | undefined,
  message: unknown,
  params?: unknown,
): ExtractLog {
  const named = toolName ?? "";
  let next = named ? noteSearch(named, log, message) : log;
  if (!named || isSearchTool(named)) {
    return next;
  }
  if (params && typeof params === "object") {
    const noted = notePageExtract(named, params, message, next);
    if (noted !== next || urlsInParams(params).length !== 1) {
      return noted;
    }
  }
  const text = textFromToolResult(message);
  const url = pageUrlInFetchResult(text);
  if (!url || text.length < MIN_EXTRACT_CHARS) {
    return next;
  }
  return notePageExtract(named, { url }, text, next);
}

export function openCall(
  log: ExtractLog,
  toolName: string | undefined,
  message: unknown,
  params: unknown,
): { log: ExtractLog; manyUrls: number } {
  const next = countOpenedForResult(log, toolName, message, params);
  const named = toolName ?? "";
  const urls = !named || isSearchTool(named) ? 0 : urlsInParams(params).length;
  const manyUrls = urls >= 2 && textFromToolResult(message).length >= MIN_EXTRACT_CHARS ? urls : 0;
  return { log: next, manyUrls };
}

export function normalizeExtractText(raw: string): string {
  const stripped = raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
  return stripped.replace(/\s+/g, " ").trim();
}

export function urlsInText(value: string): string[] {
  const found: string[] = [];
  for (const match of value.matchAll(HTTPS_URL)) {
    const cleaned = match[0].replace(/[.,;:!?]+$/g, "");
    if (cleaned.length > "https://".length) {
      found.push(cleaned);
    }
  }
  return found;
}

function uniqueUrls(urls: string[]): string[] {
  return [...new Set(urls)];
}

function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === "string") {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectStrings(entry, out);
    }
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  for (const entry of Object.values(value as Record<string, unknown>)) {
    collectStrings(entry, out);
  }
}

export function textFromToolResult(result: unknown): string {
  const parts: string[] = [];
  pullText(result, parts, 0);
  return parts.join("\n");
}

function pullText(value: unknown, parts: string[], depth: number): void {
  if (depth > 8) {
    return;
  }
  if (typeof value === "string") {
    parts.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      pullText(entry, parts, depth + 1);
    }
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.content)) {
    pullText(record.content, parts, depth + 1);
    return;
  }
  if (typeof record.text === "string") {
    parts.push(record.text);
    return;
  }
  if (typeof record.content === "string") {
    parts.push(record.content);
    return;
  }
  for (const key of ["output", "result", "markdown", "body"]) {
    if (key in record) {
      pullText(record[key], parts, depth + 1);
    }
  }
}

export function isSearchTool(toolName: string): boolean {
  return /(?:^|[^a-z])search(?:[^a-z]|$)/i.test(toolName);
}

function openedUrlSet(extracts: PageExtract[]): Set<string> {
  return new Set(extracts.map((entry) => entry.url));
}

export function harvestCandidateUrls(result: unknown): string[] {
  const strings: string[] = [];
  collectStrings(result, strings);
  const fromText = textFromToolResult(result);
  if (fromText) {
    strings.push(fromText);
  }
  return uniqueUrls(strings.flatMap((entry) => urlsInText(entry))).slice(0, MAX_CANDIDATES);
}

export function remainingCandidates(log: ExtractLog): string[] {
  const opened = openedUrlSet(log.extracts);
  return (log.candidates ?? []).filter((url) => !opened.has(url));
}

export function noteSearch(toolName: string, log: ExtractLog, result?: unknown): ExtractLog {
  if (!isSearchTool(toolName)) {
    return log;
  }
  const harvested = result === undefined ? [] : harvestCandidateUrls(result);
  const opened = openedUrlSet(log.extracts);
  const merged = uniqueUrls([...(log.candidates ?? []), ...harvested]).filter((url) => !opened.has(url));
  const candidates = merged.slice(0, MAX_CANDIDATES);
  if (log.searched && candidates.length === (log.candidates ?? []).length && candidates.every((url, i) => url === (log.candidates ?? [])[i])) {
    return log;
  }
  return { extracts: log.extracts, searched: true, candidates };
}

function withExtracts(log: ExtractLog, extracts: PageExtract[]): ExtractLog {
  const opened = openedUrlSet(extracts);
  const candidates = (log.candidates ?? []).filter((url) => !opened.has(url));
  return { extracts, searched: log.searched === true, candidates };
}

export function notePageExtract(
  toolName: string,
  params: unknown,
  result: unknown,
  log: ExtractLog,
): ExtractLog {
  if (isSearchTool(toolName)) {
    return log;
  }
  if (!params || typeof params !== "object") {
    return log;
  }
  const strings: string[] = [];
  collectStrings(params, strings);
  const urls = uniqueUrls(strings.flatMap((entry) => urlsInText(entry)));
  if (urls.length !== 1) {
    return log;
  }
  const text = normalizeExtractText(textFromToolResult(result));
  if (text.length < MIN_EXTRACT_CHARS) {
    return log;
  }
  const url = urls[0];
  const next: PageExtract = {
    url,
    chars: text.length,
    text: text.slice(0, MAX_EXTRACT_CHARS),
  };
  const existing = log.extracts.findIndex((entry) => entry.url === url);
  if (existing >= 0) {
    const extracts = log.extracts.slice();
    extracts[existing] = next;
    return withExtracts(log, extracts);
  }
  if (log.extracts.length >= MAX_EXTRACTS) {
    return log;
  }
  return withExtracts(log, [...log.extracts, next]);
}

type SourceBlock = {
  url: string;
  quote: string;
  tooShort: boolean;
};

export function sourceBlocks(fileText: string): SourceBlock[] {
  const lines = fileText.split(/\r?\n/);
  const blocks: SourceBlock[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const urls = uniqueUrls(urlsInText(lines[i] ?? ""));
    if (urls.length !== 1) {
      continue;
    }
    let cursor = i + 1;
    while (cursor < lines.length && (lines[cursor] ?? "").trim() === "") {
      cursor += 1;
    }
    if (cursor >= lines.length || !(lines[cursor] ?? "").trim().startsWith(">")) {
      continue;
    }
    const quoteLines: string[] = [];
    while (cursor < lines.length && (lines[cursor] ?? "").trim().startsWith(">")) {
      quoteLines.push((lines[cursor] ?? "").trim().replace(/^>\s?/, ""));
      cursor += 1;
    }
    const quote = normalizeExtractText(quoteLines.join(" "));
    if (!quote) {
      continue;
    }
    blocks.push({
      url: urls[0],
      quote,
      tooShort: quote.length < MIN_QUOTE_CHARS,
    });
  }
  return blocks;
}

export function checkCitedSources(
  fileText: string,
  required: number,
  extracts: PageExtract[],
): SourceCheck {
  const blocks = sourceBlocks(fileText);
  const long = new Map<string, string>();
  const short: string[] = [];
  for (const block of blocks) {
    if (block.tooShort) {
      if (!short.includes(block.url)) {
        short.push(block.url);
      }
      continue;
    }
    if (!long.has(block.url)) {
      long.set(block.url, block.quote);
    }
  }

  const passing: string[] = [];
  let missingExtract: string | undefined;
  let missingQuote: string | undefined;
  for (const [url, quote] of long) {
    const extract = extracts.find((entry) => entry.url === url);
    if (!extract) {
      missingExtract ??= url;
      continue;
    }
    if (!comparableSourceText(extract.text).includes(comparableSourceText(quote))) {
      missingQuote ??= url;
      continue;
    }
    passing.push(url);
  }

  if (passing.length >= required) {
    return { ok: true };
  }
  if (missingExtract) {
    return {
      ok: false,
      message: `${missingExtract} has no full-page extract. Call a fetch tool with only that URL. A search snippet does not count. Then add the two-line block and call task_mark again.`,
    };
  }
  if (missingQuote) {
    const extract = extracts.find((entry) => entry.url === missingQuote);
    const sentence = extract ? copyableSentence(extract.text) : undefined;
    if (sentence) {
      return {
        ok: false,
        message: `Quote for ${missingQuote} is not in the page text the tool returned. Replace that quote with the next line, then call task_mark again.`,
        lines: [`> ${sentence}`],
      };
    }
    return {
      ok: false,
      message: `Quote for ${missingQuote} is not in the page text the tool returned. Copy a sentence from the fetch result, at least ${MIN_QUOTE_CHARS} characters.`,
    };
  }
  if (short.length > 0 && long.size === 0) {
    return {
      ok: false,
      message: `Quote for ${short[0]} must be at least ${MIN_QUOTE_CHARS} characters.`,
    };
  }
  const suggested = pasteLines(
    extracts.filter((entry) => !passing.includes(entry.url)),
    required - passing.length,
  );
  if (blocks.length === 0) {
    return {
      ok: false,
      message: `Need ${required} sourced quotes. Found 0 blocks. Each source is two lines: the https URL alone, then a line starting with > and a sentence from that fetched page.`,
      lines: suggested.length > 0 ? suggested : undefined,
    };
  }
  return {
    ok: false,
    message: `Need ${required} sourced quotes. Found ${passing.length}. Each source is two lines: the https URL alone, then a line starting with > and a sentence from that fetched page.`,
    lines: suggested.length > 0 ? suggested : undefined,
  };
}

function parseExtractLog(raw: string): ExtractLog {
  try {
    const parsed = JSON.parse(raw) as { extracts?: unknown; searched?: unknown; candidates?: unknown };
    if (!parsed || !Array.isArray(parsed.extracts)) {
      return emptyExtractLog();
    }
    const extracts: PageExtract[] = [];
    for (const entry of parsed.extracts) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const record = entry as { url?: unknown; chars?: unknown; text?: unknown };
      if (typeof record.url !== "string" || typeof record.text !== "string") {
        continue;
      }
      extracts.push({
        url: record.url,
        chars: typeof record.chars === "number" ? record.chars : record.text.length,
        text: record.text,
      });
      if (extracts.length >= MAX_EXTRACTS) {
        break;
      }
    }
    const opened = openedUrlSet(extracts);
    const candidates: string[] = [];
    if (Array.isArray(parsed.candidates)) {
      for (const entry of parsed.candidates) {
        if (typeof entry !== "string" || !entry.startsWith("https://") || opened.has(entry)) {
          continue;
        }
        candidates.push(entry);
        if (candidates.length >= MAX_CANDIDATES) {
          break;
        }
      }
    }
    return { extracts, searched: parsed.searched === true, candidates };
  } catch {
    return emptyExtractLog();
  }
}

export async function loadExtracts(
  config: PluginConfig,
  agentId: string,
  sessionKey: string,
): Promise<ExtractLog> {
  try {
    return parseExtractLog(await readFile(extractsFilePath(config, agentId, sessionKey), "utf8"));
  } catch {
    return emptyExtractLog();
  }
}

export function loadExtractsSync(
  config: PluginConfig,
  agentId: string,
  sessionKey: string,
): ExtractLog {
  try {
    return parseExtractLog(readFileSync(extractsFilePath(config, agentId, sessionKey), "utf8"));
  } catch {
    return emptyExtractLog();
  }
}

export function saveExtractsSync(
  config: PluginConfig,
  agentId: string,
  sessionKey: string,
  log: ExtractLog,
): void {
  const file = extractsFilePath(config, agentId, sessionKey);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(log, null, 2)}\n`, "utf8");
}

export async function saveExtracts(
  config: PluginConfig,
  agentId: string,
  sessionKey: string,
  log: ExtractLog,
): Promise<void> {
  const file = extractsFilePath(config, agentId, sessionKey);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(log, null, 2)}\n`, "utf8");
}

export async function clearExtracts(
  config: PluginConfig,
  agentId: string,
  sessionKey: string,
): Promise<void> {
  await rm(extractsFilePath(config, agentId, sessionKey), { force: true });
}
