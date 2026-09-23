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

  it("accepts sources and stores the count", () => {
    const result = createPlan([
      {
        title: "research",
        content: "cited report",
        format: "markdown",
        location: "report.md",
        kind: "file",
        sources: 2,
      },
    ]);
    expect(result.plan?.items[0]?.sources).toBe(2);
    expect(result.text).toMatch(/^PLAN READY/);
  });

  it("rejects a negative sources count", () => {
    const result = createPlan([
      {
        title: "research",
        content: "cited report",
        format: "markdown",
        location: "report.md",
        kind: "file",
        sources: -1,
      },
    ]);
    expect(result.plan).toBeUndefined();
    expect(result.text).toContain("sources must be a whole number from 0 to 2.");
  });

  it("rejects a fractional sources count", () => {
    const result = createPlan([
      {
        title: "research",
        content: "cited report",
        format: "markdown",
        location: "report.md",
        kind: "file",
        sources: 1.5,
      },
    ]);
    expect(result.plan).toBeUndefined();
    expect(result.text).toContain("sources must be a whole number from 0 to 2.");
  });

  it("rejects sources above 2", () => {
    const result = createPlan([
      {
        title: "research",
        content: "cited report",
        format: "markdown",
        location: "report.md",
        kind: "file",
        sources: 4,
      },
    ]);
    expect(result.plan).toBeUndefined();
    expect(result.text).toContain("For a research task use 2.");
  });

  it("omits sources when the item does not set one", () => {
    const result = createPlan([
      { title: "a", content: "c", format: "md", location: "out.md", kind: "file" },
    ]);
    expect(result.plan?.items[0]?.sources).toBeUndefined();
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

  it("rejects a plan file the user did not name", () => {
    const result = createPlan(
      [
        {
          title: "notes",
          content: "extract counts",
          format: "markdown",
          location: "analysis_notes.md",
          kind: "file",
        },
        {
          title: "report",
          content: "client issues",
          format: "markdown",
          location: "client_issues_report.md",
          kind: "file",
        },
      ],
      { requestedBasenames: new Set(["client_issues_report.md", "apache_error.log"]) },
    );
    expect(result.plan).toBeUndefined();
    expect(result.text).toContain(
      "Item 1: location must be a file the user named (apache_error.log, client_issues_report.md). The plan is task_plan, not a file.",
    );
    expect(result.text).toContain("Fix items and call task_plan again.");
  });

  it("accepts only the file the user named", () => {
    const result = createPlan(
      [
        {
          title: "report",
          content: "client issues",
          format: "markdown",
          location: "client_issues_report.md",
          kind: "file",
        },
      ],
      { requestedBasenames: new Set(["client_issues_report.md"]) },
    );
    expect(result.plan?.items.map((item) => item.location)).toEqual(["client_issues_report.md"]);
    expect(result.text).toMatch(/^PLAN READY/);
  });

  it("accepts a plan file when the user named it", () => {
    const result = createPlan(
      [
        {
          title: "triage",
          content: "priorities",
          format: "markdown",
          location: "triage_report.md",
          kind: "file",
        },
        {
          title: "remediation",
          content: "fix order",
          format: "markdown",
          location: "remediation_plan.md",
          kind: "file",
        },
      ],
      { requestedBasenames: new Set(["triage_report.md", "remediation_plan.md"]) },
    );
    expect(result.plan?.items.map((item) => item.location)).toEqual([
      "triage_report.md",
      "remediation_plan.md",
    ]);
  });

  it("still accepts an extra path when no prompt was captured", () => {
    const result = createPlan([
      {
        title: "notes",
        content: "extract counts",
        format: "markdown",
        location: "analysis_notes.md",
        kind: "file",
      },
    ]);
    expect(result.plan?.items).toHaveLength(1);
  });

  it("does not ban filenames when the captured prompt names none", () => {
    const result = createPlan(
      [
        {
          title: "report",
          content: "summary",
          format: "markdown",
          location: "report.md",
          kind: "file",
        },
      ],
      { requestedBasenames: new Set() },
    );
    expect(result.plan?.items).toHaveLength(1);
  });
});
