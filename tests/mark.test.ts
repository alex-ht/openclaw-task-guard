import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { markItem } from "../src/mark.js";
import { createPlan } from "../src/plan.js";

describe("markItem", () => {
  it("rejects unknown ids", async () => {
    const created = createPlan([
      { title: "a", content: "c", format: "md", location: "chat" },
    ]);
    const result = await markItem(created.plan!, { id: "nope", status: "done", evidence: "x" });
    expect(result.text).toContain("ERROR.");
    expect(result.text).toContain("Unknown id=nope");
    expect(result.plan.items[0].status).toBe("todo");
  });

  it("requires evidence for done", async () => {
    const created = createPlan([
      { title: "a", content: "c", format: "md", location: "chat" },
    ]);
    const result = await markItem(created.plan!, { id: "item-1", status: "done" });
    expect(result.text).toContain("requires evidence");
    expect(result.plan.items[0].status).toBe("todo");
  });

  it("rejects missing files", async () => {
    const created = createPlan([
      { title: "a", content: "c", format: "md", location: "/tmp/task-guard-missing.md" },
    ]);
    const result = await markItem(created.plan!, {
      id: "item-1",
      status: "done",
      evidence: "/tmp/task-guard-missing.md",
    });
    expect(result.text).toContain("ERROR.");
    expect(result.text).toContain("File missing");
    expect(result.plan.items[0].status).toBe("todo");
  });

  it("rejects invalid JSON files", async () => {
    const dir = await mkdir(path.join(os.tmpdir(), `task-guard-${Date.now()}`), { recursive: true });
    const file = path.join(dir!, "bad.json");
    await writeFile(file, "{nope", "utf8");
    const created = createPlan([
      { title: "a", content: "json", format: "json", location: file },
    ]);
    const result = await markItem(created.plan!, { id: "item-1", status: "done", evidence: file });
    expect(result.text).toContain("Invalid JSON");
  });

  it("marks a chat item done and reports PLAN DONE", async () => {
    const created = createPlan([
      { title: "a", content: "c", format: "md", location: "chat" },
    ]);
    const result = await markItem(created.plan!, {
      id: "item-1",
      status: "done",
      evidence: "replied with the summary",
    });
    expect(result.plan.status).toBe("done");
    expect(result.text).toMatch(/^PLAN DONE/);
  });

  it("keeps the plan open after cancelling one of two items", async () => {
    const created = createPlan([
      { title: "a", content: "c1", format: "md", location: "chat" },
      { title: "b", content: "c2", format: "md", location: "chat" },
    ]);
    const result = await markItem(created.plan!, { id: "item-1", status: "cancel" });
    expect(result.plan.status).toBe("active");
    expect(result.text).toContain("NOW: finish item-2");
  });
});
