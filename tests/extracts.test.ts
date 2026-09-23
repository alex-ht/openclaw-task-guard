import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  MIN_EXTRACT_CHARS,
  clearExtracts,
  copyableSentence,
  countOpenedForResult,
  emptyExtractLog,
  loadExtracts,
  notePageExtract,
  noteSearch,
  openCall,
  saveExtracts,
} from "../src/extracts.js";
import { DEFAULT_CONFIG } from "../src/types.js";

const pageUrl = "https://docs.example.com/guide";

function longPage(seed: string): string {
  return `${seed} ${"paragraph ".repeat(200)}`;
}

describe("notePageExtract", () => {
  it("stores one https URL from params when the result is long", () => {
    const log = notePageExtract(
      "web_fetch",
      { url: pageUrl },
      longPage("The guide says agents must open the page."),
      emptyExtractLog(),
    );
    expect(log.extracts).toHaveLength(1);
    expect(log.extracts[0]?.url).toBe(pageUrl);
    expect(log.extracts[0]?.chars).toBeGreaterThanOrEqual(MIN_EXTRACT_CHARS);
    expect(log.extracts[0]?.text).toContain("agents must open the page");
  });

  it("ignores a query that names many URLs", () => {
    const current = emptyExtractLog();
    const log = notePageExtract(
      "web_fetch",
      { query: "https://a.example/1 and https://b.example/2" },
      longPage("snippets"),
      current,
    );
    expect(log).toBe(current);
  });

  it("ignores a search tool even when params hold one URL", () => {
    const current = emptyExtractLog();
    const log = notePageExtract(
      "web_search",
      { url: pageUrl },
      longPage("snippet about the guide"),
      current,
    );
    expect(log).toBe(current);
  });

  it("records a search without storing an extract", () => {
    const current = emptyExtractLog();
    const seen = noteSearch("web_search", current);
    expect(seen.searched).toBe(true);
    expect(seen.extracts).toEqual([]);
    expect(seen.candidates).toEqual([]);
    expect(notePageExtract("web_search", { url: pageUrl }, longPage("snippet"), seen)).toBe(seen);
    expect(noteSearch("web_search", seen)).toBe(seen);
    const research = emptyExtractLog();
    expect(noteSearch("web_research", research)).toBe(research);
  });

  it("harvests candidate https URLs from a search result", () => {
    const current = emptyExtractLog();
    const result = {
      results: [
        { url: "https://news.example/a", content: "alpha" },
        { url: "https://news.example/b", content: "beta" },
      ],
    };
    const seen = noteSearch("tavily_search", current, result);
    expect(seen.searched).toBe(true);
    expect(seen.candidates).toEqual(["https://news.example/a", "https://news.example/b"]);
    const opened = notePageExtract(
      "tavily_extract",
      { urls: ["https://news.example/a"] },
      longPage("Opened page A with enough text."),
      seen,
    );
    expect(opened.extracts).toHaveLength(1);
    expect(opened.candidates).toEqual(["https://news.example/b"]);
  });

  it("ignores a result under 1500 characters", () => {
    const current = emptyExtractLog();
    const log = notePageExtract("web_fetch", { url: pageUrl }, "short snippet", current);
    expect(log).toBe(current);
  });

  it("drops the ninth new URL and still updates an existing one", () => {
    let log = emptyExtractLog();
    for (let i = 1; i <= 8; i += 1) {
      log = notePageExtract("web_fetch", { url: `https://docs.example.com/p${i}` }, longPage("page"), log);
    }
    const full = log;
    const dropped = notePageExtract(
      "web_fetch",
      { url: "https://docs.example.com/p9" },
      longPage("ninth"),
      full,
    );
    expect(dropped).toBe(full);
    expect(dropped.extracts.map((entry) => entry.url)).not.toContain("https://docs.example.com/p9");

    const updated = notePageExtract(
      "web_fetch",
      { url: "https://docs.example.com/p1" },
      longPage("replaced page body"),
      full,
    );
    expect(updated.extracts).toHaveLength(8);
    expect(updated.extracts[0]?.text).toContain("replaced page body");
  });

  it("clears the log when a plan is replaced", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "task-guard-extracts-"));
    const config = { ...DEFAULT_CONFIG, storagePath: dir };
    const log = notePageExtract("web_fetch", { url: pageUrl }, longPage("kept"), emptyExtractLog());
    await saveExtracts(config, "main", "sess-1", log);
    expect((await loadExtracts(config, "main", "sess-1")).extracts).toHaveLength(1);
    await saveExtracts(config, "main", "sess-1", noteSearch("web_search", log));
    expect((await loadExtracts(config, "main", "sess-1")).searched).toBe(true);
    await clearExtracts(config, "main", "sess-1");
    expect(await loadExtracts(config, "main", "sess-1")).toEqual({
      extracts: [],
      searched: false,
      candidates: [],
    });
  });

  it("counts a long fetch result from its url field before the async hook saves", () => {
    const body = JSON.stringify({ url: pageUrl, status: 200, text: "word ".repeat(400) });
    const message = { role: "toolResult", content: [{ type: "text", text: body }] };
    const next = countOpenedForResult(emptyExtractLog(), "web_fetch", message);
    expect(next.extracts).toHaveLength(1);
    expect(next.extracts[0]?.url).toBe(pageUrl);
    const searched = countOpenedForResult(next, "web_search", message);
    expect(searched.searched).toBe(true);
    expect(searched.extracts).toHaveLength(1);
    const failed = JSON.stringify({ url: pageUrl, status: "error", error: "x".repeat(MIN_EXTRACT_CHARS) });
    expect(countOpenedForResult(emptyExtractLog(), "web_fetch", failed).extracts).toHaveLength(0);
  });

  it("counts a markdown extract from params on the same result", () => {
    const message = { role: "toolResult", content: [{ type: "text", text: longPage("opened page") }] };
    const next = countOpenedForResult(emptyExtractLog(), "page_extract", message, { urls: `['${pageUrl}']` });
    expect(next.extracts).toHaveLength(1);
    expect(next.extracts[0]?.url).toBe(pageUrl);
  });

  it("reports a call that included several URLs and stores nothing", () => {
    const message = { role: "toolResult", content: [{ type: "text", text: longPage("two pages") }] };
    const opened = openCall(emptyExtractLog(), "page_extract", message, {
      urls: "['https://a.example/1', 'https://b.example/2']",
    });
    expect(opened.log.extracts).toHaveLength(0);
    expect(opened.manyUrls).toBe(2);
  });

  it("picks a prose sentence after literal newlines and skips a heading", () => {
    const price = "AAPL is up 8.70% over the past 30 days and up 41.01% for the past 12 months.";
    const text = `#### AAPL Stock Price Chart Metric Apple Apple(AAPL) shows the latest close.\\n\\n${price}\\n\\n${"paragraph ".repeat(200)}`;
    expect(copyableSentence(text)).toBe(price);
  });
});
