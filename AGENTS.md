# Playground DSH Plugin

## Project

This repository contains the `dsh-playground` Host/Client plugin. It
adds Playground challenge discovery, task sessions, Agent submission requests, and result cards to DSH. The product name is Playground Workbench.

## Run and verify

- Requires Node.js 24 or newer.
- Install development dependencies with `npm ci --ignore-scripts`.
- Edit `src/client/`, run `npm run build:client`, and commit the generated
  root `client.js` together with its source. Do not edit the generated file.
- Run the offline test suite with `npm test`. It checks Client freshness,
  explicitly builds the Client, and loads the generated entry in behavior tests.
- Run `npm run verify:package` to compare the dry-run and actual npm package,
  unpack it, load its Host and Client entries, and verify required resources.
- CI (`.github/workflows/test.yml`) runs `npm test` on Windows, macOS and Linux
  with Node 24 and 26 for pull requests and pushes to `main`. CI sets
  `PLAYGROUND_API_BASE` to an unreachable address, so tests must not depend on
  the default base URL: inject a fake client or pass `baseUrl` and `fetchImpl`,
  and set and restore `PLAYGROUND_API_BASE` inside any test that needs it.
- Run `node scripts/smoke.mjs` only for read-only platform checks.
- Run `npm run demo:local` for the offline mock API demo.

## Structure

- `index.js`, `lib/`: Host tools, API, CLI integration, and workflow projection.
- `src/client/`: Client source. `dsh.js` owns DSH actions, credentials, slots,
  and the per-apply stores. `catalog/`, `tasks/`, `controller/`, `settings/`,
  and `cards/` own their existing flows. `workbench.js` owns task result refresh.
- `client.js`: generated single Client entry, used by both npm and Git installs.
- `scripts/build-client.mjs`: deterministic Client bundle. The three loader
  dependencies are external. No source maps or new assets are published.
- `cordis.patch.yml`, `locale/`, `icon.svg`: bundle metadata and client assets.
- `scripts/`, `test/`: development checks and automated tests.
- `README.md`: the public installation and usage contract.

## Git commits

Write all Git commit subjects and bodies in English, including merge and squash
commits. Set the commit message explicitly when merging a pull request whose
title or description uses another language.

## Repository boundaries

- Install from DSH's third-party plugin UI with the npm spec `dsh-playground@beta`
  (`dsh-playground` once a stable release exists). DSH does not update
  third-party npm plugins and refuses a registry spec whose name is already
  installed, so npm updates remove the plugin and install the spec again; the
  profile config overrides survive. The repository URL is the fallback: Git
  updates install the pinned Git spec that the version card copies from a
  GitHub Release over the existing copy; remove and reinstall only if DSH
  returns `already-installed`. Installs before 0.6.0 use the old package name
  `@playground/dsh-playground`; migrating means removing it before installing
  `dsh-playground`, never keeping both. The low-level `plugin_manager` command
  is a fallback for Creator-mode debugging. This plugin never installs or
  updates itself. Its read-only version card uses the configured
  `releaseChannel`.
- Publishing the GitHub Release draft triggers `.github/workflows/publish.yml`,
  which publishes to npm through trusted publishing (`beta` dist-tag for
  `-beta.N`, `latest` otherwise). Do not add an npm token.
- Keep `docs/`, `_scratch/`, `PRODUCT.md`, `.impeccable/`, `node_modules/`, and
  logs out of Git. `docs/` and `_scratch/` are local archive or test residue.
- Do not put Playground tokens, passwords, credentials, or local absolute paths
  into tracked files.
- Keep UI-only changes in `src/client/` and rebuild `client.js`; do not modify
  DSH host code from this repo.
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
  by the current account in Beijing time, or a recorded
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

Version `0.6.0-beta.2` candidate. Version `0.6.0-beta.1` was the first version published to npm as `dsh-playground`.

The workbench dispatches submission requests to each task's existing Agent,
passes authorized material references, and tracks verified attempt IDs and results.
It does not upload materials or run submission prechecks. Browser cancellation
recovers stranded requests while retaining their IDs and reconciliation context.
Historical cards remain readable without executable submission handlers.
The read-only version card shows running and on-disk versions, install source,
the exact npm version spec only after its public metadata and tarball are available,
and Release-derived pinned Git specs for Git installs. Checks use the configured stable or beta channel. DSH owns
installation and updates.
No live runtime verification is implied by the unit tests alone.
