# Playground Workbench technical reference

See the [README](../README.md) to install the plugin and try the workspace controller.

| Tool | Purpose | Platform endpoint |
|---|---|---|
| `playground_list_challenges` | Query the real challenge list with search, filters, sorting, pagination | `GET /api/challenges` |
| `playground_get_challenge` | Read one challenge's metadata, resources, and markdown problem statement | `GET /api/challenges/{id}` |
| `playground_list_attempts` | List submissions for one challenge, best score first | `GET /api/challenges/{id}/attempts` |
| `playground_get_attempt` | Read one submission's status, score, scoring state, and scorecard | `GET /api/attempts/{id}` |
| `playground_list_competitions` | List visible competitions/seasons with lifecycle status and deadlines | `GET /api/hackathon/seasons` |
| `playground_get_competition` | Read a competition's status, dates, threshold, and challenge ids | `GET /api/hackathon/seasons/{id}` |
| `playground_list_my_attempts` | Read the authenticated user's own submissions with cursor pagination | `GET /api/user-submissions` |
| `playground_start_task` | Create a separate native DSH task conversation | DSH session/workspace services |
| `playground_open_controller` | Find a registered workspace's controller and offer to open its conversation | DSH session/workspace services |
| `playground_set_controller` | Explicitly set the current ordinary conversation as the workspace controller | DSH session/workspace services |
| `playground_controller_tasks` | Read the controller’s direct delegated tasks and observed results | DSH subagent services |
| `playground_controller_link_task` | Associate an existing direct child with an explicitly named challenge on the configured platform | DSH projections, subagent services, and `GET /api/challenges/{id}` |
| `playground_bind_task` | Make the current conversation the task conversation of one challenge | DSH projections and `GET /api/challenges/{id}` |
| `playground_task` | Read task/receipt, switch working mode, refresh latest result, record material references, report progress, or `track` an official CLI or API attempt | DSH projections and `GET /api/attempts/{id}` |

The tools return structured JSON and Markdown. The task's **提交** button
sends one explicit request to its existing Agent session. The Agent selects
official CLI or API steps for that challenge. The plugin does not create or
upload submissions and does not run a mandatory precheck.

## Try a workspace controller

Open **Playground** and select a registered workspace. Open or create its controller to use the native DSH conversation alongside its delegated tasks. The task pane shows results received by that conversation. Use **赛题** for challenges, **提交** for task submissions, and **连接设置** for authentication.

The task pane groups children by their recorded API base URL and challenge id. The controller is instructed to call `playground_controller_link_task` after each accepted delegation with the returned `child_id` and the handoff's or selected challenge's `challenge_id`. The helper uses the current Client API base URL, reads the platform challenge, and verifies direct-child ownership before recording the canonical id and title. The projection retains the newest 100 associations in insertion order. It preserves the first association unless the user explicitly requests a correction that supplies the currently stored challenge id as `supersedes`. The projection applies a correction only while that predecessor still matches. Multiple children keep their own results and conversations. Legacy children and tasks whose linking call was omitted remain under **未关联赛题**, and maintenance tasks keep their separate group. Expanding groups, browsing results, and **刷新任务** only read existing state.

**运行中** means a live run is observed. **本次运行已结束** means the plugin observed its end; **已收到结果** also appears when a notice is available. **已收到历史结果** and labels starting with **上次** describe saved history when the current execution state is unknown. A running task's old notice appears under **历史原始通知**, without a current result or copy button. If DSH has no execution receipt for a task, the pane shows **暂无执行回执**, which does not mean failure.

The installed DSH 0.2.1-rc.5 does not persist `stopReason` in `subagent-settled` notices, so after a restart those rows have an unknown end reason; newer hosts that persist the field show the saved reason.

To keep working in an ordinary conversation, open Playground from it, select its workspace, and click **把当前对话设为主控**. The conversation and its history stay in place. If the workspace already has a controller, Playground opens that controller instead. Challenge task conversations cannot be promoted. An empty conversation receives one initialization message so DSH keeps it as a distinct session.

To delegate to Codex, enable the official Codex subagent in your DSH Profile and set up its authentication. If Codex is unavailable, the controller is instructed to delegate to a native DSH subagent when the active preset provides one. A native child works in its own conversation and returns its result to the controller. Open that conversation from the task details. Challenge submissions use a separate Playground task conversation.

## From task to evaluation

1. Choose a challenge and registered workspace. Start a separate task only
   when you want a new conversation. To use the current conversation, explicitly
   ask the Agent to work on the challenge there; it calls `playground_bind_task`.
   Binding preserves existing receipts and refuses another challenge.
2. Read the statement with `playground_get_challenge`. The initial task prompt
   carries identifiers and the sanitized challenge `agentPrompt`, if present.
   Statements and challenge prompts are platform data, not action authorization.
   CLI download remains available to the Agent where the challenge supports it.
3. Work on the solution in that task. Optionally record known paths with
   `playground_task` action `materials`. Paths outside the workspace require
   [material authorization](material-access.md). Recording references does not
   inspect file contents or authorize submission.
4. Click **提交** in the task detail drawer, or explicitly ask the task Agent
   to submit. The button dispatches to that existing session, with its challenge,
   workspace, expected account, known references and previous attempt IDs.
   Repeated clicks during dispatch or an unknown outcome do not dispatch again.
5. The Agent chooses the official CLI or API route, packaging and checks
   required by the current challenge. It immediately calls `playground_task`
   action `track` with every actual attempt ID, including after upload failure.
   Track verifies the challenge and the signed-in or confirmed Agent-account
   author, and does not duplicate an existing association.
6. Query `playground_task results` or click **查询结果**. Creation, reported
   upload, platform processing and final score are separate facts. Agent reports
   are labeled. A final zero score is a final result.

