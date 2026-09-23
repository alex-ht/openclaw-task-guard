import { describe, expect, it } from "vitest";
import {
  renderPlanDone,
  renderPlanOpen,
  renderPlanReady,
  renderStopEarly,
  renderTaskRule,
  renderToolProgress,
} from "../src/render.js";
import type { RunPlan } from "../src/types.js";

const plan: RunPlan = {
  planId: "p1",
  status: "active",
  items: [
    {
      id: "item-1",
      title: "write report",
      content: "change summary",
      format: "markdown ## Summary ## Files",
      location: "docs/change.md",
      kind: "file",
      status: "todo",
    },
    {
      id: "item-2",
      title: "tell user",
      content: "user summary",
      format: "3 bullets",
      location: "chat",
      kind: "chat",
      status: "todo",
    },
  ],
};

describe("render", () => {
  it("renders the no-plan rule in short English lines", () => {
    const text = renderTaskRule();
    expect(text).toContain("TASK RULE");
    expect(text).toContain("Call task_plan now");
    expect(text).toContain("kind=file");
    expect(text).toContain("Each location is a file the user named. The plan is this tool. Do not add a plan or notes file.");
    expect(text).toContain(
      "5. For researched facts, set sources to 2. Open two https pages and quote one verbatim sentence from each.",
    );
    expect(text.split("\n").length).toBeLessThanOrEqual(12);
  });

  it("renders PLAN READY with a copyable NEXT line for the first todo", () => {
    const text = renderPlanReady(plan);
    expect(text).toMatch(/^PLAN READY/);
    expect(text).toContain("id=item-1 FILE=docs/change.md");
    expect(text).toContain("NEXT: do item-1, then call task_mark id=item-1 status=done evidence=docs/change.md");
  });

  it("renders a two-line progress reminder with done and open counts", () => {
    const text = renderToolProgress(plan);
    expect(text).toBe(
      [
        "TASK OPEN. 0 done, 2 open. No text until every item is marked, unless the task cannot be done.",
        "NOW: finish item-1, then call task_mark id=item-1 status=done evidence=docs/change.md",
      ].join("\n"),
    );
    expect(text!.split("\n").length).toBeLessThanOrEqual(12);
  });

  it("points NOW at only the first todo", () => {
    const text = renderPlanOpen(plan);
    expect(text).toMatch(/^TASK OPEN/);
    expect(text).toContain("NOW: finish item-1, then call task_mark id=item-1 status=done evidence=docs/change.md");
    expect(text).not.toContain("NOW: finish item-2");
  });

  it("prefixes STOP when the agent tries to end early", () => {
    const text = renderStopEarly(plan);
    expect(text.startsWith("STOP. You sent text before the plan was done.")).toBe(true);
    expect(text).toContain(
      "TASK OPEN. No text until every item is marked, unless the task cannot be done.",
    );
  });

  it("truncates long TODO lists", () => {
    const many: RunPlan = {
      planId: "p2",
      status: "active",
      items: Array.from({ length: 10 }, (_, i) => ({
        id: `item-${i + 1}`,
        title: `t${i + 1}`,
        content: `c${i + 1}`,
        format: "txt",
        location: "chat",
        kind: "chat" as const,
        status: "todo" as const,
      })),
    };
    const text = renderPlanOpen(many);
    expect(text).toContain("... +2 more");
    expect(text).toContain("NOW: finish item-1");
  });

  it("shows sources on the todo line and the NOW line", () => {
    const researched: RunPlan = {
      planId: "p3",
      status: "active",
      items: [
        {
          id: "item-1",
          title: "research",
          content: "cited report",
          format: "markdown",
          location: "report.md",
          kind: "file",
          status: "todo",
          sources: 2,
        },
      ],
    };
    const open = renderPlanOpen(researched);
    expect(open).toContain("id=item-1 FILE=report.md | content: cited report | format: markdown | sources=2");
    expect(open).toContain("TASK OPEN. Pages 0/2. No text until every item is marked, unless the task cannot be done.");
    expect(open).toContain(
      "NOW: finish item-1. Pages 0/2. Call a fetch tool with one https URL you have not opened yet (exactly one URL in the arguments). Do not write the file yet.",
    );
    expect(open).not.toContain("https://example.com/article");
    expect(renderPlanReady(researched)).toContain(
      "NEXT: do item-1. Pages 0/2. Call a fetch tool with one https URL you have not opened yet (exactly one URL in the arguments). Do not write the file yet.",
    );
    expect(open.split("\n").length).toBeLessThanOrEqual(12);

    const search = renderToolProgress(researched, 0, "web_search");
    expect(search).toContain("TASK OPEN. 0 done, 1 open. Pages 0/2.");
    expect(search).toContain("Search blocked until pages are open.");
    expect(search).toContain("Do not search again.");
    expect(search!.split("\n").length).toBeLessThanOrEqual(12);
    const pinned = renderToolProgress(
      researched,
      1,
      "web_search",
      [{ url: "https://example.com/a", chars: 2000, text: "x".repeat(2000) }],
      0,
      ["https://example.com/a", "https://example.com/b"],
    );
    expect(pinned).toContain("Pages 1/2.");
    expect(pinned).toContain("Fetch exactly one URL now: https://example.com/b");
    const write = renderToolProgress(researched, 1, "write");
    expect(write).toContain("Pages 1/2.");
    expect(write).toContain("you have not opened yet");
    expect(write).not.toContain("This search is not an opened page.");
    const ready = renderToolProgress(researched, 2, "write");
    expect(ready).toContain("Pages 2/2. Stop fetching.");
    expect(ready).toContain("task_mark id=item-1 status=done evidence=report.md");
    expect(ready).not.toContain("Call a fetch tool");
    const sentence =
      "The company reported that revenue grew during the quarter ending September 2026 and raised its full-year guidance.";
    const pasted = renderToolProgress(researched, 2, "write", [
      {
        url: "https://docs.example.com/one",
        chars: 2000,
        text: `${sentence} ${"paragraph ".repeat(80)}`,
      },
      {
        url: "https://docs.example.com/two",
        chars: 2000,
        text: `${sentence} ${"paragraph ".repeat(80)}`,
      },
    ]);
    expect(pasted).toContain("Append these lines to report.md");
    expect(pasted).toContain("https://docs.example.com/one");
    expect(pasted).toContain(`> ${sentence}`);
    expect(pasted).toContain("Do not speak.");
    expect(pasted!.split("\n").length).toBeLessThanOrEqual(12);
    expect(renderStopEarly(researched, 1)).toContain("Pages 1/2.");
    const many = renderToolProgress(researched, 0, "page_extract", [], 2);
    expect(many).toContain("This call had 2 https URLs, so it opened no page.");
    expect(many).toContain("Do not write the file yet.");
    expect(many!.split("\n").length).toBeLessThanOrEqual(12);

    const uncited: RunPlan = {
      ...researched,
      items: [{ ...researched.items[0], sources: undefined }],
    };
    const bareSearch = renderToolProgress(uncited, 0, "web_search");
    expect(bareSearch).toContain("Sources set to 2.");
    expect(bareSearch).toContain("Do not speak.");
    expect(bareSearch).not.toContain("task_mark");
  });

  it("renders PLAN DONE", () => {
    expect(renderPlanDone()).toBe("PLAN DONE\nAll items marked. You may speak.");
  });
});
