# Playground DSH Plugin

## Project

This repository contains the `@playground/dsh-playground` Host/Client plugin. It
adds Playground challenge discovery, task sessions, material checks, confirmed
submission, and result cards to DSH. The product name is Playground Workbench.

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
- Playground writes require an explicit user request (#63): the user asks in
  the conversation to submit, or clicks the workbench button
  (`/playground-confirm`). On such a request the agent may submit directly with
  `playground_submit` (no DSH approval panel by default; the #57 panel path
  stays behind the internal `approvalPanel` option) or with a terminal
  `playground submit` (no `--dry-run`), and then must call `playground_task`
  `track` with the attempt id. Checking materials, a passed precheck or a
  finished solution is not a request. Before submitting, the agent states in
  one line the identity, the target and today's counts (`submitPolicy`
  `announcement`). It asks the user in text and waits when the statement
  states a submission limit, today (self plus Agent accounts, Beijing day)
  already has a submission counted toward the quota, or the platform answered
  429 (`submitPolicy.askFirst`); `playground_submit` then refuses with
  `ask_first` unless the call passes `user_confirmed_limit: true` after the user
  agreed. All plugin submit paths run the same `confirm()` checks. Keep the
  card's `checkId` (what `/playground-confirm` accepts) out of model-visible
  text; the agent gets only the keyed `approvalId`.
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
  conversation without a task keeps its pending card, receipt and `attemptIds`
  for the bound challenge and is refused when they belong to another one. Bind
  only on an explicit request to work on or submit a challenge in this
  conversation; a refused bind is reported to the user, never followed by an
  unrequested `playground_start_task`.

## Current state

Version `0.4.4` contains the split Playground workbench, responsive layout,
task summary rows, and a task detail drawer. The future-capability preview was
removed from runtime UI; future ideas belong in local design notes. No live
runtime verification is implied by the unit tests alone.