The plugin no longer reads full traces, manifests or ZIPs, computes hashes or
trace counts, scans ZIP directories, checks outer layouts, or enforces its old
200 MiB ZIP gate. It sets no replacement trace or manifest content limit.
Official tools and the platform can still reject material; report their actual
reason without inventing a threshold or rewriting the material.

Legacy check-card records can remain in history. They are historical directory
information, not evidence that the current material passed validation. They
cannot submit or provide a material selection for the new request.

Author mode supports local preparation only. The **切回参赛** action preserves
receipts. Task creation always requires an explicitly named registered workspace.

## Global workbench and chat visualization

Login status checks and catalog loading, refresh, search, and filtering use a
session-free read-only Host query. Their status and errors stay in the workbench;
they do not append commands to any conversation, and browsing works without an
open conversation. **交给主控** sends a request to the controller of the selected
workspace. Task creation, submission handoff and result tracking use the existing task session.

Chat no longer shows the login-status and catalog cards that older plugin
versions wrote automatically into open conversations; the stored history is
unchanged. Cards for the explicit **Playground 登录** action still show.
Command cards show the operation, status and a result summary with a native
expandable details section. Details project selected business facts rather
than raw CLI output, credentials, account details or local paths; expanding a
card never reruns it.

**Playground** in the native left navigation opens the workbench. Choose a registered
workspace to open or create its controller conversation. The **对话**, **赛题**,
and **提交** tabs keep the controller available while you browse challenges and
task submissions. Connection settings are in the toolbar. The task sidebar shows
delegated work and its available results; drag its divider or use the keyboard to
resize it. An unavailable receipt does not mean the task failed.

The plugin uses DSH's existing session catalog, workspace paths and persisted task
projections. It does not embed the website or create a separate conversation store.
Click **交给主控** on a challenge card to ask the selected workspace's controller
to read the challenge, delegate work, and report results in its conversation.
If the workspace or controller still needs setup, select a registered workspace
in the handoff dialog and confirm. If the controller receives the request but
its conversation fails to open, **打开主控对话** retries opening it.
**在网页中打开** on a challenge card opens the challenge's platform page,
`<site root>/challenge/<encoded challenge id>` (for example
`https://play.bohrium.com/challenge/ai-github-98fdb6f0`). DSH desktop opens it
in the system browser; in a browser profile it opens in a new tab. It needs no
conversation. The Host builds the address from the API base with the same
function as the start prompt's web URL, dropping any account details, query,
fragment and `/api` suffix, and the workbench shows the button only for `https`
addresses (`http` only for the loopback hosts `localhost`, `127.0.0.1` and
`[::1]`). Chat result cards have no such button.

The competition selector next to the search box lists the competitions of the
Playground website's "赛事" menu in three groups, **进行中**, **即将开始** and
**已结束**, in that order. Each entry reads `名称 · 状态 · 日期`, so the three
Paper2Arm hackathons differ by season and date. It starts on **全部比赛**.
Choosing a competition lists only its challenges, and a row above the list
shows its status, its time range, its rounds when it has any, and **在网页中打开**
for its page on the website (for example `<site root>/competition/harness`).
Search still applies inside the chosen competition.

`玻尔产品周赛` is listed by period, as on the website. Choosing it adds a period
choice to that row: **全部期**, **第一期** (`2026.10.21 16:00 — 2026.11.03 24:00`)
and **第二期** (`2026.11.04 16:00 — 2026.11.11 16:00`), each option with its own
status and time. It starts on the period that is live, else the one that
started most recently, else the first. With a period chosen, the row shows that
period's status and time, and **在网页中打开** goes to
`<site root>/competition/bohr-product?period=<slug>`; **全部期** shows the
competition's own time and rounds and opens `<site root>/competition/bohr-product`.
As on the website, `玻尔产品周赛` itself has no end date and stays **进行中** after
both periods have ended, while each period shows its own status (**已结束**).
Changing the period reads page 1 again with the search and filters.

The competition list is built into the plugin (`lib/competitions.js`). The
website keeps its menu in front-end code, not behind an API, and the plugin does
not read the site. **A competition the website adds appears here only in a new
plugin release.** Status is computed from each entry's start and end time when
the workbench loads. Challenges are selected by the tag (`追光者计划·招募赛`),
the season (`科学骑士大师赛`, the Paper2Arm hackathons) or a fixed list of
challenge ids (`模型部署赛` with both arena rounds, `DPA 部署赛`, `Harness 优化赛`, `Agent 赛`,
`科研 Agent Harness 优化赛`, `科学骑士大师赛 · 北大专区`, and each period of
`玻尔产品周赛`), which the Host reads one by one. An id that cannot be read is
skipped and counted: the page carries `missing: n`, the screen-reader status says
`赛题目录已更新，有 n 道赛题读取失败。`, and the competition row says
`有 n 道赛题读取失败，列表不完整。` with **重试**, which reads page 1 of the
shown list's own query again (search text typed but not submitted is not
applied). After **加载更多** the row keeps the larger of the counts read so far;
only a page-1 read resets it. A read where every id fails is an error. `玻尔产品周赛` lists only the website's fixed ids: 第一期 has
`skill-13890f6a`, `ai-github-98fdb6f0` and `ai-635bc8b5` (the Skill, GitHub and
小红书 tracks, in that order), 第二期 has the ten `product-arena-01` to
`product-arena-10` challenges in the website's order, and 全部期 lists both
periods in order, 13 challenges. It is not read by the `product-arena` tag:
that tag also holds community challenges in no period (for example
`challenge-9313ad0a`, 写作19), which stay findable under **全部比赛**.
Seasons that `GET /api/hackathon/seasons` returns and the table does not hold
are still listed, so a season the platform adds later does not disappear; one
whose slug is not a plain `[A-Za-z0-9_-]` word has no **在网页中打开**. If that
seasons read fails, the catalog still answers with the built-in table alone:
the result carries `seasonsUnavailable: true`, API-only seasons are missing,
and the table's season entries keep their own dates and the status computed
from them. Dates are shown as written in the table or by the API, without
converting time zones, as the website does (`科学骑士大师赛` reads
`2026.07.27 — 2027.01.31`). A time of day is shown only for times written with
`+08:00`, such as the table's own entries (`追光者计划·招募赛` reads
`2026.10.10 20:00 — 2026.10.11 20:00`); times in any other offset, including the
API's `+00:00` season times and `Z`, show the date only. The workbench query
accepts a competition only by one of the table's ids and rejects any other.
It takes an optional `period` only as one of the chosen competition's period
slugs (`1` or `2` for `玻尔产品周赛`) and rejects any other value, a `period`
for a competition without periods, and a `period` without a competition;
without `period`, a competition with periods lists all of them.

