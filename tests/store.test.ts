import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/types.js";
import { loadPlan, savePlan } from "../src/store.js";
import { createPlan } from "../src/plan.js";

describe("store", () => {
  it("round-trips a plan", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "task-guard-"));
    const config = { ...DEFAULT_CONFIG, storagePath: dir };
    const created = createPlan([
      { title: "a", content: "c", format: "md", location: "chat" },
    ]);
    await savePlan(config, "main", "sess-1", created.plan!);
    const loaded = await loadPlan(config, "main", "sess-1");
    expect(loaded?.planId).toBe(created.plan?.planId);
    expect(loaded?.items[0].id).toBe("item-1");
  });
});
