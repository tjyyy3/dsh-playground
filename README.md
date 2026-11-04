# Playground Workbench — DSH Plugin

An independent DeepSeek Harness (DSH) Host/Client plugin that turns the Playground
competition platform into a native DSH workbench. It exposes challenge, competition,
submission, material-checking, authentication, and confirmed-upload workflows as agent
tools, chat cards, and a global Playground workbench.

The package name is `@playground/dsh-playground`; the product name is **Playground
Workbench**. The plugin is installed from this Git repository as a DSH bundle, not
from npm.

| Tool | Purpose | Platform endpoint |
|---|---|---|
| `playground_list_challenges` | Query the real challenge list with search, filters, sorting, pagination | `GET /api/challenges` |
| `playground_get_challenge` | Read one challenge's metadata, resources, and markdown problem statement | `GET /api/challenges/{id}` |
| `playground_list_attempts` | List submissions for one challenge, best score first | `GET /api/challenges/{id}/attempts` |
| `playground_get_attempt` | Read one submission's status, score, scoring state, and scorecard | `GET /api/attempts/{id}` |
| `playground_submit_attempt` | Check materials and request user confirmation; no immediate write | Reads until user confirmation |
| `playground_list_competitions` | List visible competitions/seasons with lifecycle status and deadlines | `GET /api/hackathon/seasons` |
| `playground_get_competition` | Read a competition's status, dates, threshold, and challenge ids | `GET /api/hackathon/seasons/{id}` |
| `playground_list_my_attempts` | Read the authenticated user's own submissions with cursor pagination | `GET /api/me/attempts` |
| `playground_start_task` | Create a separate native DSH task conversation | DSH session/workspace services |
| `playground_check_materials` | Check explicit target, ZIP, trace, manifest and file hashes | Local reads and challenge metadata |
| `playground_task` | Read task/receipt, switch working mode or refresh latest result | DSH projections and `GET /api/attempts/{id}` |

The tools return structured JSON plus a Markdown rendering for the
conversation. In the current v0.4.4 MVP, agent tools still cannot confirm a
submission: the user-only confirmation command invokes the installed
Playground CLI to create the submission and upload its checked materials. It
requires authentication and can consume a platform submission slot.

## MVP: from task to evaluation

1. Search/read challenges in an exploration conversation, or open
   **Playground** in DSH's left navigation. Use the readable competition and
   challenge catalog and click **开始参赛任务**. The plugin
   asks you to select a DSH workspace and confirm its full path before creating
   a fresh native DSH session with the selected challenge; the
   exploration conversation remains intact. You do not need to type a challenge
   id by hand.
2. The workspace dialog lists DSH's registered workspaces. **添加工作区…** uses
   DSH's native directory picker to register another directory. Choosing a
   directory does not start a task: click **创建参赛任务**
   to continue, or cancel without creating a conversation. Every UI start
   requires this confirmation.
   Work using DSH's existing chat, files and workspace features. Agent calls to
   `playground_start_task` pass the absolute `cwd` of a registered DSH
   workspace: the directory you name, or the current conversation's workspace
   when you ask from that conversation. Missing, relative, unregistered or
   vanished paths are rejected; the tool never registers a directory and has
   no implicit default. DSH resolves alternative paths to the same registered
   directory. Continue work in the resulting task conversation; ask for a new
   task explicitly when you want another, separate task.
   The new conversation's first message is a short Chinese prompt with the
   challenge title, id, web URL, workspace and mode, plus four steps naming
   `playground_get_challenge`, `playground_check_materials` and the
   confirmation card. It does not embed the statement or resources: the agent
   reads them itself with `playground_get_challenge`, so they are always
   current. The agent asks for `max_content_chars` 50000, the tool's maximum,
   and the tool flags any truncation in its output. The first turn only reads
   the challenge and explains the plan; checking materials waits until you
   confirm the plan. The prompt does not authorize any action. It tells the
   agent not to run `playground submit` in the terminal; real submission
   happens only when you click **确认目标并提交**.
3. Prepare an ARM ZIP and a real execution trace. In the global workbench, select
   the task and click **准备提交 / 检查材料**,
   or ask `playground_check_materials` with an explicit target. Unambiguous
   files are found in the working-directory root, `playground-submission/`, or
   `.playground/`; multiple matches require an explicit path.
4. Review the confirmation card: challenge title/id, destination API, workspace,
   method, new submission versus retry, paths, sizes and hashes. Click
   **确认目标并提交** to upload. Cancel makes no platform write. Changed
   materials invalidate the previous check and require another confirmation.