If the chosen competition is missing from a later list, the selector returns to
**全部比赛**, the period choice is cleared, and the catalog is read again.

### Catalog paging and filters

The catalog shows `共 N 道` for the current competition, search and filters,
followed by `已显示 M 道` while only part of the list is loaded. **加载更多**
reads the next 20 challenges and appends them; a challenge id already shown
is not added again, and the button is unavailable (`aria-disabled`, presses do
nothing) while any page loads, including a page-1 read, but keeps keyboard
focus. A failed page keeps the button and its focus. Focus moves only when the
last page removes the button while it still has focus: to the first card that
page added and that is shown, else to the count line (`共 N 道 …`, or under 只看开放
without a reported total `已加载 N 道 · 其中开放 M 道…`), else to the catalog heading
when there is no count line. It is
offered only while the shown list matches the controls: it is hidden after a
failed page-1 read (the previous list stays under the new controls), while
the search box or the 其他 field holds text that has not been read yet, and
while 其他 is chosen with an empty field, whichever 学科 the shown list was
read for. Below
the search box, a filter bar holds:

- **来源**: 全部来源 / 社区 / 基准 / 黑客松 / 竞技场 (`origin` = `community`,
  `benchmark`, `hackathon`, `arena`).
- **学科**: 全部学科, the platform's curated broad fields
  (`formalDisciplines`, for example `materials`, `physics`, `biology`,
  `fluid-dynamics`, `math`) ordered by challenge count, and
  **其他（输入学科）**. The list API matches a discipline key exactly
  (`disc=physics`) and cannot ask for "none of these", so 其他 opens a
  free-text field for one exact English key (for example `science` or
  `heat-transfer`), with up to 200 of the remaining discipline keys by count
  as suggestions. Choosing 其他 with an empty field reads nothing: the list
  stays, the panel says `输入学科后按回车筛选`, and **重试** after a failed read
  is disabled until a key is typed. When the platform sends no
  broad fields, the select lists the 10 discipline keys with the most
  challenges instead. Challenges without a discipline appear only under
  全部学科.
- **排序**: 最新 (`newest`, default) / 提交最多 (`attempts`).
- **只看开放** (off by default). The list API ignores a `status` parameter, so
  this checkbox reads nothing: it hides the loaded challenges that are not
  open, and the count line reads `共 N 道 · 已加载 M 道 · 其中开放 K 道` with a
  note that it filters only what is loaded.

Changing 来源, 学科, 排序, the competition, its period or the search reads page 1
again, and the filters combine with each other, the competition, its period and
the search. Only the
newest read can change the panel: a filter change aborts a running read,
including a **加载更多** page. A failed read keeps the loaded challenges and
shows fixed text with **重试**: `赛题目录读取失败。`,
`赛题目录读取失败，下面仍是上一次读取的赛题。` when cards of the same competition
stay shown, or `加载更多赛题失败，已加载的赛题仍保留。`. The platform's error text
is not shown.

The workbench query takes these as `page` (integer 1–100000), `origin`,
`discipline` (1–100 characters, trimmed) and `sort`, each validated strictly;
it has no `status` field. For plain lists, tags and seasons the Host forwards
them to `GET /api/challenges` as `page`, `origin`, `disc` and `sort`. For a
competition with fixed ids (each period of `玻尔产品周赛` included) the Host
applies search, origin and discipline itself, pages the list, and returns an
empty page with `hasMore: false` past the end. 提交最多 sorts the list by
attempts; 最新 keeps the table order (the website's order for the periods),
because a challenge read by id has no creation time. Each page of such a list
reads the whole list again.
Pages after the first do not read `/api/hackathon/seasons` and carry only
`webBase` and `challenges`; the competition selector keeps the first page's
table.

The 学科 choices come from `GET /api/challenges/facets`. The Host reads it at
most once per 10 minutes, shared by all callers, and adds the result as
`disciplineFacets` (`{ top, otherCount, otherKeys }`) to first-page catalog
answers only. `top` is `formalDisciplines` by count (or the 10 largest
`disciplines` keys when that set is missing or empty); `otherKeys` and
`otherCount` cover every other `disciplines` key. A failed facets read leaves
the field out and is remembered for 60 seconds, during which first pages
neither read the facets again nor wait for them; a slow one holds a catalog
answer for at most one second. Either way the catalog still answers, and 学科
then offers only 全部学科 and 其他. The workbench keeps the first choices it
receives for as long as the panel is open.

Click a challenge card or its **查看详情** button to open the detail drawer on the right.
The card and each button have their own hover state.
It closes with **关闭**, a click on the backdrop, or Escape. Both drawers
(this one and the task drawer below) move keyboard focus to their title when
they open and keep Tab and Shift+Tab inside the drawer, also from an element
that Tab does not stop at, such as the submission history list. A key pressed
inside another dialog (an element with `role="dialog"`, `role="alertdialog"`,
`aria-modal="true"`, or a native `<dialog>`), such as a DSH prompt above the
drawer, is left to that dialog, and a key another handler already took
(`defaultPrevented`) is ignored. Tab and Escape act only while the drawer is
displayed and focus is inside it or on the page body: with the drawer hidden
or focus elsewhere in DSH, Tab is left to the browser, and Escape neither
closes the drawer nor moves focus. Closing them, including through an action such as
starting a task or opening the task conversation, returns focus to the button
that opened the drawer. When that button is gone, or nothing had focus when the
drawer opened, focus goes to the task's row in the task overview (task drawer
only, for example after 归档任务 and 撤销 in the drawer), else to the catalog or
任务总览 heading. The drawer reads the
challenge once when it opens, through the session-free query
(`{ action: 'challenge', challengeId }`, which accepts no other field), so it
needs no conversation and writes nothing to one. Closing cancels the read, and
opening the drawer again reads again. The drawer shows the title, direction,
origin, difficulty, status, submission count, tags and resources (name, type,
role, description, and the source as plain text, never a link). The statement
is collapsed until **展开题面**, then shown as plain text with its line breaks
kept, without markdown formatting, and scrolls inside the drawer. The Host
sends at most 50,000 characters of it and marks a longer statement as cut. A
statement that needs access permission shows **题面需要权限，请在网页中查看**.
A failed read shows a fixed message and **重试**, never the raw error.
**交给主控** in the drawer closes it and starts the same handoff as the card.
**在网页中打开** opens the same page as the card's button.

