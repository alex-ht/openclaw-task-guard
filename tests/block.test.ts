import { describe, expect, it } from "vitest";
import { toolBlockReason } from "../src/block.js";
import type { PageExtract } from "../src/extracts.js";
import type { RunPlan } from "../src/types.js";

const quote =
  "Diverging national rules may lead to the fragmentation of the internal market and may decrease legal certainty for operators.";

function plan(sources?: number): RunPlan {
  return {
    planId: "p1",
    status: "active",
    items: [
      {
        id: "item-1",
        title: "report",
        content: "research report",
        format: "markdown",
        location: "report.md",
        kind: "file",
        status: "todo",
        ...(sources === undefined ? {} : { sources }),
      },
    ],
  };
}

const page: PageExtract = { url: "https://example.com/a", chars: 2000, text: `${quote} ${"word ".repeat(80)}` };

function block(
  toolName: string,
  extra: Partial<Parameters<typeof toolBlockReason>[0]> = {},
): string | null {
  return toolBlockReason({
    enforcement: "gate",
    plan: plan(2),
    opened: 0,
    searched: false,
    extracts: [],
    toolName,
    params: {},
    ...extra,
  });
}

describe("toolBlockReason", () => {
  it("blocks a write while pages are still short", () => {
    const reason = block("write");
    expect(reason).toContain("Pages 0/2");
    expect(reason).toContain("Do not write the file yet.");
    expect(reason).not.toContain("Stop fetching");
  });

  it("lets the first search run and blocks the next one", () => {
    expect(block("tavily_search")).toBeNull();
    const reason = block("tavily_search", { searched: true });
    expect(reason).toContain("Search blocked until pages are open.");
    expect(reason).toContain("Do not search again.");
    expect(reason).toContain("Do not write the file yet.");
  });

  it("blocks a fetch that passes several https URLs", () => {
    const reason = block("tavily_extract", {
      params: { urls: ["https://example.com/a", "https://example.com/b", "https://example.com/c"] },
    });
    expect(reason).toContain("This call had 3 https URLs, so it opened no page.");
  });

  it("allows one https URL and task_mark before the pages are full", () => {
    expect(block("tavily_extract", { params: { urls: ["https://example.com/a"] } })).toBeNull();
    expect(block("task_mark", { params: { id: "item-1", status: "done" } })).toBeNull();
    expect(block("read")).toBeNull();
  });

  it("blocks another fetch once both pages are open and still allows the file edit", () => {
    const full = { opened: 2, extracts: [page, { ...page, url: "https://example.com/b" }] };
    expect(block("tavily_extract", { ...full, params: { urls: ["https://example.com/c"] } })).toContain(
      "Stop fetching.",
    );
    expect(block("tavily_search", full)).toContain("Stop fetching.");
    expect(block("exec", full)).toBeNull();
    expect(
      block("write", {
        ...full,
        params: { content: "https://example.com/a\n> sentence\nhttps://example.com/b\n> sentence\n" },
      }),
    ).toBeNull();
  });

  it("blocks writing and another search after a search when sources was omitted, but allows one fetch", () => {
    const reason = block("write", { plan: plan(), searched: true });
    expect(reason).toContain("Sources set to 2.");
    expect(block("tavily_search", { plan: plan(0), searched: true })).toContain("Sources set to 2");
    expect(
      block("tavily_extract", {
        plan: plan(0),
        searched: true,
        params: { urls: ["https://example.com/a"] },
      }),
    ).toBeNull();
    expect(block("task_plan", { plan: plan(), searched: true })).toBeNull();
  });

  it("stays quiet unless enforcement is gate", () => {
    expect(block("write", { enforcement: "remind" })).toBeNull();
    expect(block("write", { enforcement: "off" })).toBeNull();
    expect(block("write", { plan: null })).toBeNull();
  });

  it("Pages 1/2 + search is blocked and pins a remaining candidate URL", () => {
    const reason = block("tavily_search", {
      opened: 1,
      searched: true,
      extracts: [page],
      candidates: ["https://example.com/a", "https://example.com/b"],
    });
    expect(reason).toContain("Pages 1/2");
    expect(reason).toContain("Search blocked until pages are open.");
    expect(reason).toContain("Fetch exactly one URL now: https://example.com/b");
    expect(reason).not.toContain("https://example.com/a");
  });

  it("Pages 1/2 + single-URL fetch stays allowed", () => {
    expect(
      block("tavily_extract", {
        opened: 1,
        searched: true,
        extracts: [page],
        candidates: ["https://example.com/b"],
        params: { urls: ["https://example.com/b"] },
      }),
    ).toBeNull();
  });

  it("Pages 2/2 + search stays blocked with stop-fetching guidance", () => {
    const full = {
      opened: 2,
      searched: true,
      extracts: [page, { ...page, url: "https://example.com/b" }],
      candidates: [],
    };
    expect(block("tavily_search", full)).toContain("Stop fetching.");
  });

  it("still blocks write while sources are unmet", () => {
    const reason = block("write", {
      opened: 1,
      searched: true,
      extracts: [page],
      candidates: ["https://example.com/b"],
    });
    expect(reason).toContain("Pages 1/2");
    expect(reason).toContain("Do not write the file yet.");
    expect(reason).toContain("https://example.com/b");
  });

});
