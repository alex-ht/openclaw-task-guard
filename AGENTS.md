# Agent notes — Task Guard

OpenClaw **code plugin** (`id: task-guard`, package `@alex-ht/openclaw-task-guard`).

Session-scoped deliverable contract: if the user asked for a concrete output, the agent must plan content + format, then not stop until those items are marked done. This is not a personal todo app and not a replacement for ClawHub `tasks`.

Write **English only**: source, tests, comments, README, CHANGELOG, tool descriptions, hook text, commit messages.

## Layout

```
src/index.ts          Plugin entry: register tools + hooks
src/render.ts         All user/model-facing strings (one template set)
src/plan.ts           task_plan logic
src/mark.ts           task_mark logic
src/format-check.ts   File exists / non-empty / JSON parse
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
- **`done` needs evidence.** `kind=chat`: non-empty proof string. `kind=file`: the file at `location` must exist and be non-empty; `.json` must parse. Evidence cannot point at a different path.
- **`kind` is required** on `task_plan` items (`file` or `chat`). `kind` and `location` must agree (`file` → real path, `chat` → `"chat"`). Old session JSON without `kind` infers it from `location` on load.
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
| Open plan | Inject `TASK OPEN` + first-item `NOW` on the prompt and again in system context for the whole turn |
| Open plan, later tool result | Prepend `TASK OPEN. N done, M open` + `NOW` (`task_plan` / `task_mark` results stay as they are) |
| `enforcement=gate` + todos | `before_agent_finalize` → `{ action: "revise", retry: { instruction, idempotencyKey, maxAttempts } }` |
| `remind` | Inject only, no revise |
| `off` | Tools work, hooks silent |
| Heartbeat / `internal_system` | No injection |
| Finalize missing (Copilot / some runners) | `agent_end` enqueues the same `TASK OPEN` text |

Do not invent extra item statuses (`in_progress`, `blocked`). Only `todo` / `done` / `cancel`.

## Tests

Logic is SDK-free so tests do not boot OpenClaw. Put new cases next to the module:

- Template text: `tests/render.test.ts`
- Plan validation: `tests/plan.test.ts`
- Mark + file checks: `tests/mark.test.ts`
- Hook decisions: `tests/finalize.test.ts`
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
