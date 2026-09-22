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

  it("stays quiet when enforcement is off or the plan is done", () => {
    const message = { role: "toolResult", content: "body" };
    expect(
      applyToolProgress(message, plan, { ...DEFAULT_CONFIG, enforcement: "off" }, "read"),
    ).toBeUndefined();
    expect(applyToolProgress(message, { ...plan, status: "done" }, DEFAULT_CONFIG, "read")).toBeUndefined();
    expect(message.content).toBe("body");
  });
});
