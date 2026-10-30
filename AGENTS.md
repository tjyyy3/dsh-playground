# Playground DSH Plugin

## Project

This repository contains the `@playground/dsh-playground` Host/Client plugin. It
adds Playground challenge discovery, task sessions, material checks, confirmed
submission, and result cards to DSH. The product name is Playground Workbench.

## Run and verify

- Requires Node.js 20 or newer.
- Install development dependencies with `npm ci`.
- Run the offline test suite with `npm test`.
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
- Preserve the explicit user confirmation gate before any Playground write.
- Task creation must explicitly name a user-selected absolute workspace path;
  never inherit the source conversation's directory. UI starts must show the
  workspace selection and confirmation dialog before creating a session.

## Current state

Version `0.4.4` contains the split Playground workbench, responsive layout,
task summary rows, and a task detail drawer. The future-capability preview was
removed from runtime UI; future ideas belong in local design notes. No live
runtime verification is implied by the unit tests alone.
