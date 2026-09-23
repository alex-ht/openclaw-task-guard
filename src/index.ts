import { Type } from "typebox";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { toolBlockReason } from "./block.js";
import { parsePluginConfig } from "./config.js";
import {
  agentIdOf,
  applyToolProgress,
  finalizeDecision,
  isInternalTurn,
  promptInjection,
  promptSystemContext,
  sessionKeyOf,
} from "./hooks-logic.js";
import {
  clearExtracts,
  loadExtracts,
  loadExtractsSync,
  notePageExtract,
  noteSearch,
  openCall,
  saveExtracts,
  saveExtractsSync,
} from "./extracts.js";
import { markItem } from "./mark.js";
import { rememberToolParams, takeToolParams } from "./pending-params.js";
import { createPlan } from "./plan.js";
import { renderPlanOpen } from "./render.js";
import { forgetRequestedFiles, rememberRequestedFiles, requestedBasenamesFor } from "./requested-files.js";
import {
  enqueueIncomplete,
  loadSessionPlan,
  resolveSession,
  saveSessionPlan,
} from "./session.js";
import { ensureResearchSources, ensureResearchSourcesSync } from "./research-sources.js";
import { isActivePlan, loadPlanSync } from "./store.js";
import { textResult } from "./tool-result.js";
import type { ItemStatus, PlanItemInput } from "./types.js";

const itemSchema = Type.Object({
  title: Type.String({ description: "Short name for this output." }),
  content: Type.String({ description: "What to produce." }),
  format: Type.String({ description: "How to deliver it (markdown headings, JSON, file type)." }),
  location: Type.String({ description: "A file path the user named. Not a plan or notes file." }),
  kind: Type.Literal("file", {
    description:
      "file only. Write that file before task_mark done. Do not deliver the item as a chat reply.",
  }),
  sources: Type.Optional(
    Type.Number({
      minimum: 0,
      maximum: 2,
      description:
        "How many https pages this file must quote. Omit or 0 for other files. For a research task use 2.",
    }),
  ),
});

