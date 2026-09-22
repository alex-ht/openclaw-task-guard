# Changelog

## 1.2.0

- While a plan is open, prepend a two-line progress reminder to every other tool result (`N done, M open` plus the current `task_mark` line). The embedded runner feeds that text back to the model on the next step.
- Repeat the open plan in system context for the whole turn so a long tool loop does not drop Task Guard.

## 1.1.0

- Require `kind` on each plan item (`file` or `chat`).
- `kind=file` cannot be marked done unless the file at `location` exists, is non-empty, and (for `.json`) parses. Evidence cannot point at a different path.

## 1.0.0

- Add `task_plan` and `task_mark`.
- Inject short English next-action text on `before_prompt_build`.
- Gate early stops with `before_agent_finalize` (`enforcement=gate`).
- Fall back to next-turn injection on `agent_end` when a plan is still open.
