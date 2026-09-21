import { access, readFile, stat } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { isChatItem, type ItemKind } from "./types.js";

export type FormatCheckResult =
  | { ok: true }
  | { ok: false; message: string };

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
  item: { kind?: ItemKind; location: string },
  evidence: string,
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

  if (path.extname(filePath).toLowerCase() === ".json") {
    const raw = await readFile(filePath, "utf8");
    try {
      JSON.parse(raw);
    } catch {
      return { ok: false, message: `Invalid JSON: ${filePath}` };
    }
  }

  return { ok: true };
}
