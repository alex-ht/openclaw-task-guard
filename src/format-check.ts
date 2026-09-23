import { access, readFile, stat } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { checkCitedSources, sourceBlocks, type PageExtract } from "./extracts.js";
import { isChatItem, sourceCount, type ItemKind } from "./types.js";

export type FormatCheckResult =
  | { ok: true }
  | { ok: false; message: string; lines?: string[] };

export function looksLikePath(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("://")) {
    return false;
  }
  return (
    trimmed.startsWith("/") ||
    trimmed.startsWith("./") ||
    trimmed.startsWith("../") ||
    trimmed.includes("/") ||
    /\.[A-Za-z0-9]+$/.test(trimmed)
  );
}

function sameFile(a: string, b: string): boolean {
  return path.resolve(a.trim()) === path.resolve(b.trim());
}

export async function checkDeliverable(
  item: { kind?: ItemKind; location: string; sources?: number },
  evidence: string,
  extracts: PageExtract[] = [],
): Promise<FormatCheckResult> {
  if (isChatItem(item)) {
    if (!evidence.trim()) {
      return { ok: false, message: "Chat output needs a short proof in evidence." };
    }
    return { ok: true };
  }

  const filePath = item.location.trim();
  const proof = evidence.trim();
  if (looksLikePath(proof) && !sameFile(proof, filePath)) {
    return {
      ok: false,
      message: `evidence must be the planned file: ${filePath}`,
    };
  }

  try {
    await access(filePath, constants.R_OK);
  } catch {
    return {
      ok: false,
      message: `File missing or unreadable: ${filePath}. Write the file, then call task_mark again.`,
    };
  }

  const info = await stat(filePath);
  if (!info.isFile()) {
    return { ok: false, message: `Not a file: ${filePath}` };
  }
  if (info.size === 0) {
    return { ok: false, message: `File is empty: ${filePath}` };
  }

  const sources = sourceCount(item);
  const isJson = path.extname(filePath).toLowerCase() === ".json";
  if (!isJson && sources === 0) {
    return { ok: true };
  }

  const raw = await readFile(filePath, "utf8");
  if (isJson) {
    try {
      JSON.parse(raw);
    } catch {
      return { ok: false, message: `Invalid JSON: ${filePath}` };
    }
  }
  if (sources > 0) {
    const cited = checkCitedSources(raw, sources, extracts);
    if (cited.ok) {
      return cited;
    }
    if (sourceBlocks(raw).length === 0 && sourceBlocks(proof).length > 0) {
      return {
        ok: false,
        message: `Put the source lines in ${filePath}. evidence is only that path.`,
        lines: cited.lines,
      };
    }
    if (cited.lines && cited.lines.length > 0 && cited.message.includes("Found 0 blocks")) {
      return {
        ok: false,
        message: `Need ${sources} sourced quotes in ${filePath}. Found 0 blocks. Append these lines, then call task_mark with evidence=${filePath}. Do not speak.`,
        lines: cited.lines,
      };
    }
    return cited;
  }

  return { ok: true };
}
