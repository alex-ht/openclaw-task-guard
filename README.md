# Task Guard

OpenClaw plugin that keeps an agent from ending a turn before the planned outputs exist.

This is **not** a personal todo app. It is a session-scoped deliverable contract: content + format, then stop.

Source: [github.com/alex-ht/openclaw-task-guard](https://github.com/alex-ht/openclaw-task-guard)

## Install

```bash
openclaw plugins install clawhub:@alex-ht/openclaw-task-guard
openclaw plugins enable task-guard
```

Local development:

```bash
npm install
npm test
npm run build
openclaw plugins install --link .
openclaw plugins enable task-guard
```

Conversation hooks need an explicit grant for non-bundled plugins:

```json5
{
  plugins: {
    entries: {
      "task-guard": {
        enabled: true,
        hooks: { allowConversationAccess: true },
        config: {
          enforcement: "gate"
        }
      }
    }
  }
}
```

## Tools

Two tools. No skill file. Small models get the next action from tool results and hook text.

| Tool | When |
| --- | --- |
| `task_plan` | User asked for a concrete output. Call this first. |
| `task_mark` | One item is done or cancelled. `done` needs evidence. |

`task_plan` replaces the current session plan and assigns ids `item-1`, `item-2`, ...

Each item must set `kind`:

| `kind` | `location` | `task_mark` `done` |
| --- | --- | --- |
| `file` | Output file path | File must exist, be non-empty, and `.json` must parse. Evidence must be that path (or a short proof); a different existing file is rejected. |

`kind=chat` is rejected. A new plan cannot deliver an item as a chat reply. A session file saved before this rule can still contain a chat item; `task_mark` for that item still needs a non-empty proof string.

## Hook text (English, copyable)

No plan yet:

```
TASK RULE
If the user asked for a concrete output (file, report, table, JSON, formatted reply):
1. Call task_plan now, before other work.
2. Each item needs content + format + location + kind=file.
3. location is the output path. task_mark done checks that file exists.
4. Last item = the final output file. Do not deliver in chat.
If this is only a question, ignore this rule.
```

Open plan:

```
TASK OPEN. No text until every item is marked, unless the task cannot be done.
TODO:
1. id=item-1 FILE=docs/change.md | content: change summary | format: markdown ## Summary ## Files
NOW: finish item-1, then call task_mark id=item-1 status=done evidence=docs/change.md
```

Early stop (`enforcement=gate`) prepends `STOP. You sent text before the plan was done.` and asks the harness for one more pass.

While the plan is open, the same `TASK OPEN` block stays in system context for the whole turn. Every other tool result also gains a two-line progress reminder:

```
TASK OPEN. 0 done, 1 open. No text until every item is marked, unless the task cannot be done.
NOW: finish item-1, then call task_mark id=item-1 status=done evidence=docs/change.md
```

`task_plan` and `task_mark` already return that status, so their results are left unchanged. Heartbeat and `internal_system` turns get no prompt injection.

## Config

| Key | Default | Meaning |
| --- | --- | --- |
| `enforcement` | `gate` | `off` tools only; `remind` inject only; `gate` also revise |
| `maxReviseAttempts` | `2` | Extra model passes (host may cap at 3) |
| `storagePath` | `~/.openclaw/state/task-guard` | Session JSON |

## Runtime notes

- `before_agent_finalize` is wired on the embedded runner and native hook relay. Copilot does not dispatch it. If finalize never fires, `agent_end` queues the same TASK OPEN text for the next turn.
- `kind=file` items cannot be marked `done` unless the file at `location` exists and is non-empty. `.json` files must parse. Evidence cannot point at a different path.
- Not a replacement for ClawHub `tasks` (calendar-style todos).

## Publish

```bash
npm test
npm run build
clawhub package publish . --family code-plugin --dry-run
clawhub package publish . --family code-plugin
```

Package name `@alex-ht/openclaw-task-guard` must match the ClawHub owner handle.

## License

MIT