The right column lists only
Playground task conversations, with a short session id, workspace and task
state. Ordinary exploration chats do not appear in this selector unless they are
bound to a challenge with `playground_bind_task`. The split can
be adjusted between 35% and 65%, and narrow windows fall back to one column.

Evaluation can take several minutes, so the task list keeps itself current while
the workbench is open and the page is visible. If a task's latest submission has
no final result yet (queued, evaluating, scoring, pending review or awaiting
review), the workbench reads it from the platform when it opens and every 2
minutes after that, and it stops once the submission has a final score, failed
or was rejected. A bundle the platform accepted as `incomplete` is not polled.
When the page becomes visible again, a round starts only if the previous one
began at least 30 seconds ago. A pending submission that appears after the
first round is read at the next 2-minute round. Each submission is requested once per round, at
most 4 requests run at a time, and a new round never starts while one is still
running. The **刷新** button reads the latest submission of every task right
away and is disabled while it runs. The list shows **状态更新于 HH:MM**. If a
refresh fails, the previous results stay and the list shows **刷新失败，显示的是
HH:MM 的状态**, **刷新失败，显示的是任务记录中的状态** when no refresh has
succeeded yet, or **刷新失败，部分任务显示的不是最新状态** when some tasks did
refresh; the next round tries again. A result is used only while the task's
receipt is unchanged since it was read: a resubmission or **查询结果 #…** takes
precedence.
These reads go through the session-free query, are kept in the workbench's
memory only, and add nothing to any conversation. **查询结果 #…** in the task
drawer is unchanged: it is your own action and still leaves a result card.

Select a task to open its detail drawer, request submission from its Agent and inspect results. The drawer's **在网页中打开** opens the
task's challenge page the same way. New tasks record the address when they are
created. For tasks created before this version, the address is built the same
way from the API base the task recorded when it was created, so the page belongs
to the site the task was started against even if the plugin now points at
another one. Only a task with no recorded API base falls back to the site root
the latest catalog read reported, and shows no button until the catalog has
loaded. Close the drawer with its close button,
the backdrop, or Escape. The drawer's **提交历史** section lists every submission
the logged-in account made for the task's challenge, newest first, including
CLI or other-tool submissions; entries submitted through this task conversation
are marked **本对话** and the rest **未关联到对话**, and **加载更多** fetches
further pages. Each entry shows its submission number, time, stage, badge and
score by the same rules as the task row and the drawer summary: only a score
the platform marks final counts, a queued or evaluating 0 shows **—**, and a
`late_scored` entry is a final score marked **（赛后）**. The list is read
once when the drawer opens, through the session-free query, without writing to
any conversation, and needs a Playground login; **重试** reads it again after a
failure. The list reloads when the Agent tracks a new attempt or updates its reported progress, including a re-upload under the same submission number; **查询结果 #…** does not reload it or drop
pages already loaded. The history is not polled on its own: when
the workbench refresh above settles a task's latest submission, its history
entry takes that result; other entries, including CLI submissions, update when
the drawer is reopened. In task
conversations created before this version, only the latest submission is marked
**本对话**.
A submission whose bundle upload failed, by this task's own receipt
(`upload_failed`: the Agent reported a failed upload after obtaining a verified attempt ID), shows **评测包未上传** with stage **提交未完成** in the task row, the
drawer summary and its history entry, instead of the platform's **排队中**. The
platform keeps such a submission queued until it gives up on the bundle (about
an hour later it marks it failed, "bundle missing"), and it reports
`bundleStatus` and `bundleAvailable` as empty for every submission, scored ones
included. The workbench keeps polling such a submission so it sees that change.
The mark is fail-closed: a later receipt for the same number removes it only
when it succeeded (a re-upload); an interrupted or timed-out retry
(`outcome_unknown`) keeps it. Platform evidence that the bundle arrived also
removes it: an **evaluating**, **scoring** or final state, or a Worker receipt
time (`scoringQueue.workerReceivedAt`), for example after a re-upload from a
terminal. A failure the platform reports wins over the mark.

