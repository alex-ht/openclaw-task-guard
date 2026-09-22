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
      { title: "a", content: "", format: "md", location: "chat", kind: "chat" },
    ]);
    expect(result.plan).toBeUndefined();
    expect(result.text).toContain("needs title, content, format, location, and kind");
  });

  it("rejects missing kind", () => {
    const result = createPlan([
      { title: "a", content: "c", format: "md", location: "chat" } as never,
    ]);
    expect(result.plan).toBeUndefined();
    expect(result.text).toContain("kind=file");
  });

  it("rejects kind=file with a chat location", () => {
    const result = createPlan([
      { title: "a", content: "c", format: "md", location: "chat", kind: "file" },
    ]);
    expect(result.plan).toBeUndefined();
    expect(result.text).toContain("kind=file requires location to be a file path");
  });

  it("rejects kind=chat", () => {
    const result = createPlan([
      { title: "a", content: "c", format: "md", location: "out.md", kind: "chat" },
    ]);
    expect(result.plan).toBeUndefined();
    expect(result.text).toContain("kind must be file");
    expect(result.text).toContain("Do not deliver in chat");
  });

  it("assigns item-N ids and returns PLAN READY", () => {
    const result = createPlan([
      {
        title: "write",
        content: "report",
        format: "markdown",
        location: "out.md",
        kind: "file",
      },
      {
        title: "summary file",
        content: "done",
        format: "markdown",
        location: "summary.md",
        kind: "file",
      },
    ]);
    expect(result.plan?.items.map((item) => item.id)).toEqual(["item-1", "item-2"]);
    expect(result.text).toMatch(/^PLAN READY/);
    expect(result.text).toContain("task_mark id=item-1");
  });
});
