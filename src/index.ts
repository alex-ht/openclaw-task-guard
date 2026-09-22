import { Type } from "typebox";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { parsePluginConfig } from "./config.js";
import {
  agentIdOf,
  applyToolProgress,
  finalizeDecision,
  promptInjection,
  promptSystemContext,
  sessionKeyOf,
} from "./hooks-logic.js";
import { markItem } from "./mark.js";
import { createPlan } from "./plan.js";
import { renderPlanOpen } from "./render.js";
import {
  enqueueIncomplete,
  loadSessionPlan,
  resolveSession,
  saveSessionPlan,
} from "./session.js";
import { isActivePlan, loadPlanSync } from "./store.js";
import { textResult } from "./tool-result.js";
import type { ItemStatus, PlanItemInput } from "./types.js";

const itemSchema = Type.Object({
  title: Type.String({ description: "Short name for this output." }),
  content: Type.String({ description: "What to produce." }),
  format: Type.String({ description: "How to deliver it (markdown headings, JSON, file type)." }),
  location: Type.String({ description: "Output file path. Not chat." }),
  kind: Type.Literal("file", {
    description:
      "file only. Write that file before task_mark done. Do not deliver the item as a chat reply.",
  }),
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
        "Call FIRST when the user wants a concrete output (file, report, table, JSON). Do NOT call for a plain question. Each item needs title, content (what), format (how), location (file path), kind=file. The file at location must exist before task_mark done. Do not deliver an item in chat. Last item MUST be the final output file. Replaces any current plan.",
      parameters: Type.Object({
        items: Type.Array(itemSchema, { minItems: 1 }),
      }),
      outputSchema: Type.Object({
        ok: Type.Boolean(),
        planId: Type.Optional(Type.String()),
      }),
      async execute(_id: string, params: { items: PlanItemInput[] }) {
        const session = resolveSession({}, toolContext);
        const result = createPlan(params.items);
        if (!result.plan) {
          return textResult(result.text, { ok: false });
        }
        await saveSessionPlan(config, session, result.plan);
        return textResult(result.text, { ok: true, planId: result.plan.planId });
      },
    }), { name: "task_plan" });

    api.registerTool((toolContext: Record<string, unknown>) => ({
      name: "task_mark",
      description:
        "Mark one plan item done or cancel. Call as soon as that file exists. status=done requires evidence: the planned path. The file must exist, be non-empty, and .json must parse. Do not write this call as chat text.",
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
        const result = await markItem(plan, params);
        await saveSessionPlan(config, session, result.plan);
        return textResult(result.text, {
          ok: !result.text.startsWith("ERROR."),
          planStatus: result.plan.status,
        });
      },
    }), { name: "task_mark" });

    api.on("before_prompt_build", async (event, ctx) => {
      const session = resolveSession(event, ctx);
      const plan = await loadSessionPlan(config, session);
      const text = promptInjection(plan, config, session);
      const system = promptSystemContext(plan, config, session);
      if (!text && !system) {
        return;
      }
      return {
        ...(text ? { prependContext: text } : {}),
        ...(system ? { appendSystemContext: system } : {}),
      };
    });

    api.on("tool_result_persist", (event, ctx) => {
      const session = resolveSession(event, ctx);
      const plan = loadPlanSync(config, agentIdOf(session), sessionKeyOf(session));
      const toolName = typeof event.toolName === "string" ? event.toolName : undefined;
      const message = applyToolProgress(event.message, plan, config, toolName);
      if (!message) {
        return;
      }
      return { message };
    });

    api.on("before_agent_finalize", async (event, ctx) => {
      const session = resolveSession(event, ctx);
      const plan = await loadSessionPlan(config, session);
      const decision = finalizeDecision(plan, config);
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
      enqueueIncomplete(api, session, renderPlanOpen(plan), plan.planId);
    });
  },
});