export default definePluginEntry({
  id: "task-guard",
  name: "Task Guard",
  description:
    "Session task list that keeps agents from stopping before deliverable content and format are done.",
  register(api) {
    const config = parsePluginConfig(api.pluginConfig);

    api.registerTool((toolContext: Record<string, unknown>) => ({
      name: "task_plan",
      description:
        "Call FIRST when the user wants a concrete output (file, report, table, JSON). Do NOT call for a plain question. Each item needs title, content (what), format (how), location (a file path the user named), kind=file. The file at location must exist before task_mark done. Do not deliver an item in chat. Do not add a plan or notes file. The plan is this tool. Replaces any current plan. For researched facts set sources to 2. A search result does not count. Fetch one https page at a time. Do not write the file until Pages shows 2/2. Then append the URL and > lines from the reminder and call task_mark.",
      parameters: Type.Object({
        items: Type.Array(itemSchema, { minItems: 1 }),
      }),
      outputSchema: Type.Object({
        ok: Type.Boolean(),
        planId: Type.Optional(Type.String()),
      }),
      async execute(_id: string, params: { items: PlanItemInput[] }) {
        const session = resolveSession({}, toolContext);
        const requestedBasenames = requestedBasenamesFor(session);
        const result = createPlan(
          params.items,
          requestedBasenames === undefined ? undefined : { requestedBasenames },
        );
        if (!result.plan) {
          return textResult(result.text, { ok: false });
        }
        await saveSessionPlan(config, session, result.plan);
        await clearExtracts(config, agentIdOf(session), sessionKeyOf(session));
        return textResult(result.text, { ok: true, planId: result.plan.planId });
      },
    }), { name: "task_plan" });

    api.registerTool((toolContext: Record<string, unknown>) => ({
      name: "task_mark",
      description:
        "Mark one plan item done or cancel. Call as soon as that file exists. status=done requires evidence: the planned path. The file must exist, be non-empty, and .json must parse. If the item has sources, the file needs that many https URLs, each followed by a > quote of a sentence from that opened page. If a search ran and sources is 0, call task_plan again with sources set to 2. Do not write this call as chat text.",
      parameters: Type.Object({
        id: Type.String({ description: "Plan item id, for example item-1." }),
        status: Type.Union([Type.Literal("done"), Type.Literal("cancel")]),
        evidence: Type.Optional(
          Type.String({ description: "File path or short proof. Required when status=done." }),
        ),
      }),
      outputSchema: Type.Object({
        ok: Type.Boolean(),
        planStatus: Type.Optional(Type.String()),
      }),
      async execute(
        _id: string,
        params: { id: string; status: ItemStatus; evidence?: string },
      ) {
        const session = resolveSession({}, toolContext);
        const plan = await loadSessionPlan(config, session);
        if (!plan) {
          return textResult(
            "ERROR. No plan. If the user asked for a concrete output, call task_plan first.",
            { ok: false },
          );
        }
        const extracts = await loadExtracts(config, agentIdOf(session), sessionKeyOf(session));
        const result = await markItem(plan, params, extracts.extracts, extracts.searched);
        await saveSessionPlan(config, session, result.plan);
        return textResult(result.text, {
          ok: !result.text.startsWith("ERROR."),
          planStatus: result.plan.status,
        });
      },
    }), { name: "task_mark" });

    api.on("before_prompt_build", async (event, ctx) => {
      const session = resolveSession(event, ctx);
      if (config.enforcement === "off") {
        forgetRequestedFiles(session);
      } else if (!isInternalTurn(session)) {
        const prompt = typeof event.prompt === "string" ? event.prompt : "";
        rememberRequestedFiles(session, prompt);
      }
      const plan = await loadSessionPlan(config, session);
      const extracts = await loadExtracts(config, agentIdOf(session), sessionKeyOf(session));
      const opened = extracts.extracts.length;
      const text = promptInjection(plan, config, session, opened, extracts.extracts, extracts.candidates);
      const system = promptSystemContext(plan, config, session, opened, extracts.extracts, extracts.candidates);
      if (!text && !system) {
        return;
      }
      return {
        ...(text ? { prependContext: text } : {}),
        ...(system ? { appendSystemContext: system } : {}),
      };
    });

    api.on("before_tool_call", (event, ctx) => {
      const toolCallId = typeof event.toolCallId === "string" ? event.toolCallId : "";
      if (toolCallId && event.params && typeof event.params === "object") {
        rememberToolParams(toolCallId, event.params);
      }
      const session = resolveSession(event, ctx ?? {});
      if (isInternalTurn(session)) {
        return;
      }
      const agentId = agentIdOf(session);
      const sessionKey = sessionKeyOf(session);
      const log = loadExtractsSync(config, agentId, sessionKey);
      const plan = ensureResearchSourcesSync(
        config,
        agentId,
        sessionKey,
        loadPlanSync(config, agentId, sessionKey),
        log.searched === true,
      );
      const blockReason = toolBlockReason({
        enforcement: config.enforcement,
        plan,
        opened: log.extracts.length,
        searched: log.searched === true,
        extracts: log.extracts,
        candidates: log.candidates,
        toolName: typeof event.toolName === "string" ? event.toolName : "",
        params: event.params,
      });
      if (!blockReason) {
        return;
      }
      return { block: true, blockReason };
    });

    api.on("after_tool_call", async (event, ctx) => {
      if (typeof event.error === "string" && event.error) {
        return;
      }
      const session = resolveSession(event, ctx);
      const toolName = typeof event.toolName === "string" ? event.toolName : "";
      const agentId = agentIdOf(session);
      const sessionKey = sessionKeyOf(session);
      const current = await loadExtracts(config, agentId, sessionKey);
      const next = notePageExtract(toolName, event.params, event.result, noteSearch(toolName, current, event.result));
      if (next !== current) {
        await saveExtracts(config, agentId, sessionKey, next);
      }
      if (next.searched) {
        const plan = await loadSessionPlan(config, session);
        await ensureResearchSources(config, agentId, sessionKey, plan, true);
      }
    });

    api.on("tool_result_persist", (event, ctx) => {
      const session = resolveSession(event, ctx);
      const toolName = typeof event.toolName === "string" ? event.toolName : undefined;
      const agentId = agentIdOf(session);
      const sessionKey = sessionKeyOf(session);
      const current = loadExtractsSync(config, agentId, sessionKey);
      const toolCallId = typeof event.toolCallId === "string" ? event.toolCallId : "";
      const opened = openCall(current, toolName, event.message, toolCallId ? takeToolParams(toolCallId) : undefined);
      if (opened.log !== current) {
        saveExtractsSync(config, agentId, sessionKey, opened.log);
      }
      const plan = ensureResearchSourcesSync(
        config,
        agentId,
        sessionKey,
        loadPlanSync(config, agentId, sessionKey),
        opened.log.searched === true,
      );
      const message = applyToolProgress(
        event.message,
        plan,
        config,
        toolName,
        opened.log.extracts.length,
        opened.log.extracts,
        opened.manyUrls,
        opened.log.candidates,
      );
      if (!message) {
        return;
      }
      return { message };
    });

    api.on("before_agent_finalize", async (event, ctx) => {
      const session = resolveSession(event, ctx);
      const plan = await loadSessionPlan(config, session);
      const pageLog = await loadExtracts(config, agentIdOf(session), sessionKeyOf(session));
      const decision = finalizeDecision(plan, config, pageLog.extracts.length, pageLog.extracts, pageLog.candidates);
      if (decision.action !== "revise") {
        return;
      }
      return {
        action: "revise",
        reason: decision.reason,
        retry: {
          instruction: decision.instruction,
          idempotencyKey: decision.idempotencyKey,
          maxAttempts: decision.maxAttempts,
        },
      };
    });

    api.on("agent_end", async (event, ctx) => {
      const session = resolveSession(event, ctx);
      const plan = await loadSessionPlan(config, session);
      if (!isActivePlan(plan)) {
        return;
      }
      const pageLog = await loadExtracts(config, agentIdOf(session), sessionKeyOf(session));
      enqueueIncomplete(api, session, renderPlanOpen(plan, pageLog.extracts.length, pageLog.extracts, pageLog.candidates), plan.planId);
    });
  },
});