5. Read the receipt and click **查询结果 #…**, or ask `playground_task` for
   `results`. The task supplies its receipt id. Result details are collapsible;
   task, pending card and receipt restore from the native session log.

**参赛 / 出题** are working modes, not account identities. Author mode (出题)
is not open yet: the workbench and chat cards only start participation tasks,
and task details no longer offer a mode selector. A task that is in author
mode (created by an earlier version, or set by an agent through
`playground_start_task` with `mode: "author"` or `playground_task` with
`action: "mode"`) still opens with its author note and a **切回参赛** button;
switching back preserves the receipt, clears a pending confirmation and
restores material checks. Platform problem creation/editing/publication is
outside this MVP. Codex chat management is also outside scope.

Local checks cover file existence/size, ZIP signatures, object-valued trace
records, nonempty execution steps, manifest JSON and exact SHA-256 snapshots.
They do not execute bundles, validate every ARM rule, or establish scientific
correctness. The platform still owns final validation and grading.

After the local checks pass, the material check runs the installed CLI once with
the same arguments the confirmed submission will use plus `--dry-run`
(`playground submit … --dry-run`). The CLI returns before the platform creates
or uploads anything, so no submission exists afterwards (the CLI may still make
its own release-notice request). A confirmation card is generated only when the
CLI accepts the materials; otherwise the check shows a plugin-written reason and
no card. Only CLI 0.1.43 and later are asked to dry-run, and only when
`playground submit --help` lists `--dry-run`; the plugin runs that probe once per
CLI command and version, because a version number alone does not identify a
build. When the CLI or Node.js is missing, or the CLI is older or does not list
the flag, the card is generated as before and says "未经 CLI 预检". If the
arguments contain characters that `cmd.exe` would interpret (only on the Windows
`.cmd` fallback), no card is generated and the check asks for a `cliPath` that
points to the CLI's JavaScript entry. A CLI rejection at confirmation time,
before it creates anything, is reported as "平台未创建这次提交" and the card is
cleared; fix the materials and check again. This includes the CLI's refusal to
submit from a site that has no scoring Worker of its own (a `baseUrl` other than
`https://play.bohrium.com`), which the dry run cannot see.

The trace must be in a format the CLI accepts:

1. a native session JSONL (Codex, Claude Code, OpenCode);
2. a conversation-record JSONL with one `{"role": ..., "content": ...}` object
   per line (system, user, assistant, tool);
3. a `{"steps": [...]}` JSON of normalized ARM trace steps.

Check a trace with `playground trace validate --trace <path>` before
checking materials. The task's first prompt and the `playground_check_materials`
description give the agent the same rules. New workflow
controls currently use Chinese labels; existing query card labels retain
their Chinese/English translations.

## Global workbench and chat visualization

Login status checks and catalog loading, refresh, search, and filtering use a
session-free read-only Host query. Their status and errors stay in the workbench;
they do not append commands to any conversation, and browsing works without an
open conversation. Creating tasks, checking materials, and confirming
submissions continue to use the session workflow, so the catalog's start
buttons stay disabled until a conversation with command access is open.

Chat no longer shows the login-status and catalog cards that older plugin
versions wrote automatically into open conversations; the stored history is
unchanged. Cards for the explicit **Playground 登录** action still show.
Command cards show the operation, status and a result summary with a native
expandable details section. Details project selected business facts rather
than raw CLI output, credentials, account details or local paths; expanding a
card never reruns it.

In v0.4.4, **Playground** in the native left navigation opens a global workbench
with a Playground login form and authentication status check.
The plugin no longer adds any controls above the composer. The workbench uses
DSH's existing session catalog, workspace paths and persisted task projections;
it does not embed the website or create a separate conversation store.
The workbench now keeps the connection status in a full-width header card, then
uses two adjustable columns by default: a searchable competition/challenge
catalog on the left and task summaries on the right. Choose a
readable challenge card and click **开始参赛任务**, then
select and confirm the destination workspace. The same confirmation applies
to start buttons in chat result cards. The challenge id stays an implementation
detail. **在网页中打开** on a challenge card opens the challenge's platform page,
`<site root>/challenge/<encoded challenge id>` (for example
`https://play.bohrium.com/challenge/ai-github-98fdb6f0`). DSH desktop opens it
in the system browser; in a browser profile it opens in a new tab. It needs no
conversation. The Host builds the address from the API base with the same
function as the start prompt's web URL, dropping any account details, query,
fragment and `/api` suffix, and the workbench shows the button only for `https`
addresses (`http` only for the loopback hosts `localhost`, `127.0.0.1` and
`[::1]`). Chat result cards have no such button.

