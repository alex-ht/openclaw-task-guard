import { describe, expect, it } from "vitest";
import { applyToolProgress } from "../src/hooks-logic.js";
import { DEFAULT_CONFIG, type RunPlan } from "../src/types.js";

const plan: RunPlan = {
  planId: "abc",
  status: "active",
  items: [
    {
      id: "item-1",
      title: "write",
      content: "report",
      format: "md",
      location: "out.md",
      kind: "file",
      status: "done",
      evidence: "out.md",
    },
    {
      id: "item-2",
      title: "reply",
      content: "summary",
      format: "bullets",
      location: "chat",
      kind: "chat",
      status: "todo",
    },
  ],
};

const progress = [
  "TASK OPEN. 1 done, 1 open. No text until every item is marked, unless the task cannot be done.",
  "NOW: finish item-2, then call task_mark id=item-2 status=done evidence=<short proof>",
].join("\n");

describe("applyToolProgress", () => {
  it("prepends the current progress to a tool result", () => {
    const message = {
      role: "toolResult",
      content: [{ type: "text", text: "file written" }],
    };
    const next = applyToolProgress(message, plan, DEFAULT_CONFIG, "write");
    expect(next).toBe(message);
    expect(message.content[0]).toEqual({ type: "text", text: progress });
    expect(message.content[1]).toEqual({ type: "text", text: "file written" });
  });

  it("replaces a stale progress block when counts change", () => {
    const message = {
      role: "toolResult",
      content: [
        { type: "text", text: "TASK OPEN. 0 done, 2 open. No text until every item is marked, unless the task cannot be done.\nNOW: finish item-1, then call task_mark id=item-1 status=done evidence=out.md" },
        { type: "text", text: "ok" },
      ],
    };
    applyToolProgress(message, plan, DEFAULT_CONFIG, "read");
    expect(message.content[0].text).toBe(progress);
    expect(message.content).toHaveLength(2);
  });

  it("does not stack the same progress twice", () => {
    const message = {
      role: "toolResult",
      content: [{ type: "text", text: progress }],
    };
    expect(applyToolProgress(message, plan, DEFAULT_CONFIG, "read")).toBeUndefined();
    expect(message.content).toHaveLength(1);
  });

  it("skips task_plan and task_mark results", () => {
    const message = { role: "toolResult", content: [{ type: "text", text: "PLAN READY" }] };
    expect(applyToolProgress(message, plan, DEFAULT_CONFIG, "task_plan")).toBeUndefined();
    expect(applyToolProgress(message, plan, DEFAULT_CONFIG, "task_mark")).toBeUndefined();
    expect(message.content).toEqual([{ type: "text", text: "PLAN READY" }]);
  });

  it("tells a search result that it is not an opened page", () => {
    const researched: RunPlan = {
      planId: "src",
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
          sources: 5,
        },
      ],
    };
    const search = {
      role: "toolResult",
      content: [{ type: "text", text: "snippets" }],
    };
    applyToolProgress(search, researched, DEFAULT_CONFIG, "web_search", 0);
    expect(search.content[0].text).toContain("Pages 0/5.");
    expect(search.content[0].text).toContain("Search blocked until pages are open.");
    expect(search.content[0].text).toContain("Do not search again.");
    expect(search.content[1]).toEqual({ type: "text", text: "snippets" });

    const write = { role: "toolResult", content: "wrote report.md" };
    applyToolProgress(write, researched, DEFAULT_CONFIG, "write", 1);
    expect(write.content).toContain("Pages 1/5.");
    expect(write.content).toContain("you have not opened yet");
    expect(write.content).not.toContain("Search blocked until pages are open.");
    const done = { role: "toolResult", content: "wrote report.md" };
    applyToolProgress(done, researched, DEFAULT_CONFIG, "write", 5);
    expect(done.content).toContain("Pages 5/5. Stop fetching.");
    expect(done.content).not.toContain("https://example.com");
    expect(String(write.content).split("\n").length).toBeLessThanOrEqual(12);

    const sentence =
      "The company reported that revenue grew during the quarter ending September 2026 and raised its full-year guidance.";
    const sourced = {
      role: "toolResult",
      content: "wrote report.md",
    };
    const extracts = [
      {
        url: "https://docs.example.com/guide",
        chars: 2000,
        text: `${sentence} ${"paragraph ".repeat(80)}`,
      },
    ];
    const onePage = {
      ...researched,
      items: [{ ...researched.items[0], sources: 1 }],
    };
    applyToolProgress(sourced, onePage, DEFAULT_CONFIG, "write", 1, extracts);
    applyToolProgress(sourced, onePage, DEFAULT_CONFIG, "write", 1, extracts);
    expect(String(sourced.content).split("https://docs.example.com/guide").length - 1).toBe(1);
    expect(String(sourced.content)).toContain("> " + sentence);
    expect(String(sourced.content)).toContain("wrote report.md");
    expect(String(sourced.content).split("\n").length).toBeLessThanOrEqual(12);
  });

  it("stays quiet when enforcement is off or the plan is done", () => {
    const message = { role: "toolResult", content: "body" };
    expect(
      applyToolProgress(message, plan, { ...DEFAULT_CONFIG, enforcement: "off" }, "read"),
    ).toBeUndefined();
    expect(applyToolProgress(message, { ...plan, status: "done" }, DEFAULT_CONFIG, "read")).toBeUndefined();
    expect(message.content).toBe("body");
  });
});
