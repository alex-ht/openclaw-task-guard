# Changelog

## 1.0.0

- Add `task_plan` and `task_mark`.
- Inject short English next-action text on `before_prompt_build`.
- Gate early stops with `before_agent_finalize` (`enforcement=gate`).
- Fall back to next-turn injection on `agent_end` when a plan is still open.