**查看详情** on a challenge card opens a challenge detail drawer on the right.
It closes with **关闭**, a click on the backdrop, or Escape. The drawer reads the
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
**开始参赛任务** in the drawer closes it and opens the same workspace selection
and confirmation as the card; it is disabled in the same cases.
**在网页中打开** opens the same page as the card's button.

The right column lists only
Playground task conversations, with a short session id, workspace and task
state. Ordinary exploration chats do not appear in this selector. The split can
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

Select a task to open its detail drawer, check materials, review the exact
submission target and inspect results. The drawer's **在网页中打开** opens the
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
failure. The list reloads once each time a submission is confirmed in the
task conversation, such as one confirmed in the drawer, including a re-upload
under the same submission number; **查询结果 #…** does not reload it or drop
pages already loaded. The history is not polled on its own: when
the workbench refresh above settles a task's latest submission, its history
entry takes that result; other entries, including CLI submissions, update when
the drawer is reopened. In task
conversations created before this version, only the latest submission is marked
**本对话**.
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
DSH's main view, for example after **前往工作台确认提交**
(**这是 DSH 当前打开的对话，请先在侧边栏切换到其他对话再归档。**): DSH closes its main
view when that conversation is archived, which would also close the workbench.
DSH does not open an archived conversation until it is restored, so an archived
task's drawer has no **打开任务对话** and no check or confirm controls; it shows
the archived state, **撤销** and the submission history, and **返回所选任务对话**
skips it. A task with a submission waiting for confirmation can be archived,
and its check card is still there after it is restored. If DSH refuses because
the conversation still has running work, including subagents, background jobs
or schedules, the workbench says so; other refusals show a short reason.
**N 个任务** counts only tasks that
are not archived, and the workbench refresh does not read archived tasks'
submissions. Below the list, **已归档 M 个** expands the archived tasks, each with
**取消归档**. The plugin offers no delete: DSH has no interface for deleting a
conversation. On a DSH version that does not report its archive set, nothing
is treated as archived and the archive controls are hidden.

Chat keeps its historical tool cards and workflow command cards. A pending
check card offers **前往工作台确认提交**, which opens the workbench for that
conversation.
This navigation never confirms a submission. The workbench's **如何使用**
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
supported without a browser. Login and CLI submission require the native DSH
workflow services; deployments without them fail closed instead of submitting
automatically.

## Why these APIs

The Playground CLI (`cli/src/index.ts`) already contains the reusable
integration decisions this plugin keeps:

- API base normalization accepts the site root and appends `/api`
  (`normalizePlayApiBase`), default `https://play.bohrium.com/`.
- Challenge listing uses the paginated envelope
  `{ items, total, page, per_page, pages, has_more }`.
- Challenge detail already embeds the full markdown `content`, so a second
  content request is unnecessary.
- Submissions are created as multipart forms; an agent submission must carry a
  trajectory (`trace` JSON or a `raw_messages` JSONL file).
- The bundle is a separate multipart upload of an ARM `.zip`; the platform
  validates it, reports `violations`, and triggers scoring when it accepts it.
- `PLAYGROUND_API_BASE` and `PLAYGROUND_TOKEN` are the same environment
  variables the CLI uses.

The server routes behind them are `list_challenges` and `get_challenge` in
`server/routes/challenges.py`, the attempt routes in
`server/routes/attempts.py`, and the bundle routes in `server/routes/bundles.py`.
Read endpoints work anonymously for public challenges; writes require a token.

## Install from Git

The normal installation path is DSH's built-in third-party plugin installer. It
installs the package dependencies and activates the bundle for the current DSH
profile.

### Requirements

- DSH with the **Add plugin → Install third-party plugin** entry. The plugin
  runs on the Node.js runtime bundled with DSH.
- The Playground CLI (`playground`) for login, material prechecks and confirmed
  submissions; it needs Node.js 20 or newer. Public challenge and competition
  reads can work without a login.

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
is y"), the workbench login area and the material check show
"Playground CLI 版本过旧（x，最新 y），可能影响评分" with these update steps.
The login area learns this from `playground update-check`, which makes one
release-notice request (the CLI caches the answer in its own file). The plugin
runs it at most once an hour and in the background, so the first workbench load
after a start shows no warning and a later load does. A warning ends as soon as
the installed version changes (after updating, click **重新检测** in the login
area, and once more a moment later). A material check also picks the warning up from the CLI's notice. Only the two
version numbers are kept, never other CLI output.

### Steps

1. Open **Add plugin → Install third-party plugin** in DSH.
2. Select **Git repository** and enter:

   ```text
   https://github.com/tjyyy3/dsh-playground.git
   ```

