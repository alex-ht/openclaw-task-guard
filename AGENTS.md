# Agent notes — Task Guard

OpenClaw **code plugin** (`id: task-guard`, package `@alex-ht/openclaw-task-guard`).

Session-scoped deliverable contract: if the user asked for a concrete output, the agent must plan content + format, then not stop until those items are marked done. This is not a personal todo app and not a replacement for ClawHub `tasks`.

Write **English only**: source, tests, comments, README, CHANGELOG, tool descriptions, hook text, commit messages.

## Layout

```
src/index.ts          Plugin entry: register tools + hooks
src/render.ts         All user/model-facing strings (one template set)
src/plan.ts           task_plan logic
src/requested-files.ts  Basenames named in the current user prompt
src/mark.ts           task_mark logic
src/format-check.ts   File exists / non-empty / JSON parse / cited quotes
src/extracts.ts       Page extracts from after_tool_call + source-block check
src/pending-params.ts  toolCallId to params, so a fetch counts on its own result
src/block.ts          gate: block the tool that skips the page loop
src/store.ts          ~/.openclaw/state/task-guard/<agent>/<sessionHash>.json
src/hooks-logic.ts    prompt injection, tool-result progress, finalize revise decision
src/session.ts        sessionKey/agentId + next-turn injection
src/config.ts         enforcement / maxReviseAttempts / storagePath
src/types.ts          PlanItem / RunPlan
types/openclaw-plugin-sdk.d.ts   Minimal SDK stubs so tsc works without the host
openclaw.plugin.json  Runtime id, contracts.tools, configSchema
tests/                Vitest, SDK-free
```

Keep hook copy and tool results on the **same** `render.ts` templates. Small models should see one layout: `PLAN READY` / `TASK OPEN` / `ERROR.` / `PLAN DONE`.

## Hard constraints

- **Tools + hooks only.** No `SKILL.md`, no `skills/` in the manifest, no long system prompt.
- **Two tools:** `task_plan`, `task_mark`. Do not add `status` / `update` tools. Remaining work is injected.
- **Short English injection.** Numbered lines, copyable `task_mark id=item-N ...`. `NOW` points at the first todo only. Cap TODO lines at `MAX_TODO_LINES` (8).
- **Ids are assigned by the plugin** (`item-1`, `item-2`). Calling `task_plan` replaces the session plan.
- **`done` needs evidence.** `kind=file`: the file at `location` must exist and be non-empty; `.json` must parse. Evidence cannot point at a different path. A chat item already stored from an older plan still needs a non-empty proof string. Optional `sources` N (0 to 2; research tasks use 2) requires N `https` URL + verbatim `>` quotes of at least 60 characters, each found in a page extract (one URL in params, result at least 1500 characters). A markdown link in the page text still matches the quote, quotation marks around the file sentence are ignored, and a literal `\n` in the page is treated as whitespace. Search tools do not qualify. Reminders show `Pages K/N`. Below N they say to fetch one URL and not to write the file yet (a search result says search is blocked until pages are open, and pins a remaining candidate URL from prior search results when known). A call with several https URLs says it opened no page. At N/N they append the exact URL and `>` lines to copy, then say to call `task_mark`. A name list, heading, or table row is not offered as that sentence. Quotes in `evidence` do not count until they are in the file. If a search ran and `sources` is 0, that search result says to call `task_plan` with sources set to 2, and `task_mark` done stays todo until then. `task_plan` clears extracts and that search flag. `before_tool_call` keeps params by toolCallId so the sync tool-result hook can record that fetch and show the new page count on the same result. A long fetch JSON with one `url` still counts when params were not kept.
- **`kind` is required** on `task_plan` items and must be `file`. `location` must be a real path. `kind=chat` is rejected. Old session JSON without `kind` infers it from `location` on load, including `chat`.
- Manifest `contracts.tools` must stay in sync with `api.registerTool`.
- Published `package.json` `openclaw.extensions` must point at `./dist/index.js`. Do not ship TypeScript as the runtime entry.

