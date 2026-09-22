import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { markItem } from "../src/mark.js";
import { createPlan } from "../src/plan.js";
import type { RunPlan } from "../src/types.js";

function legacyChatPlan(items: Array<{ id: string; content: string }>): RunPlan {
  return {
    planId: "legacy",
    status: "active",
    items: items.map((item) => ({
      id: item.id,
      title: item.id,
      content: item.content,
      format: "md",
      location: "chat",
      kind: "chat",
      status: "todo",
    })),
  };
}

async function tempDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "task-guard-"));
}

describe("markItem", () => {
  it("rejects unknown ids", async () => {
    const created = createPlan([
      { title: "a", content: "c", format: "md", location: "out.md", kind: "file" },
    ]);
    const result = await markItem(created.plan!, { id: "nope", status: "done", evidence: "x" });
    expect(result.text).toContain("ERROR.");
    expect(result.text).toContain("Unknown id=nope");
    expect(result.plan.items[0].status).toBe("todo");
  });

  it("requires evidence for done", async () => {
    const created = createPlan([
      { title: "a", content: "c", format: "md", location: "out.md", kind: "file" },
    ]);
    const result = await markItem(created.plan!, { id: "item-1", status: "done" });
    expect(result.text).toContain("requires evidence");
    expect(result.plan.items[0].status).toBe("todo");
  });

  it("rejects missing files", async () => {
    const created = createPlan([
      {
        title: "a",
        content: "c",
        format: "md",
        location: "/tmp/task-guard-missing.md",
        kind: "file",
      },
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
    const dir = await tempDir();
    const file = path.join(dir, "bad.json");
    await writeFile(file, "{nope", "utf8");
    const created = createPlan([
      { title: "a", content: "json", format: "json", location: file, kind: "file" },
    ]);
    const result = await markItem(created.plan!, { id: "item-1", status: "done", evidence: file });
    expect(result.text).toContain("Invalid JSON");
  });

  it("marks a stored chat item done and reports PLAN DONE", async () => {
    const result = await markItem(legacyChatPlan([{ id: "item-1", content: "c" }]), {
      id: "item-1",
      status: "done",
      evidence: "replied with the summary",
    });
    expect(result.plan.status).toBe("done");
    expect(result.text).toMatch(/^PLAN DONE/);
  });

  it("keeps the plan open after cancelling one of two items", async () => {
    const created = createPlan([
      { title: "a", content: "c1", format: "md", location: "a.md", kind: "file" },
      { title: "b", content: "c2", format: "md", location: "b.md", kind: "file" },
    ]);
    const result = await markItem(created.plan!, { id: "item-1", status: "cancel" });
    expect(result.plan.status).toBe("active");
    expect(result.text).toContain("NOW: finish item-2");
  });

  it("marks a file item done only when the planned file exists", async () => {
    const dir = await tempDir();
    const file = path.join(dir, "out.md");
    await writeFile(file, "# ok\n", "utf8");
    const created = createPlan([
      { title: "a", content: "c", format: "md", location: file, kind: "file" },
    ]);
    const result = await markItem(created.plan!, {
      id: "item-1",
      status: "done",
      evidence: file,
    });
    expect(result.plan.status).toBe("done");
    expect(result.text).toMatch(/^PLAN DONE/);
  });

  it("rejects file evidence that points at a different existing file", async () => {
    const dir = await tempDir();
    const planned = path.join(dir, "planned.md");
    const other = path.join(dir, "other.md");
    await writeFile(other, "not the deliverable\n", "utf8");
    const created = createPlan([
      { title: "a", content: "c", format: "md", location: planned, kind: "file" },
    ]);
    const result = await markItem(created.plan!, {
      id: "item-1",
      status: "done",
      evidence: other,
    });
    expect(result.text).toContain("evidence must be the planned file");
    expect(result.plan.items[0].status).toBe("todo");
  });

  it("accepts a file item when the planned file exists even if evidence is prose", async () => {
    const dir = await tempDir();
    const file = path.join(dir, "out.md");
    await writeFile(file, "# ok\n", "utf8");
    const created = createPlan([
      { title: "a", content: "c", format: "md", location: file, kind: "file" },
    ]);
    const result = await markItem(created.plan!, {
      id: "item-1",
      status: "done",
      evidence: "wrote the report",
    });
    expect(result.plan.status).toBe("done");
  });

  it("rejects a file item when evidence is prose but the file is missing", async () => {
    const created = createPlan([
      {
        title: "a",
        content: "c",
        format: "md",
        location: "/tmp/task-guard-never-wrote.md",
        kind: "file",
      },
    ]);
    const result = await markItem(created.plan!, {
      id: "item-1",
      status: "done",
      evidence: "I wrote the file",
    });
    expect(result.text).toContain("File missing");
    expect(result.plan.items[0].status).toBe("todo");
  });
});