3. Wait for the installer to finish, then restart DSH if it asks you to reload
   the Client module. Open a new conversation and look for **Playground** in the
   left navigation.

For Creator-mode debugging, the lower-level bundle command remains available.
Use the absolute path of a cloned checkout:

```text
plugin_manager action=install_bundle target=<absolute-path-to-dsh-playground>
```

The bundle patch inserts the `playground-competition` row with package name
`@playground/dsh-playground` and the default API base
`https://play.bohrium.com`.

The package is intentionally installed from Git rather than npm. The
`package.json` remains private because the DSH plugin installer is the supported
distribution path.

Installing affects every session in the current DSH profile and survives a
restart. Removing it is `plugin_manager action=remove_bundle`, or disable the
`playground-competition` row.

If the installation succeeds, other users can use the plugin immediately from
their own DSH profile. They still need a Playground login (or a token) for
personal submissions and write operations. The submission path the plugin
provides requires the user's confirmation in the Playground workbench (the
**确认目标并提交** button). The plugin cannot stop an agent from running the
Playground CLI directly in a terminal, because that does not go through the
plugin. Depending on your DSH sandbox and approval settings, such a command may
be blocked (for example by network restrictions) or may need your approval
first. Those are DSH settings, not a guarantee of this plugin, so review any
terminal command the agent asks to run.

The user can also confirm with the `/playground-confirm <code>` command. The
code is a guard against clicking a stale card, not a credential. It is kept out
of the `playground_task` `status` result, but it still appears in the structured
results of `playground_check_materials` and `playground_submit_attempt` and in
the `/playground check` output, because the workbench needs it to enable the
button.

## Authentication

Public challenge and competition reads work anonymously where platform access
rules allow. Personal submissions and writes require authentication. The plugin
uses the installed Playground CLI for login and submission, then resolves a
Playground token per operation in this order:

1. `token` in the row's `config` (discouraged: it is stored in the profile);
2. the DSH credential store under the name `PLAYGROUND_TOKEN`;
3. the CLI credentials file (`PLAYGROUND_CREDENTIALS_PATH`, or the CLI default
   `~/.config/playground/credentials.env`);
4. the `PLAYGROUND_TOKEN` environment variable.

Use the Playground side panel to enter the account email and password. The
plugin stores the password through the DSH credential channel, invokes
`playground auth login --email ...`, and never puts the password in a command
line or chat message. Login runs through a session-free Host call, so it works
without an open conversation and adds no record to any conversation. The CLI
writes its normal credentials file; the plugin reads the token from that file
for subsequent API reads. The CLI executable is
`playground` by default and can be changed with the bundle config `cliPath` or
the `PLAYGROUND_CLI` environment variable. Prefer an absolute `cliPath`; on
every platform, a relative path containing a slash is resolved against the
CLI's working directory: the task workspace for submission and the DSH process
directory for login. On Windows, only npm- and pnpm-style `.cmd` shims are
parsed: the plugin starts their JavaScript entry with `node`, so `cmd.exe` does
not reparse the arguments. Other wrappers run through a guarded `cmd.exe`
fallback that refuses arguments `cmd.exe` would interpret. If the plugin reports
`cli_unsafe_argument`, or a wrapper should be bypassed, set `cliPath` to the
CLI's `.js` entry (for example `...\dist\index.js`). A missing token returns
`authentication_required` with the same guidance; public catalog reads remain
anonymous.

## Submitting for scoring

`playground_submit_attempt` and `playground_check_materials` prepare the same
confirmation card. After confirmation, the native workflow invokes
`playground submit` with the checked bundle and trajectory. Always supply
`challenge_id`. Paths can be omitted when
workspace discovery has exactly one candidate:

- `bundle_path` — absolute path to the ARM `.zip` (platform limit 200 MiB);
- `trace_path` — absolute path to a JSON array of trace-step objects, or a
  `raw_messages` JSONL file. Required for a new submission;
- `manifest_path` — optional `arm_manifest.json`, required by hackathon
  challenges that have no programmatic grader;
- `attempt_id` — optional existing submission id; retries only the bundle upload
  without creating another submission or consuming another slot.

Every non-empty JSONL line must contain a JSON object. Invalid lines are reported
with their original file line number before any submission is created.

The tool returns `awaiting_confirmation` with the exact target and file summary.
User confirmation uploads those bytes and stores the submission id, status
and validation violations in the task receipt. A rejected bundle returns
`bundle_invalid` with the violations and the submission id, so a corrected
bundle can be retried with `attempt_id`.

