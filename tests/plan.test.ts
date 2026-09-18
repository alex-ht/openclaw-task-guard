import { describe, expect, it } from "vitest";
import { createPlan } from "../src/plan.js";

describe("createPlan", () => {
  it("rejects an empty list", () => {
    const result = createPlan([]);
    expect(result.plan).toBeUndefined();
    expect(result.text).toContain("ERROR.");
    expect(result.text).toContain("Call task_plan again");
  });

  it("rejects a missing field", () => {
    const result = createPlan([
      { title: "a", content: "", format: "md", location: "chat" },
    ]);
    expect(result.plan).toBeUndefined();
    expect(result.text).toContain("needs title, content, format, and location");
  });

  it("assigns item-N ids and returns PLAN READY", () => {
    const result = createPlan([
      {
        title: "write",
        content: "report",
        format: "markdown",
        location: "out.md",
      },
      {
        title: "say",
        content: "done",
        format: "1 sentence",
        location: "chat",
      },
    ]);
    expect(result.plan?.items.map((item) => item.id)).toEqual(["item-1", "item-2"]);
    expect(result.text).toMatch(/^PLAN READY/);
    expect(result.text).toContain("task_mark id=item-1");
  });
});
