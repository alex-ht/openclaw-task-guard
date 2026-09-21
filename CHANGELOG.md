# Changelog

## 1.1.0

- Require `kind` on each plan item (`file` or `chat`).
- `kind=file` cannot be marked done unless the file at `location` exists, is non-empty, and (for `.json`) parses. Evidence cannot point at a different path.

## 1.0.0

- Add `task_plan` and `task_mark`.
- Inject short English next-action text on `before_prompt_build`.
- Gate early stops with `before_agent_finalize` (`enforcement=gate`).
- Fall back to next-turn injection on `agent_end` when a plan is still open.
