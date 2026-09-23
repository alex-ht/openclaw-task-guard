import { describe, expect, it } from "vitest";
import { upgradeResearchSources } from "../src/research-sources.js";
import type { RunPlan } from "../src/types.js";

function plan(sources?: number): RunPlan {
  return {
    planId: "p1",
    status: "active",
    items: [
      {
        id: "item-1",
        title: "Report",
        content: "Write the report",
        format: "markdown",
        location: "report.md",
        kind: "file",
        status: "todo",
        ...(sources !== undefined ? { sources } : {}),
      },
    ],
  };
}

describe("upgradeResearchSources", () => {
  it("sets sources to 2 on bare file todos", () => {
    const result = upgradeResearchSources(plan());
    expect(result.upgraded).toBe(true);
    expect(result.plan.items[0].sources).toBe(2);
  });

  it("leaves an explicit sources value alone", () => {
    const result = upgradeResearchSources(plan(1));
    expect(result.upgraded).toBe(false);
    expect(result.plan.items[0].sources).toBe(1);
  });
});