## Commands

```bash
npm test          # vitest
npm run build     # tsc → dist/
```

After `src/` changes, rebuild before a linked gateway will see them if the gateway loads `dist/`. Linked installs follow this package; keep `extensions` on `dist/`.

Local install (do **not** pass `--force` with `--link`):

```bash
npm test && npm run build
openclaw plugins install --link .
openclaw plugins enable task-guard
```

`--force` is for archive/npm installs, not linked source.

Non-bundled conversation hooks need:

```json5
{
  plugins: {
    entries: {
      "task-guard": {
        enabled: true,
        hooks: { allowConversationAccess: true },
        config: { enforcement: "gate" } // off | remind | gate
      }
    }
  }
}
```

Inspect: `openclaw plugins inspect task-guard --runtime --json`

## Behavior to preserve

| Surface | Behavior |
| --- | --- |
| No plan, user turn | Inject `TASK RULE` (call `task_plan` if there is a concrete output) |
| `task_plan` items | When this turn's prompt was captured and it names files, every location basename must be one of those names |
| Open plan | Inject `TASK OPEN` + first-item `NOW` on the prompt and again in system context for the whole turn |
| Open plan, later tool result | Prepend `TASK OPEN. N done, M open` plus `Pages K/N` when `sources` is set, and `NOW`. Below N, fetch one URL and do not write the file yet. Several URLs in one call count as no page. At N/N, append the exact URL and `>` lines, then call `task_mark`. A search result says it is not an opened page. With sources omitted, that search says to call `task_plan` with sources set to 2. `task_plan` / `task_mark` results stay as they are |
| `enforcement=gate` + todos | `before_agent_finalize` → `{ action: "revise", retry: { instruction, idempotencyKey, maxAttempts } }`. `before_tool_call` blocks `write` / `edit` / `exec` below `Pages N`, a search after the first, and a call with several https URLs. At `N/N` it blocks another fetch. After a search with `sources` omitted it blocks write and fetch until `task_plan`. `task_mark` is not blocked. The reason is the current `NOW` line |
| `remind` | Inject only, no revise, no tool block |
| `off` | Tools work, hooks silent |
| Heartbeat / `internal_system` | No injection, no tool block |
| Finalize missing (Copilot / some runners) | `agent_end` enqueues the same `TASK OPEN` text |

Do not invent extra item statuses (`in_progress`, `blocked`). Only `todo` / `done` / `cancel`.

## Tests

Logic is SDK-free so tests do not boot OpenClaw. Put new cases next to the module:

- Template text: `tests/render.test.ts`
- Plan validation: `tests/plan.test.ts`
- Named deliverable files: `tests/requested-files.test.ts`
- Mark + file checks: `tests/mark.test.ts`
- Hook decisions: `tests/finalize.test.ts`
- Tool blocks: `tests/block.test.ts`
- Disk store: `tests/store.test.ts`

If you change a template string, update the matching test. Keep injections ≤ 12 lines.

## Release

GitHub source of truth: `https://github.com/alex-ht/openclaw-task-guard`

```bash
npm test && npm run build
clawhub package publish . --family code-plugin --dry-run
clawhub package publish . --family code-plugin
```

`package.json` name `@alex-ht/openclaw-task-guard` must match `clawhub whoami`. Bump version in `package.json`, `openclaw.plugin.json`, and `CHANGELOG.md`. Tag `vX.Y.Z`.

CI: `.github/workflows/test.yml` on push/PR. Tag `v*` can publish via `.github/workflows/package-publish.yml` (needs `CLAWHUB_TOKEN` or OIDC).

New ClawHub releases stay off public install until scan/review finishes.

## Out of scope

- Extra tools, action-enum mega-tools, locale packs
- Cross-session GTD, due dates, multi-agent dispatch
- LLM judging whether format “looks nice”
- Unbounded finalize revise loops (keep `maxReviseAttempts`, default 2)
