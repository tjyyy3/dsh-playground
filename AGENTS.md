# Playground DSH Plugin

## Project

This repository contains the `@playground/dsh-playground` Host/Client plugin. It
adds Playground challenge discovery, task sessions, Agent submission requests, and result cards to DSH. The product name is Playground Workbench.

## Run and verify

- Requires Node.js 24 or newer.
- Install development dependencies with `npm ci`.
- Run the offline test suite with `npm test`.
- CI (`.github/workflows/test.yml`) runs `npm test` on Windows and macOS with
  Node 24 and 26 for pull requests and pushes to `main`. CI sets
  `PLAYGROUND_API_BASE` to an unreachable address, so tests must not depend on
  the default base URL: inject a fake client or pass `baseUrl` and `fetchImpl`,
  and set and restore `PLAYGROUND_API_BASE` inside any test that needs it.
- Run `node scripts/smoke.mjs` only for read-only platform checks.
- Run `npm run demo:local` for the offline mock API demo.

## Structure

- `index.js`, `lib/`: Host tools, API, CLI integration, and workflow projection.
- `client.js`: DSH Client slots, workbench, task drawer, and result cards.
- `cordis.patch.yml`, `locale/`, `icon.svg`: bundle metadata and client assets.
- `scripts/`, `test/`: development checks and automated tests.
- `README.md`: the public installation and usage contract.

## Repository boundaries

- Install from DSH's third-party plugin UI using the Git repository URL; the
  low-level `plugin_manager` command is a fallback for Creator-mode debugging.
- Keep `docs/`, `_scratch/`, `PRODUCT.md`, `.impeccable/`, `node_modules/`, and
  logs out of Git. `docs/` and `_scratch/` are local archive or test residue.
- Do not put Playground tokens, passwords, credentials, or local absolute paths
  into tracked files.
- Keep UI-only changes in `client.js`; do not modify DSH host code from this repo.
- Workspace materials need no new permission. External paths require a user grant
  from the browser workbench, for this operation by default or for the task.
  A material read grant is not a submission grant.
- Playground writes require an explicit user request. The task's **提交**
  button sends one request to that task's existing Agent session. The Agent
  chooses official CLI or API steps from the current challenge requirements.
  The plugin never uploads, forces a dry-run, or reads material content.
  Retired `playground_submit`, `playground_submit_attempt`,
  `playground_check_materials` and `/playground-confirm` have no executable
  Host tool or command handler. Keep historical client renderers for safe display.
- Before executing a submission, read `playground_task status` and announce
  `submitPolicy.announcement`. A statement limit, a counted submission today
  across self and confirmed Agent accounts in Beijing time, or a recorded
  platform 429 requires an additional user answer. For a chat-requested
  submission, an explicit user answer in that conversation also counts.
  The workbench verifies its
  browser Peer before accepting the answer for the current request. Refusal,
  cancellation, unavailable interaction or an unverified automatic approval
  never dispatches. Do not treat a model boolean as user consent. An existing
  confirmation remains valid only for its task, account, references and counts.
  Terminal and HTTP tools are outside this plugin's enforcement boundary.
- Register known material paths with `playground_task materials`; external
  paths reuse the workbench material authorization. This records references,
  without reading, hashing, counting, packing or checking content. Never reuse
  an old check card's material selection for a new submission.
- Immediately record every real official attempt ID through
  `playground_task track`, even if uploading later fails. Track verifies
  challenge and self or confirmed Agent-account ownership and is idempotent.
  Report created, uploaded, upload_failed or unknown accurately. Without an ID,
  use `playground_task progress` for not_created or unknown and explain the
  blocker. Unknown outcomes require querying existing attempts before retrying;
  never blindly switch routes to create another. Cancellation cannot undo a
  server write. Do not fabricate materials, execution traces or results.
- Task creation must explicitly name a registered DSH workspace and never
  create sessions in unregistered directories. UI starts (workbench and chat
  cards) must show the workspace selection and confirmation dialog and send the
  chosen workspace id; they never inherit whichever conversation happens to be
  open. Agent calls pass an absolute `cwd`: the directory the user named, or the
  current conversation's workspace when the user started the request there.
  Resolve path identity through `workspaceRegistry.resolveByPath`, including
  directory aliases. In an existing Playground task conversation, continue that
  task; create another only when the user explicitly asks for a new task.
- Binding (`playground_bind_task`) turns the current conversation into a task
  conversation without creating a session or sending a prompt. It takes no
  directory: the conversation's own working directory must resolve through
  `workspaceRegistry.resolveByPath` to a registered DSH workspace, otherwise
  binding is refused. It writes nothing to the platform. A bound conversation
  keeps its task: the same challenge is a no-op that leaves receipts and
  `attemptIds` untouched, and another challenge is refused. Binding a
  conversation without a task keeps its historical receipt and `attemptIds`
  for the bound challenge and is refused when they belong to another one. Bind
  only on an explicit request to work on or submit a challenge in this
  conversation; a refused bind is reported to the user, never followed by an
  unrequested `playground_start_task`.

## Current state

Version field: `0.4.4`.

The workbench dispatches submission requests to each task's existing Agent,
passes authorized material references, and tracks verified attempt IDs and results.
It does not upload materials or run submission prechecks. Browser cancellation
recovers stranded requests while retaining their IDs and reconciliation context.
Historical cards remain readable without executable submission handlers.
No live runtime verification is implied by the unit tests alone.
