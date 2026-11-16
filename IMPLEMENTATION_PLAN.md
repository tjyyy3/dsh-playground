# Implementation Plan

> Updated: 2026-11-16  
> Baseline: `a6c88d5c65a1e95bb02cbb36ae3910111e143eaf`  
> Working rule: one PR should have one primary behavior change, explicit tests and a rollback-friendly scope.

## 1. Delivery strategy

Do not start with a broad refactor of `index.js`, `client.js` or `lib/workflow.js`. First fix trust boundaries and establish behavior tests. Extract modules only when a concrete change requires a stable interface.

Every PR should include:
- Problem statement and evidence.
- Exact files / functions affected.
- Behavior before and after.
- Unit and integration tests.
- DSH host validation steps when host behavior is involved.
- Security / migration notes if persisted state or authorization changes.

## 2. PR sequence

### Track A — P0 security and submission integrity

| PR | Scope | Main files | Acceptance |
|---|---|---|---|
| A1 | Workspace-root path policy and external-file grants | `index.js`, new file-access module, workflow tests | traversal and symlink escapes rejected; explicit per-file external grant works |
| A2 | Immutable material snapshots | `index.js`, `lib/workflow.js`, CLI adapter | approved hashes equal bytes passed to CLI; mutation race tests pass |
| A3 | Submission authorization provenance | `lib/workflow.js`, DSH integration / approval adapter | ordinary explicit user request remains supported; quota confirmation cannot be forged by a model Boolean; replay rejected |
| A4 | HTTPS policy for credential-bearing API requests | `lib/api.js`, config tests, README | non-loopback HTTP rejected by default; HTTPS and documented local dev path work |

**A1 design requirements**
- Resolve workspace root and target using real paths.
- Use path-component containment, not string prefix.
- Define behavior for missing targets, symlinks, junctions and case-insensitive Windows paths.
- External grant must identify canonical path, operation purpose, session / user and expiry.
- Confirmation UI must distinguish external file use from normal workspace files.

**A2 design requirements**
- Snapshot bundle, trace and manifest bytes.
- Bind the approval to snapshot hashes and file sizes.
- Pass snapshot paths to CLI; do not re-read mutable original paths.
- Clean up snapshots on every exit path.
- Define what happens if DSH exits before cleanup; use a safe temp directory and startup cleanup with ownership / age checks.

**A3 design requirements**
- Preserve policy B: ordinary submission needs explicit user intent in the conversation; quota-sensitive submission requires additional user confirmation.
- Inspect DSH APIs for user-message provenance, approval events and user-only commands.
- If the host cannot prove the event's origin, require a host approval panel or workbench action for the additional confirmation.
- Bind the grant to the exact operation, identity, challenge and material snapshot.
- Keep retrying an existing attempt distinct from creating a new attempt.

### Track B — P1 reliability

| PR | Scope | Main files | Acceptance |
|---|---|---|---|
| B1 | Persist / reconstruct child lifecycle state | `lib/controller.js`, projections, controller tests | running / settled / failed / cancelled / unknown correctly reconstructed after restart |
| B2 | Reconcile ambiguous CLI outcomes and close Issue #17 | `lib/cli.js`, `lib/workflow.js`, CLI tests | bounded termination, no orphan children, no blind duplicate create |
| B3 | Trace / manifest size limits and bounded API responses | `index.js`, `lib/api.js` | size boundaries tested; large input does not cause unbounded memory growth |
| B4 | Submission history and workflow-state clarity | `client.js`, presentation helpers | provisional/final/failed/closed states clearly distinguished |

**B1 design requirements**
- Persist task identity and child session ID.
- Reconstruct state from durable DSH events / projections.
- Keep live process information as an optimization, not the source of truth.
- Add a reconciliation action for unknown tasks.
- Never auto-retry an unknown task without checking whether the child is still active or has already produced artifacts.

