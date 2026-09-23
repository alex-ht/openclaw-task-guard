import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { notePageExtract, emptyExtractLog, type PageExtract } from "../src/extracts.js";
import { markItem } from "../src/mark.js";
import { createPlan } from "../src/plan.js";
import type { RunPlan } from "../src/types.js";

const pageUrl = "https://docs.example.com/guide";
const pageQuote =
  "The specification requires every agent to open the full page before citing a sentence from it today.";

function longPage(body: string): string {
  return `${body} ${"paragraph ".repeat(200)}`;
}

function extractFor(url: string, body: string): PageExtract[] {
  return notePageExtract("web_fetch", { url }, longPage(body), emptyExtractLog()).extracts;
}

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

  it("marks a researched file done when the quote is in the page extract", async () => {
    const dir = await tempDir();
    const file = path.join(dir, "report.md");
    await writeFile(file, `${pageUrl}\n> ${pageQuote}\n`, "utf8");
    const created = createPlan([
      {
        title: "research",
        content: "cited report",
        format: "markdown",
        location: file,
        kind: "file",
        sources: 1,
      },
    ]);
    const result = await markItem(created.plan!, { id: "item-1", status: "done", evidence: file }, extractFor(pageUrl, pageQuote));
    expect(result.plan.status).toBe("done");
    expect(result.text).toMatch(/^PLAN DONE/);
  });

  it("rejects a quote when the session only has a search snippet", async () => {
    const dir = await tempDir();
    const file = path.join(dir, "report.md");
    await writeFile(file, `${pageUrl}\n> ${pageQuote}\n`, "utf8");
    const created = createPlan([
      {
        title: "research",
        content: "cited report",
        format: "markdown",
        location: file,
        kind: "file",
        sources: 1,
      },
    ]);
    const result = await markItem(created.plan!, { id: "item-1", status: "done", evidence: file }, []);
    expect(result.text).toContain(`${pageUrl} has no full-page extract`);
    expect(result.plan.items[0].status).toBe("todo");
  });

  it("accepts a quote wrapped in quotation marks on a markdown-link line", async () => {
    const dir = await tempDir();
    const file = path.join(dir, "report.md");
    const sentence =
      "Diverging national rules may lead to the fragmentation of the internal market and may decrease legal certainty for operators that develop or use AI systems.";
    await writeFile(
      file,
      `1. [Official text](${pageUrl})\n   > "${sentence}"\n`,
      "utf8",
    );
    const created = createPlan([
      {
        title: "research",
        content: "cited report",
        format: "markdown",
        location: file,
        kind: "file",
        sources: 1,
      },
    ]);
    const result = await markItem(
      created.plan!,
      { id: "item-1", status: "done", evidence: file },
      extractFor(pageUrl, sentence),
    );
    expect(result.plan.status).toBe("done");
  });

  it("rejects a quoted sentence that adds words the page does not have", async () => {
    const dir = await tempDir();
    const file = path.join(dir, "report.md");
    const sentence =
      "Diverging national rules may lead to the fragmentation of the internal market and may decrease legal certainty for operators that develop or use AI systems.";
    await writeFile(
      file,
      `${pageUrl}\n> "${sentence} unless explicitly authorised by this Regulation."\n`,
      "utf8",
    );
    const created = createPlan([
      {
        title: "research",
        content: "cited report",
        format: "markdown",
        location: file,
        kind: "file",
        sources: 1,
      },
    ]);
    const result = await markItem(
      created.plan!,
      { id: "item-1", status: "done", evidence: file },
      extractFor(pageUrl, sentence),
    );
    expect(result.text).toContain("is not in the page text");
    expect(result.plan.items[0].status).toBe("todo");
  });

  it("accepts a quote when the page wraps part of it in a markdown link", async () => {
    const dir = await tempDir();
    const file = path.join(dir, "report.md");
    const sentence =
      "If you are serious about securing your API keys from AI, using a dedicated secrets manager like AWS Secrets Manager is a better practice for runtime retrieval.";
    await writeFile(file, `${pageUrl}\n> ${sentence}\n`, "utf8");
    const page =
      "Intro. If you are serious about securing your API keys from AI, using a dedicated secrets manager [like AWS Secrets Manager](https://docs.aws.amazon.com/secretsmanager/) is a better practice for runtime retrieval. End.";
    const created = createPlan([
      {
        title: "research",
        content: "cited report",
        format: "markdown",
        location: file,
        kind: "file",
        sources: 1,
      },
    ]);
    const result = await markItem(
      created.plan!,
      { id: "item-1", status: "done", evidence: file },
      extractFor(pageUrl, page),
    );
    expect(result.plan.status).toBe("done");
  });

  it("rejects a quote that is not in the page extract", async () => {
    const dir = await tempDir();
    const file = path.join(dir, "report.md");
    await writeFile(file, `${pageUrl}\n> ${pageQuote}\n`, "utf8");
    const created = createPlan([
      {
        title: "research",
        content: "cited report",
        format: "markdown",
        location: file,
        kind: "file",
        sources: 1,
      },
    ]);
    const result = await markItem(
      created.plan!,
      { id: "item-1", status: "done", evidence: file },
      extractFor(pageUrl, "A different article about unrelated deployment steps and configuration."),
    );
    expect(result.text).toContain(`Quote for ${pageUrl} is not in the page text`);
    expect(result.plan.items[0].status).toBe("todo");
  });

  it("rejects a quote under 80 characters", async () => {
    const dir = await tempDir();
    const file = path.join(dir, "report.md");
    await writeFile(file, `${pageUrl}\n> Too short to count as a page sentence.\n`, "utf8");
    const created = createPlan([
      {
        title: "research",
        content: "cited report",
        format: "markdown",
        location: file,
        kind: "file",
        sources: 1,
      },
    ]);
    const result = await markItem(
      created.plan!,
      { id: "item-1", status: "done", evidence: file },
      extractFor(pageUrl, "Too short to count as a page sentence."),
    );
    expect(result.text).toContain("must be at least 60 characters");
    expect(result.plan.items[0].status).toBe("todo");
  });

  it("upgrades sources after a search and still requires citations before done", async () => {
    const dir = await tempDir();
    const file = path.join(dir, "stock_report.txt");
    await writeFile(file, "AAPL 100\n", "utf8");
    const created = createPlan([
      { title: "a", content: "price", format: "text", location: file, kind: "file" },
    ]);
    const result = await markItem(
      created.plan!,
      { id: "item-1", status: "done", evidence: file },
      [],
      true,
    );
    expect(result.plan.items[0].sources).toBe(2);
    expect(result.text).toMatch(/Need 2 sourced quotes|Found 0 blocks/);
    expect(result.plan.items[0].status).toBe("todo");
  });

  it("rejects a researched file that has no two-line source blocks", async () => {
    const dir = await tempDir();
    const file = path.join(dir, "report.md");
    await writeFile(file, `See [${pageUrl}](${pageUrl}) for details.\n`, "utf8");
    const created = createPlan([
      {
        title: "research",
        content: "cited report",
        format: "markdown",
        location: file,
        kind: "file",
        sources: 2,
      },
    ]);
    const result = await markItem(created.plan!, { id: "item-1", status: "done", evidence: file }, []);
    expect(result.text).toContain("Found 0 blocks.");
    expect(result.plan.items[0].status).toBe("todo");
  });

  it("appends copyable lines when the file has no source blocks", async () => {
    const dir = await tempDir();
    const file = path.join(dir, "report.md");
    const sentence =
      "The company reported that revenue grew during the quarter ending September 2026 and raised its full-year guidance.";
    await writeFile(file, "A report without citations.\n", "utf8");
    const created = createPlan([
      {
        title: "research",
        content: "cited report",
        format: "markdown",
        location: file,
        kind: "file",
        sources: 1,
      },
    ]);
    const result = await markItem(
      created.plan!,
      { id: "item-1", status: "done", evidence: file },
      extractFor(pageUrl, sentence),
    );
    expect(result.text).toContain(`Need 1 sourced quotes in ${file}. Found 0 blocks.`);
    expect(result.text).toContain(pageUrl);
    expect(result.text).toContain(`> ${sentence}`);
    expect(result.text).not.toContain("NOW:");
    expect(result.plan.items[0].status).toBe("todo");
  });

  it("tells the model to move source lines out of evidence into the file", async () => {
    const dir = await tempDir();
    const file = path.join(dir, "report.md");
    await writeFile(file, "A report without citations.\n", "utf8");
    const created = createPlan([
      {
        title: "research",
        content: "cited report",
        format: "markdown",
        location: file,
        kind: "file",
        sources: 1,
      },
    ]);
    const result = await markItem(
      created.plan!,
      { id: "item-1", status: "done", evidence: `${pageUrl}\n> ${pageQuote}\n` },
      extractFor(pageUrl, pageQuote),
    );
    expect(result.text).toContain(`Put the source lines in ${file}. evidence is only that path.`);
    expect(result.plan.items[0].status).toBe("todo");
  });

  it("replaces a mismatched quote with a sentence from the page, skipping a name list", async () => {
    const dir = await tempDir();
    const file = path.join(dir, "report.md");
    const sentence =
      "The company reported that revenue grew during the quarter ending September 2026 and raised its full-year guidance.";
    const names =
      "Broadcom Inc., Dynatrace LLC, GitLab B.V., IBM Corporation and LogicMonitor Inc. supply observability tools to large enterprise teams.";
    await writeFile(file, `${pageUrl}\n> ${pageQuote}\n`, "utf8");
    const created = createPlan([
      {
        title: "research",
        content: "cited report",
        format: "markdown",
        location: file,
        kind: "file",
        sources: 1,
      },
    ]);
    const result = await markItem(
      created.plan!,
      { id: "item-1", status: "done", evidence: file },
      extractFor(pageUrl, `${names} ${sentence}`),
    );
    expect(result.text).toContain("Quote for");
    expect(result.text).toContain(`> ${sentence}`);
    expect(result.text).not.toContain("Broadcom");
    expect(result.plan.items[0].status).toBe("todo");
  });
});
