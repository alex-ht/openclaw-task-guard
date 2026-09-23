import { describe, expect, it } from "vitest";
import { applyToolProgress, finalizeDecision, promptInjection, promptSystemContext } from "../src/hooks-logic.js";
import { DEFAULT_CONFIG, type RunPlan } from "../src/types.js";

const openPlan: RunPlan = {
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
      status: "todo",
    },
  ],
};

describe("promptInjection", () => {
  it("skips heartbeat and internal turns", () => {
    expect(promptInjection(null, DEFAULT_CONFIG, { trigger: "heartbeat" })).toBeNull();
    expect(
      promptInjection(openPlan, DEFAULT_CONFIG, { inputProvenance: { kind: "internal_system" } }),
    ).toBeNull();
  });

  it("injects TASK RULE when there is no plan", () => {
    expect(promptInjection(null, DEFAULT_CONFIG, { trigger: "user" })).toContain("TASK RULE");
  });

  it("injects TASK OPEN when todos remain", () => {
    const text = promptInjection(openPlan, DEFAULT_CONFIG, { trigger: "user" });
    expect(text).toContain("TASK OPEN");
    expect(text).toContain("task_mark id=item-1");
  });

  it("keeps the open plan in system context for the whole turn", () => {
    const text = promptSystemContext(openPlan, DEFAULT_CONFIG, { trigger: "user" });
    expect(text).toContain("TASK OPEN");
    expect(text).toContain("task_mark id=item-1");
    expect(promptSystemContext(null, DEFAULT_CONFIG, { trigger: "user" })).toBeNull();
    expect(
      promptSystemContext(openPlan, { ...DEFAULT_CONFIG, enforcement: "off" }, { trigger: "user" }),
    ).toBeNull();
  });

  it("is silent when enforcement is off", () => {
    expect(
      promptInjection(openPlan, { ...DEFAULT_CONFIG, enforcement: "off" }, { trigger: "user" }),
    ).toBeNull();
  });
});

describe("finalizeDecision", () => {
  it("revises when gate and todos remain", () => {
    const decision = finalizeDecision(openPlan, DEFAULT_CONFIG);
    expect(decision.action).toBe("revise");
    if (decision.action === "revise") {
      expect(decision.instruction).toContain("STOP. You sent text before the plan was done.");
      expect(decision.idempotencyKey).toBe("task-guard:abc:open");
      expect(decision.maxAttempts).toBe(2);
    }
  });

  it("continues when remind or off", () => {
    expect(finalizeDecision(openPlan, { ...DEFAULT_CONFIG, enforcement: "remind" }).action).toBe(
      "continue",
    );
    expect(finalizeDecision(openPlan, { ...DEFAULT_CONFIG, enforcement: "off" }).action).toBe(
      "continue",
    );
  });

  it("includes the page count when the open item cites sources", () => {
    const researched: RunPlan = {
      ...openPlan,
      items: [{ ...openPlan.items[0], sources: 2, location: "report.md" }],
    };
    const decision = finalizeDecision(researched, DEFAULT_CONFIG, 1);
    expect(decision.action).toBe("revise");
    if (decision.action === "revise") {
      expect(decision.instruction).toContain("Pages 1/2.");
      expect(decision.instruction).toContain("you have not opened yet");
      expect(decision.instruction).not.toContain("https://example.com/article");
    }
  });

  it("continues when the plan is done", () => {
    expect(finalizeDecision({ ...openPlan, status: "done", items: [] }, DEFAULT_CONFIG).action).toBe(
      "continue",
    );
  });
});
