import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/types.js";
import { loadPlan, loadPlanSync, planFilePath, savePlan } from "../src/store.js";
import { createPlan } from "../src/plan.js";

describe("store", () => {
  it("round-trips a plan", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "task-guard-"));
    const config = { ...DEFAULT_CONFIG, storagePath: dir };
    const created = createPlan([
      { title: "a", content: "c", format: "md", location: "out.md", kind: "file" },
    ]);
    await savePlan(config, "main", "sess-1", created.plan!);
    const loaded = await loadPlan(config, "main", "sess-1");
    expect(loaded?.planId).toBe(created.plan?.planId);
    expect(loaded?.items[0].id).toBe("item-1");
    expect(loaded?.items[0].kind).toBe("file");
  });

  it("infers kind for plans saved before the field existed", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "task-guard-"));
    const config = { ...DEFAULT_CONFIG, storagePath: dir };
    const created = createPlan([
      { title: "a", content: "c", format: "md", location: "out.md", kind: "file" },
    ]);
    await savePlan(config, "main", "sess-old", created.plan!);
    const loadedOnce = await loadPlan(config, "main", "sess-old");
    const file = planFilePath(config, "main", "sess-old");
    const legacy = {
      ...loadedOnce,
      items: loadedOnce!.items.map(({ kind: _kind, ...item }) => item),
    };
    await writeFile(file, `${JSON.stringify(legacy, null, 2)}\n`, "utf8");
    const loaded = await loadPlan(config, "main", "sess-old");
    expect(loaded?.items[0].kind).toBe("file");
    expect(loaded?.items[0].sources).toBeUndefined();
    expect(loadPlanSync(config, "main", "sess-old")?.items[0].kind).toBe("file");
  });

  it("round-trips a sources count and drops a missing one", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "task-guard-"));
    const config = { ...DEFAULT_CONFIG, storagePath: dir };
    const created = createPlan([
      {
        title: "research",
        content: "cited report",
        format: "markdown",
        location: "report.md",
        kind: "file",
        sources: 2,
      },
    ]);
    await savePlan(config, "main", "sess-src", created.plan!);
    expect((await loadPlan(config, "main", "sess-src"))?.items[0].sources).toBe(2);
  });
});
