# Changelog

## Unreleased

## 1.3.2

- When `sources=N` (N>=2) and pages are still short (for example Pages 1/2), a further search tool call stays blocked and the `NOW` line pins a single remaining candidate URL from prior search results when one is known.
- Search tool results harvest https candidate URLs into the session extract log; opening a page drops that URL from the candidate list.
- If no candidate URL is left, the reminder tells the model to pick one concrete https URL from prior search results and fetch it (still no second search).
- Healthy paths that already reach Pages 2/2 are unchanged: write stays gated until sources are met, and further fetch/search stay blocked at N/N.

## 1.3.1

- After a search tool runs, open file items with no `sources` are upgraded to `sources=2` automatically. The model can fetch pages without calling `task_plan` again; write and a second search stay blocked until the pages are open.
- Reminder copy says `Sources set to 2` instead of asking for another `task_plan`.
- Add `scripts/reload.sh` for linked local development: test, build, restart gateway.

## 1.3.0

- With `enforcement` `gate`, `before_tool_call` blocks a `write`, `edit`, or `exec` while opened pages are below `sources`, a search after the first one, and a call that passes several `https` URLs. Once the pages are open it blocks another fetch. After a search on an item with no `sources`, it blocks writing and fetching until `task_plan`. `task_mark` is not blocked. The block reason is the same `NOW` line the reminder already uses. `remind` and `off` do not block.
- A quote still matches when the file wraps that sentence in quotation marks.
- A plan item can set `sources`. `task_mark` then requires that many `https` URLs in the file, each followed by a verbatim `>` sentence of at least 60 characters. The sentence must appear in a page extract recorded earlier in the session: one `https` URL in the tool parameters and at least 1500 characters of result text. Search results do not count. `task_plan` clears stored extracts.
- Open-plan reminders show `Pages K/N`. Until that count is full, a search result says the search is not an opened page, not to search again, and not to write the file yet. A fetch with several `https` URLs says that call opened no page. At `N/N` the reminder appends the exact URL and `>` lines to copy into the file, then says to call `task_mark`. The page count includes the fetch whose result is being shown. `sources` must be 0 to 2; research tasks use 2. A quote still matches when the opened page wraps words in a markdown link or encodes newlines as `\n`. A name list, heading, or table row is not offered as the sentence to copy. If a search ran and the item has no `sources`, the search result says to call `task_plan` with `sources` set to 2, and `task_mark` stays todo until then. Quotes pasted into `evidence` stay rejected until they are in the file. When the file has no blocks, `task_mark` repeats the lines to append and says not to speak.
- `task_plan` items must be files named in the current user prompt. A plan or notes file the user did not ask for is rejected. The plan stays in `task_plan`.
- While a plan is open, tell the model not to send text until every item is marked, unless the task cannot be done. `PLAN DONE` says it may speak.
- New plans accept only `kind=file`. `kind=chat` is rejected so an item cannot be delivered as a chat reply.

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
