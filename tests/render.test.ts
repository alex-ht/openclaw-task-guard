import { describe, expect, it } from "vitest";
import {
  renderPlanDone,
  renderPlanOpen,
  renderPlanReady,
  renderStopEarly,
  renderTaskRule,
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
      status: "todo",
    },
    {
      id: "item-2",
      title: "tell user",
      content: "user summary",
      format: "3 bullets",
      location: "chat",
      status: "todo",
    },
  ],
};

describe("render", () => {
  it("renders the no-plan rule in short English lines", () => {
    const text = renderTaskRule();
    expect(text).toContain("TASK RULE");
    expect(text).toContain("Call task_plan now");
    expect(text.split("\n").length).toBeLessThanOrEqual(12);
  });

  it("renders PLAN READY with a copyable NEXT line for the first todo", () => {
    const text = renderPlanReady(plan);
    expect(text).toMatch(/^PLAN READY/);
    expect(text).toContain("id=item-1 FILE=docs/change.md");
    expect(text).toContain("NEXT: do item-1, then call task_mark id=item-1 status=done evidence=docs/change.md");
  });

  it("points NOW at only the first todo", () => {
    const text = renderPlanOpen(plan);
    expect(text).toMatch(/^TASK OPEN/);
    expect(text).toContain("NOW: finish item-1, then call task_mark id=item-1 status=done evidence=docs/change.md");
    expect(text).not.toContain("NOW: finish item-2");
  });

  it("prefixes STOP when the agent tries to end early", () => {
    const text = renderStopEarly(plan);
    expect(text.startsWith("STOP. You tried to finish too early.")).toBe(true);
    expect(text).toContain("TASK OPEN. Do not stop.");
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
        status: "todo" as const,
      })),
    };
    const text = renderPlanOpen(many);
    expect(text).toContain("... +2 more");
    expect(text).toContain("NOW: finish item-1");
  });

  it("renders PLAN DONE", () => {
    expect(renderPlanDone()).toBe("PLAN DONE\nAll items marked. You may stop.");
  });
});
