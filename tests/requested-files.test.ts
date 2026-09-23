import { describe, expect, it } from "vitest";
import {
  forgetRequestedFiles,
  mentionedBasenames,
  rememberRequestedFiles,
  requestedBasenamesFor,
} from "../src/requested-files.js";

describe("mentionedBasenames", () => {
  it("keeps named deliverables and skips versions and abbreviations", () => {
    const names = mentionedBasenames(
      "Apache 2.0.49. See e.g. the log. Write findings to `client_issues_report.md`. Also read apache_error.log.",
    );
    expect([...names].sort()).toEqual(["apache_error.log", "client_issues_report.md"]);
  });

  it("uses the basename and ignores case", () => {
    const names = mentionedBasenames("Save docs/Change.MD and remediation_plan.md.");
    expect(names.has("change.md")).toBe(true);
    expect(names.has("remediation_plan.md")).toBe(true);
  });
});

describe("requested file memory", () => {
  it("reads the latest prompt for a session when the tool context has no run id", () => {
    const hook = { agentId: "main", sessionKey: "s-files", runId: "run-a" };
    rememberRequestedFiles(hook, "Write client_issues_report.md");
    expect(requestedBasenamesFor({ agentId: "main", sessionKey: "s-files" })).toEqual(
      new Set(["client_issues_report.md"]),
    );
    rememberRequestedFiles(
      { agentId: "main", sessionKey: "s-files", runId: "run-b" },
      "Write other_report.md",
    );
    expect(requestedBasenamesFor({ agentId: "main", sessionKey: "s-files" })).toEqual(
      new Set(["other_report.md"]),
    );
    expect(
      requestedBasenamesFor({ agentId: "main", sessionKey: "s-files", runId: "run-a" }),
    ).toBeUndefined();
  });

  it("skips the check after the prompt is forgotten", () => {
    const ctx = { agentId: "main", sessionKey: "s-forget", runId: "run-c" };
    rememberRequestedFiles(ctx, "Write client_issues_report.md");
    forgetRequestedFiles(ctx);
    expect(requestedBasenamesFor({ agentId: "main", sessionKey: "s-forget" })).toBeUndefined();
  });
});