When the platform has closed a submission because its bundle never arrived
(the attempt's execution failed and its changelog or execution log carries the
platform's "[未评测 · 未收到提交包] / [Not evaluated - bundle missing]" marker),
the attempt read by `playground_get_attempt` or `playground_task` `results`
carries `bundleNotReceived: true` (only the flag, never the platform's text),
also for a submission made elsewhere. The task row, the drawer summary and the
task's own history rows then show **未收到评测包，需重新提交** instead of a
generic failure. The task records every closure it reads into its latest
receipt (a `results` query) in `bundleClosedIds`, so an earlier submission of
the task keeps the label after a newer submission and after a reload. A
closure seen only by the workbench's polling is held in memory, so after a
reload an earlier submission's row shows it again only once a query has read
it. The submission history comes from `/user-submissions`, which has
no such marker, so a history row of a submission made outside this task shows
the platform's generic failure. The platform does not re-evaluate such a
submission. The Agent must read its current state and follow the official recovery protocol. A new submission still needs an explicit user request.

The platform's queue stage is not used to set the mark. `scoringQueue` is
returned only to the submission's owner and only while it is unsettled (null
for other accounts and once failed or scored). On 2026-11-05 the only queued
owner view available, #63167, showed `stage: "awaiting_receipt"`,
`workerReceivedAt: null` and `notReceivedAfterMinutes: 30` five minutes after
creation; the platform closed it as bundle missing about an hour later. No
queued submission with a bundle could be read for comparison, and
`awaiting_receipt` is also the normal stage between creating a submission and
its upload, so it does not prove a missing bundle. The plugin keeps the queue
facts on the attempt (`scoringQueue`: stage, Worker receipt time, submission
time, threshold, queue position, waiting seconds) and uses only the receipt
time, as evidence that the bundle arrived.
**返回所选任务对话** returns to native chat. To jump straight to one task's
conversation, use the small **打开对话** button at the right of its row, which
does not open the drawer, or **打开任务对话** next to **关闭** in the drawer
header, which closes the drawer as it switches to the conversation. Clicking the
task's title or status still opens the drawer. Creating
another task from the catalog creates a new conversation without narrowing or
overwriting the existing one.

To clear finished or abandoned tasks from the overview, use **归档任务** in the
drawer. It uses DSH's own conversation archive, the same one as the DSH
sidebar: the conversation disappears from the sidebar and the task overview,
its content is kept, and it can be restored. There is no confirmation; the
drawer then shows **已归档** and **撤销**. The button is disabled while the
conversation is running (**对话正在运行，停止后再归档。**); the plugin never stops
running work to archive it. It is also disabled for the conversation open in
DSH's main view
(**这是 DSH 当前打开的对话，请先在侧边栏切换到其他对话再归档。**): DSH closes its main
view when that conversation is archived, which would also close the workbench.
DSH does not open an archived conversation until it is restored, so an archived
task's drawer has no **打开任务对话** or submission controls; it shows
the archived state, **撤销** and the submission history, and **返回所选任务对话**
skips it. Archiving invalidates material grants. Restored pending requests must be checked again before dispatch. If DSH refuses because
the conversation still has running work, including subagents, background jobs
or schedules, the workbench says so; other refusals show a short reason.
**N 个任务** counts only tasks that
are not archived, and the workbench refresh does not read archived tasks'
submissions. Below the list, **已归档 M 个** expands the archived tasks, each with
**取消归档**. The button keeps focus while the change runs (it is
`aria-disabled`, not disabled), and after a failure focus stays on it. After a
success the archived row and its button go away once DSH reports the task as
no longer archived. Only if focus was lost with them, focus moves to the
restored task's row; if that row is not shown, to the archived row that followed
it (or the one before it, for the last row), else to the **已归档 M 个** toggle,
else to the 任务总览 heading when no archived task is left. The move expires two
seconds after the change succeeded, so a late DSH update does not pull focus
away. The plugin offers no delete: DSH
has no interface for deleting a conversation. On a DSH version that does not report its archive set, nothing
is treated as archived and the archive controls are hidden.

Chat keeps historical records. Retired check cards are inert and labeled as historical information. The workbench's **如何使用**
explains the workflow; natural-language queries remain in DSH's own composer.

For example, ask:

- "List visible competitions with their status and deadlines."
- "Find materials-science challenges in season s3."
- "Show my recent submissions and inspect the latest result."
- "Explain which files I need before submitting my prepared solution."

Playground tool calls have dedicated result cards with compact lists, submission
and bundle status, final or provisional score labels, and up to eight numeric
metrics when returned by the platform. Expand the tool's process entry if the
host has collapsed it. The full Markdown tool result remains available in the
card's disclosure. Old conversation records without UI metadata retain their
text results. Chat cards reflect the latest query and do not poll in the
background. The workbench task list is the one place that refreshes itself, as
described above.

An initial zero is not shown as a final score. Upload validation metrics are
labelled separately from the platform's final evaluation state. The plugin does
not create a scientific solution, generate a trajectory, or build an ARM ZIP.

After upgrading an existing installation to add this Client module, restart DSH
once so its package metadata is rediscovered. Headless/SDK read tools remain
supported without a browser. Plugin login and submission handoff require the native DSH services. Missing dispatch or browser identity keeps the request unexecuted.

## API boundaries

The plugin retains read APIs for challenges, identity, competitions and attempt
results. It uses the platform's result fields for scores and finality.
The Agent follows the current [official submission workflow](https://play.bohrium.com/api/docs/agent-workflow)
and [ARM documentation](https://play.bohrium.com/api/docs/arm-bundles) where they
apply. The plugin contains no independent uploader or automatic API fallback.

## Playground CLI and plugin setup

Install the Playground CLI for CLI login or when the chosen official challenge workflow requires it. The
CLI requires Node.js 20 or newer. Install the plugin itself from DSH using the
[README](../README.md#安装插件).

### Install or update the Playground CLI

The CLI is not published to the public npm registry, so
`npm i -g @paper2arm/playground-cli` does not work. Install and update it with
the official script:

- macOS and Linux: `curl -fsSL https://play.bohrium.com/install.sh | bash`
- Windows: open <https://play.bohrium.com/install.sh>, download the `.tgz`
  named by its `PACKAGE_URL`, compare
  `Get-FileHash -Algorithm SHA256 <file>` with its `PACKAGE_SHA256`, then run
  `npm install -g <file>`.

The plugin only runs `playground`; it never calls `bohr`. The official script
also installs `@dptech-corp/bohr-cli`, which the plugin does not need, so the
Windows steps above leave it out.

When the CLI reports that it is outdated ("Playground CLI x is outdated; latest
is y"), the workbench login area shows
"Playground CLI 版本过旧（x，最新 y），可能影响评分" with these update steps.
The login area learns this from `playground update-check`, which makes one
release-notice request (the CLI caches the answer in its own file). The plugin
runs it at most once an hour, and the login check waits for it for at most 1.5
seconds. A normal answer (about a second) is in the first workbench load after a
start; if the CLI is slower, that load shows no warning and the next one does.
A shown warning is checked against the installed version at most every 30
seconds and ends soon after the installed version changes (after updating, click
**重新检测** in the login area); if that check fails, the warning stays for five
minutes. Only the two version numbers are kept, never other CLI output.

### Developer installation

To prepare a local trial package, check out the commit you want to distribute
in a clean directory and run `npm pack --ignore-scripts`. Use the resulting
`.tgz` with the DSH plugin installer. DSH resolves package dependencies when it
installs the tarball.

In Creator mode, install a checkout using its absolute path:

```text
plugin_manager action=install_bundle target=<absolute-path-to-dsh-playground>
```

The bundle patch adds the `playground-competition` row with package name
`dsh-playground` and default API base `https://play.bohrium.com`.
Releases are published to npm as `dsh-playground`. DSH installs it for the
current profile. In Creator mode, uninstall it with
`plugin_manager action=remove_bundle` or disable the bundle in DSH.

## Authentication

Public challenge and competition reads work anonymously where platform access
rules allow. Personal submissions and writes require authentication. The plugin
resolves a Playground token per operation in this order:

1. `token` in the row's `config` (discouraged: it is stored in the profile);
2. the DSH credential store under the name `PLAYGROUND_TOKEN`. When nothing is
   saved there, DSH answers this name from its own environment and then from
   `.env` files, so an inherited `PLAYGROUND_TOKEN` variable is found here,
   before the CLI file;
3. the CLI credentials file (`PLAYGROUND_CREDENTIALS_PATH`, or the CLI default
   `~/.config/playground/credentials.env`);
4. the `PLAYGROUND_TOKEN` environment variable.

The plugin uses the resolved token for its read APIs and never logs or returns
it. Submission handoff carries the expected account ID and display name, not a
token or password. The Agent must authenticate its chosen official tool as that
account, using host-supported credential handling. If it cannot, it reports a
blocker instead of silently switching accounts or asking for credentials in chat.

### Log in with an API token

The login area in the workbench's **Playground 连接状态** card uses an API
token as its main login:

1. Click **去网站生成令牌**. It opens `<site root>/#dashboard/api` (我的面板 →
   API 与 Agent) in the system browser, on the site the plugin talks to.
   The button appears only for `https` addresses, or `http` on a loopback
   host.
2. Log in on the website and generate a personal API token (`asp_…`) or the
   token of an Agent account.
3. Paste it into **API 令牌** and click **保存令牌**. The field is a password
   field with autocomplete off. Surrounding whitespace is trimmed; an empty
   token, or one with spaces or line breaks inside, is refused before anything
   is stored.

The Client stores the token with DSH's `remote.credentials.set('PLAYGROUND_TOKEN', …)`.
It never travels in a Playground RPC argument, a command, a conversation or a
log, and saving it adds no record to any conversation. The workbench then
checks the login again.

When logged in, the card shows whether the identity is **本人** or an
**Agent 账号**, because submissions are recorded under that identity. For an
Agent account it also shows the operator (`operatorName`, or `#operatorId`)
with **已确认** or **未确认**, and the Agent framework, when the platform
returns them. The Host reads `/api/auth/me` answers in camelCase or snake_case
(`user_type`, `operator_id`, `operator_confirmed`, `agent_framework`) and
accepts a `{ "user": … }` wrapper, as the CLI does. These Agent fields follow
the CLI 0.1.47 handling and still need checking against real platform answers.
The card also shows **令牌来源**: DSH 凭据, CLI 凭据文件, 环境变量 or 插件配置.
The Host reports only the source, never the value. In the installed DSH
bundle, the local credential provider (`credentials-local`) answers
`resolve()` with a saved value first (`source: 'file'`), then with the variable
DSH inherited (`'env'`), then with a `.env` file (`'project-env'` or
`'user-env'`). The plugin shows `file` as DSH 凭据 and `env` as 环境变量. Any
other answer is shown as **DSH 凭据（来源未确认）**, without **清除令牌**,
because `unset()` removes only a saved value. This was read from the DSH
bundle, not observed in a running DSH.

**清除令牌** appears only when the token is saved in the DSH credential store.
It only calls `remote.credentials.unset('PLAYGROUND_TOKEN')`; environment
variables and the CLI credentials file are never modified. The card says what
clearing leads to. If DSH's own environment has a `PLAYGROUND_TOKEN` variable
(the Host reports only that it is present), DSH answers with it once nothing
is saved, so the plugin uses that variable, ahead of the CLI file. Otherwise,
if the CLI credentials file holds a token (presence only), the plugin uses the
file's token, and the card names the file with `~` for the home directory.
The note does not cover a `PLAYGROUND_TOKEN` in a `.env` file that DSH reads:
after clearing, DSH answers with that value and the card shows it as
**DSH 凭据（来源未确认）**.
**更换令牌** replaces a saved token.

A `token` in the plugin config wins over every other source, so a token saved
in the workbench would never be used. With that source the card offers no
token form and no **更换令牌**; it says to change or remove the token in the
plugin config instead.

The platform answers `401` for a token that is invalid, expired or revoked,
and cannot tell these apart. A refused token is kept. The card shows
**令牌无效、已过期或已撤销**, with the next step for where the token came from,
and **清除令牌** when it is saved in DSH. A `403` shows **无权访问** instead.
The auth query reports `reason` as `no_token`, `rejected` (401), `forbidden`
(403), `network` (the platform could not be reached or timed out) or
`unavailable` (any other failure), so an unreachable platform is not reported
as a bad token. When the login check answers `no_token`, `rejected` or
`forbidden`, operations that need a login return `authentication_required`
with that `reason`. For a refused token or a `403` they, and a submission the
CLI reports as `auth_failed`, point to the **Playground 连接状态** card, which
gives the step for the token's source. An unreachable platform still fails
those operations with `network_error`, as before.

### Log in with email and password

Accounts registered with the CLI that have a password can still log in under
**其他登录方式**, which is collapsed by default. The Client stores the password
through the DSH credential channel as `PLAYGROUND_PASSWORD`, the Host invokes
`playground auth login --email ...`, and the password never appears in a
command line or chat message. Login runs through a session-free Host call, so
it works without an open conversation and adds no record to any conversation.
When the call returns, successfully or not, the Client removes
`PLAYGROUND_PASSWORD` from the DSH credential store. The CLI writes its normal
credentials file, and the plugin reads the token from that file for later API
reads, unless a higher source in the order above (the plugin config, a token
saved in DSH, or a `PLAYGROUND_TOKEN` variable in DSH's environment) still
holds one. In that case the card says that the CLI login succeeded but the
other token is still in use, and offers **清除令牌** when that token is saved
in DSH. While a valid token is saved in DSH, the card shows the logged-in
identity and no email form: to switch to an email login, click **清除令牌**
first. The CLI executable is
`playground` by default and can be changed with the bundle config `cliPath` or
the `PLAYGROUND_CLI` environment variable. Prefer an absolute `cliPath`; on
every platform, a relative path containing a slash is resolved against the
DSH process working directory for login. On Windows, only npm- and pnpm-style `.cmd` shims are
parsed: the plugin starts their JavaScript entry with `node`, so `cmd.exe` does
not reparse the arguments. Other wrappers run through a guarded `cmd.exe`
fallback that refuses arguments `cmd.exe` would interpret. If the plugin reports
`cli_unsafe_argument`, or a wrapper should be bypassed, set `cliPath` to the
CLI's `.js` entry (for example `...\dist\index.js`). A missing token returns
`authentication_required`; public catalog reads remain anonymous.

On Windows, plugin login requires Windows PowerShell and its `Add-Type`
compiler. A helper assigns the CLI to a Windows Job before it starts. It
preserves the CLI exit receipt and ends remaining descendants after their grace
period. Version and update checks run directly, outside that Job.

A cancelled or timed-out startup reports `cli_terminated` with `started: false`
unless the supervisor recorded a `.nostart` failure. That recorded failure
remains `cli_job_unavailable`. Login distinguishes a stop before startup
from an interruption after startup. Supervisor diagnostics use UTF-8 and remain
private; post-start stacks are not exposed in the public error message.

These controls cover retained plugin CLI calls, not commands the Agent launches
through other tools. Actual DSH shutdown and real official CLI descendant
behavior remain unverified.

## Submitting from the conversation

An explicit user request permits the Agent to submit in the current task using
the official CLI or API. Finishing a solution, a material check and a model's
claim of consent do not constitute a request. The old submission tools and
`/playground-confirm` command are removed.

Before execution, read `playground_task status` and state
`submitPolicy.announcement`. The policy includes today's counts for the
signed-in account, using the Beijing day. The plugin filters platform history by author and challenge, then deduplicates by attempt ID. Missing quota flags leave quota usage unknown.

A statement limit, an already counted submission today or a recorded HTTP 429
requires an additional user answer. For workbench requests, the workbench waits until the user chooses to continue or cancel. For a submission requested in the conversation, an explicit additional user answer in that conversation also counts. The Agent must not invent that answer. The confirmation belongs only to
that task, account, material references and quota snapshot; changed context
requires a new answer. A still-valid answer is not requested again.

### Verified interaction and enforcement

The target compatibility baseline is DSH `0.2.1-rc.5`, as recorded in the
AUD-003 investigation. `playgroundQueries/submission` uses the same gateway
context check as material authorization. `invocation.peer` must be the
actual `connection.browserPeer` object. A command's `source.kind=user`,
an owner label, a model boolean and an automatic `allowed-once` response
do not satisfy that check. No generic approval result is treated as verified
human consent. Cancellation, rejection, missing interaction and unverified peers
never dispatch a quota-sensitive request.

This boundary enforces plugin-controlled dispatch. It does not control every
terminal or HTTP tool available to the Agent. The Agent's account selection,
official protocol, trace integrity and response to conversation requests remain
behavioral requirements, not a new global sandbox. A browser peer identifies
the authenticated workbench channel; it does not establish that a physical
human operated an automated browser.

Offline regression tests use a fake host, fake Agent receipts and temporary
material references. They do not perform real submissions. A production DSH
one-click handoff and ID return remain unverified in this change; the previous
investigation's nine passing tests do not establish that result.

### Progress and recovery

`playground_task progress` records `not_created` or `unknown` with a
short actual blocker. A 429 is recorded through `http_status: 429`.
`track` accepts `submission_state` values `created`, `uploaded`,
`upload_failed` and `unknown`, plus a short error message. These are
Agent reports until a platform result provides further evidence.

Always retain an attempt ID obtained before upload failed. On a timeout or
unknown result, query the known attempt or the submission list before creating
another. A retry follows the official protocol for the verified original
attempt. Cancellation cannot withdraw a server write that already happened. A dispatched, created or unknown handoff can be cancelled from the task drawer to clear the plugin request state. A persisted dispatching request can also be reset after a Host restart, when no in-flight dispatch owns it. Cancellation is refused while the current Host still owns that dispatch. This does not stop the Agent. Known attempt IDs remain visible and tracked, and the next handoff explicitly requires reconciliation of the previous request before any new creation.

## Configuration

The row accepts:

| Field | Default | Meaning |
|---|---|---|
| `baseUrl` | `https://play.bohrium.com` | HTTPS site root or `/api` endpoint; normalized automatically. Loopback HTTP is supported for local development |
| `timeoutMs` | `20000` | Per-request timeout for reads, including response body reading, in milliseconds |
| `cliPath` | `playground` | Installed Playground CLI executable used for login and update checks |
| `credentialsPath` | CLI default | Optional `PLAYGROUND_CREDENTIALS_PATH`-style credentials file override |
| `cliTimeoutMs` | `120000` | Maximum duration for one CLI login (at most `2147483647`), followed by up to 5 s of shutdown |
| `releaseChannel` | `stable` | Release channel checked by the version card. `stable` selects the highest normal release; `beta` includes prereleases |
| `token` | — | Playground token override; it wins over every other source, including a token saved in the workbench. Prefer the workbench token login |

The API base also falls back to `PLAYGROUND_API_BASE`, matching the CLI.
The same protocol rule applies to both sources. The plugin rejects remote HTTP
API bases before making a request; with such a base the plugin fails to load
and reports `invalid_config`. HTTP is supported only for `localhost`,
`127.0.0.1`, or `[::1]`, including explicit ports. LAN addresses and similar
hostnames such as `localhost.example.test` require HTTPS. The plugin's API client
does not follow redirects and reports `redirect_refused` when the API answers
with one. Configure the final HTTPS API endpoint.

API bases containing a username or password are refused with `invalid_config`.
Use a Playground token for authentication. Query strings and fragments are
discarded during normalization. Invalid-base errors do not echo the input.

Every API response body has an 8 MiB byte budget, including challenge details,
paged lists, identity checks, submission records, and scorecards. The client counts decoded body bytes as it reads the stream, including
HTTP error bodies, independently of `Content-Length`. Above the budget it
cancels the reader and reports `response_too_large` with the known HTTP status.
It returns no partial data. A failed result read does not create a submission.

The budget leaves room for long statements and scorecards. An anonymous sample
on 2026-11-19 covered four challenge list pages of up to 50 items and 40 public
challenge details. The largest list was 155,040 bytes and the largest detail was
114,872 bytes. The budget is over 50 times the largest sampled response. Tests
also read synthetic statements and scorecard bodies over 1 MiB. Scorecard sizes
were not surveyed on the platform. This is an API response budget, independent
of submission material limits. Direct `createPlaygroundClient` callers can
inject a positive integer `maxResponseBytes`, including a small budget in tests.

## Develop and verify

Development and tests require Node.js 24 or newer, the same major version DSH
bundles.

```powershell
npm ci --ignore-scripts  # install development dependencies
npm run build:client     # build after editing src/client/
npm run check:client     # compare source with the committed client.js
npm test                 # check freshness, build, and run offline tests
npm run verify:package   # pack, unpack, and check the actual delivery files
node scripts/smoke.mjs   # live read-only calls against the real platform
npm run demo:local       # fully offline mock API demo
```

Commit `src/client/` and the generated root `client.js` together. The build
bundles local modules into one static entry and leaves React, DSH UI primitives,
and the DSH snapshot store to the module loader. The factory returns the plugin
object directly. Its service `inject` list is independent of these external
module dependencies.

The pinned development bundler writes only `client.js`. It does not clean Host
files or resources. Source maps, Client source, and build tools are not included
in the npm package. npm and Git installations both load the committed entry
without a local build. CI, release verification, and publishing install with
`--ignore-scripts`, explicitly build through `npm test`, and verify the actual
package. Publishing uploads that verified tarball.

The smoke test prints the real challenge total, one challenge
detail, its submission table, and one submission detail. No credentials are
needed.

The local demo starts a mock Playground API on `127.0.0.1`, drives the same
read client and a fake Agent handoff, then tracks an existing fake attempt. It never contacts `play.bohrium.com`.

The handoff tests cover source verification, quota answers, duplicate dispatch, external material references, progress and attempt ownership with a fake host. The test suite is offline;
the smoke script is the only command in this section that contacts the real
platform.

## Scope and next steps

- The plugin does not build an ARM bundle or generate a trajectory. The agent
  prepares materials according to the current challenge and official tool requirements.
- Reading leaderboards across challenges (`GET /api/attempts`) and manual
  scoring refresh (`POST /api/challenges/{id}/refresh-scoring`) are not exposed
  yet; `playground_get_attempt` already pulls the latest worker result for one
  submission.
- The agent tools `playground_list_competitions` and `playground_get_competition`
  map to the platform's hackathon season endpoints; visibility and lifecycle
  come from the server. The workbench's competition selector is different: it
  uses the built-in table described above, plus the seasons that endpoint lists.
- Personal history uses `/api/user-submissions`, not a client-side filter over public
  submissions. The plugin pages the returned array locally. Its `nextCursor` must be used with unchanged `challenge_id` and
  `status` filters. Empty results are an empty page, not an authentication prompt.
- The DSH credential store is supported. Prefer it or the inherited environment
  over a plaintext token in the patch; no token is written into
  `cordis.patch.yml`.

## License

[MIT](../LICENSE).