**B2 design requirements**
- Test POSIX process groups and Windows process trees inside the supported DSH runtime.
- Check an already-aborted signal before spawning.
- Preserve CLI output and attempt identifiers without leaking secrets.
- Treat create timeout as an ambiguous outcome until the platform is queried.
- Close [Issue #17](https://github.com/tjyyy3/dsh-playground/issues/17) only after its remaining acceptance criteria are demonstrated.

### Track C — P1 participant experience and agent collaboration

| PR | Scope | Acceptance |
|---|---|---|
| C1 | Task board grouped by challenge and lifecycle | tasks map to child sessions and can be reopened |
| C2 | Session / TODO association and daily done list | TODO completion creates a durable completion record |
| C3 | Cancel, retry and reassign controls | host-supported actions are confirmed and idempotent |
| C4 | Evidence-based task review | diff, tests and artifacts shown separately from agent claims |
| C5 | Bounded parallelism and task dependencies | no unbounded fan-out; dependencies block / unblock predictably |
| C6 | Artifact registry | each artifact has producer task, path, hash and review status |

Do not implement cancel / retry UI until the corresponding DSH host operations and semantics are confirmed.

### Track D — P2 maintainability

| PR | Scope | Rule |
|---|---|---|
| D1 | Extract file access and material loading | no behavior change beyond separately reviewed security fix |
| D2 | Extract submission policy / authorization | pure policy logic separated from host adapters |
| D3 | Extract controller lifecycle store | preserve projection compatibility or provide migration |
| D4 | Split workbench components by page and domain | no visual redesign bundled with structural refactor |
| D5 | Split API / CLI adapters | retain public exports and contract tests |

Avoid a one-shot rewrite. Each extraction should be small, testable and behavior-preserving.

### Track E — P2/P3 business expansion

| PR | Scope | Preconditions |
|---|---|---|
| E1 | Author workflow discovery and UX spec | verify official CLI/API support and permissions |
| E2 | Author package preflight and preview | E1 contract confirmed |
| E3 | Author upload with explicit confirmation and receipt | reuse safe file snapshot and authorization primitives |
| E4 | Evaluation-set management | platform contract confirmed |
| E5 | Organizer competition listing and detail | ownership / permission contract confirmed |
| E6 | Competition creation and metadata editing | write API and validation contract confirmed |
| E7 | Challenge membership and season management | permission / lifecycle rules confirmed |
| E8 | Discussion and sharing | official endpoints and moderation constraints confirmed |

## 3. Cross-cutting test matrix

### Security
- Workspace traversal and symlink escape.
- External file grant scope, expiry and replay.
- File mutation between inspection, approval and upload.
- Agent-supplied fake consent.
- Token never sent to non-HTTPS external hosts.
- Secret redaction in errors and logs.
- Malformed ZIP metadata and archive edge cases.

### Reliability
- CLI spawn failure, timeout, cancellation and process-tree cleanup.
- Platform created attempt but upload failed.
- Platform accepted upload but client lost response.
- DSH restart during child execution and during submission.
- Duplicate tool calls / double-click confirmation.
- Stale approval, changed identity and changed API base.
- Missing / delayed / duplicated child notifications.

### Compatibility
- Windows and macOS.
- Node versions supported by the DSH host.
- Current supported Playground CLI version and one documented older supported version, if backward compatibility is intended.
- Real DSH host smoke tests for session projections, approval and child-agent lifecycle.

### Product acceptance
- Participant: discover → work → validate → authorize → submit → score.
- Author: prepare → preflight → preview → authorize upload → verify published result.
- Organizer: list → create / edit → manage challenge membership → verify lifecycle.
- Agent collaboration: dispatch → observe → inspect evidence → review → archive.

## 4. Release gates

A release candidate should not be considered ready until:
- All P0 security findings are fixed or explicitly accepted with documented mitigations.
- P1 reliability tests pass on Windows and macOS.
- The latest GitHub Actions matrix passes.
- Real DSH host acceptance is recorded for workflows depending on host semantics.
- README documents supported DSH / Node / CLI versions and known limitations.
- No automated retry can create a duplicate submission after an ambiguous result.

## 5. Immediate next actions

1. Confirm DSH's user-message provenance and approval APIs (A3 discovery).
2. Implement workspace path containment and external-file grant design (A1).
3. Design immutable material snapshots before changing CLI upload behavior (A2).
4. Add bounded trace / manifest and API response handling (B3 can be parallel after interfaces are agreed).
5. Reproduce remaining Issue #17 cases in real DSH.
6. Only then start task lifecycle persistence and the participant task board.

## 6. Status tracking

Update this table as PRs are opened and merged.

| Item | Status | PR / Issue | Notes |
|---|---|---|---|
| A1 workspace file boundary | Planned | — | External file authorization design required |
| A2 immutable material snapshot | Planned | — | CLI currently consumes paths |
| A3 authorization provenance | Needs DSH validation | — | Host capability is not established by repository source |
| A4 HTTPS policy | Planned | — | Preserve local development support safely |
| B1 controller lifecycle persistence | Planned | — | Current live map is process-local |
| B2 CLI cancellation / ambiguity | Needs reproduction | [#17](https://github.com/tjyyy3/dsh-playground/issues/17) | Issue remains open |
| B3 resource bounds | Planned | — | Trace, manifest, API response |
| C1-C6 collaboration improvements | Planned | — | Depends on B1 |
| E1-E8 author / organizer / community | Discovery | — | Verify official platform contracts first |