If the CLI could not start (not found, Node.js missing, arguments that cmd
would interpret, invalid arguments), nothing was submitted: the result is
`cli_not_started` and the same confirmation card can be confirmed again after
fixing the configuration.

Once the CLI has started, a failure, timeout or cancellation always invalidates
the confirmation card. If the CLI names the created submission (its
`--attempt-id` retry hint), the receipt keeps that id and **检查后重传原提交 #…**
(under **准备提交 / 检查材料**) uploads into it. A failure at or before create
(authentication, submission limit, rate limit, size limit, a CLI local check or
a CLI argument error) returns `submission_rejected`. Otherwise the result is
`outcome_unknown`: check the challenge's submissions before submitting again.
When exactly one matching recent submission is listed, the receipt suggests it
as possibly this one; verify its result before retrying into it. A platform
5xx while creating the submission (`server_error`) is the platform's error, not
the plugin's: it usually means nothing was created, the result is still
`outcome_unknown` with a short message, and the platform's request id (a hex
token, also in `requestId`) is shown so you can send it to the maintainers.
The classification uses the text the CLI printed, so a CLI that then crashes
on exit (for example Windows exit code 3221226505) is classified the same way.
The plugin shows only its own classified message, never the CLI output. On a timeout or
a cancellation the plugin ends the CLI and the processes it started, then
waits up to 5 seconds for them to stop, so the result arrives at most 5 seconds
after the limit. If a CLI exits cleanly but a process it started keeps its
output open, only macOS and Linux end that process; on Windows it is left
running. If DSH exits normally while a submission is running, the plugin ends
the CLI on macOS and Linux; a DSH killed by a signal or a crash does not end it.

Submission slots per challenge are limited by the platform's rules;
the tool never retries a submission on its own.

## Configuration

The row accepts:

| Field | Default | Meaning |
|---|---|---|
| `baseUrl` | `https://play.bohrium.com` | Site root or `/api` endpoint; normalized automatically |
| `timeoutMs` | `20000` | Per-request timeout for reads, including response body reading, in milliseconds |
| `uploadTimeoutMs` | `180000` | Per-request timeout for submission and bundle uploads, including response body reading |
| `cliPath` | `playground` | Installed Playground CLI executable used for login and confirmed submission |
| `credentialsPath` | CLI default | Optional `PLAYGROUND_CREDENTIALS_PATH`-style credentials file override |
| `cliTimeoutMs` | `120000` | Maximum duration for one CLI login (at most `2147483647`), followed by up to 5 s of shutdown |
| `cliSubmitTimeoutMs` | `600000` or `cliTimeoutMs`, whichever is larger | Maximum duration for one CLI submission, including the bundle upload and the CLI's retries (at most `2147483647`), followed by up to 5 s of shutdown |
| `token` | — | Playground token override; prefer `PLAYGROUND_TOKEN` |

The API base also falls back to `PLAYGROUND_API_BASE`, matching the CLI.

## Develop and verify

Development and tests require Node.js 24 or newer, the same major version DSH
bundles.

```powershell
npm ci                   # install development dependencies
npm test                 # unit tests, no network
node scripts/smoke.mjs   # live read-only calls against the real platform
npm run demo:local       # fully offline mock API demo
```

The smoke test prints the real challenge total, one challenge
detail, its submission table, and one submission detail. No credentials are
needed.

The local demo starts a mock Playground API on `127.0.0.1`, drives the same
client and submission code the plugin uses, and prints the multipart fields and
files the platform would receive. It never contacts `play.bohrium.com`.

The write path has unit coverage with an injected `fetch` for multipart fields,
trajectory shape, bundle validation, and retry behavior. The test suite is offline;
the smoke script is the only command in this section that contacts the real
platform.

## Scope and next steps

- The plugin does not build an ARM bundle or generate a trajectory. The agent
  must produce the `.zip` and the trace file first; `paper2arm` and the
  Playground CLI already do both.
- Reading leaderboards across challenges (`GET /api/attempts`) and manual
  scoring refresh (`POST /api/challenges/{id}/refresh-scoring`) are not exposed
  yet; `playground_get_attempt` already pulls the latest worker result for one
  submission.
- Competitions map to the platform's existing hackathon season endpoints. Their
  visibility and lifecycle come from the server, not a separate plugin registry.
- Personal history uses `/api/me/attempts`, not a client-side filter over public
  submissions. Its `nextCursor` must be used with unchanged `challenge_id` and
  `status` filters. Empty results are an empty page, not an authentication prompt.
- The DSH credential store is supported. Prefer it or the inherited environment
  over a plaintext token in the patch; no token is written into
  `cordis.patch.yml`.

## License

[MIT](LICENSE).
