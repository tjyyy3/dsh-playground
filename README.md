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
   challenge catalog and click **开始参赛任务** or **开始出题任务**. The plugin
   creates a fresh native DSH session with the selected challenge; the
   exploration conversation remains intact. You do not need to type a challenge
   id by hand.
2. Work using DSH's existing chat, files and workspace features. Choose a native
   workspace before starting; the agent tool also accepts an existing `cwd`.
   Separate solution conversations can use independent existing workspaces.
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

**参赛 / 出题** are switchable working modes, not account identities. Switching
preserves the receipt and clears a pending confirmation. Author mode can prepare
local problem materials; platform problem creation/editing/publication is outside
this MVP. Codex chat management is also outside scope.

Local checks cover file existence/size, ZIP signatures, object-valued trace
records, nonempty execution steps, manifest JSON and exact SHA-256 snapshots.
They do not execute bundles, validate every ARM rule, or establish scientific
correctness. The platform still owns final validation and grading. New workflow
controls currently use Chinese labels; existing query card labels retain
their Chinese/English translations.

## Global workbench and chat visualization

In v0.4.4, **Playground** in the native left navigation opens a global workbench
with a Playground login form and authentication status check.
The plugin no longer adds any controls above the composer. The workbench uses
DSH's existing session catalog, workspace paths and persisted task projections;
it does not embed the website or create a separate conversation store.
The workbench now keeps the connection status in a full-width header card, then
uses two adjustable columns by default: a searchable competition/challenge
catalog on the left and the selected task workflow on the right. Choose a
readable challenge card and click **开始参赛任务** or **开始出题任务**; the
challenge id stays an implementation detail. The right column lists only
Playground task conversations, with a short session id, workspace and task
state. Ordinary exploration chats do not appear in this selector. The split can
be adjusted between 35% and 65%, and narrow windows fall back to one column.

Select a task to check materials, review the exact submission target and inspect
results. **返回所选任务对话** returns to native chat. Creating another task from
the catalog creates a new conversation without narrowing or overwriting the
existing one.

Chat keeps its historical tool/command cards. A pending check card offers
**前往工作台确认提交**, which opens the workbench for that conversation.
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
text results. Cards reflect the latest query; they do not poll in the background.

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

- DSH with the **Add plugin → Install third-party plugin** entry.
- Node.js 20 or newer. The bundle installer uses the package's `package-lock.json`.
- The Playground CLI (`playground`) for login and confirmed submissions. Public
  challenge and competition reads can work without a login.

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
personal submissions and write operations. The plugin never submits without an
explicit confirmation.

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
line or chat message. The CLI writes its normal credentials file; the plugin
reads the token from that file for subsequent API reads. The CLI executable is
`playground` by default and can be changed with the bundle config `cliPath` or
the `PLAYGROUND_CLI` environment variable. A missing token returns
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
| `cliTimeoutMs` | `120000` | Maximum duration for one CLI operation |
| `token` | — | Playground token override; prefer `PLAYGROUND_TOKEN` |

The API base also falls back to `PLAYGROUND_API_BASE`, matching the CLI.

## Develop and verify

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
