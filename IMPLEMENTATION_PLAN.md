# Implementation Plan

> Updated decisions: 2026-11-19. Source baseline: `a6c88d5c65a1e95bb02cbb36ae3910111e143eaf`.  
> Status: current issue scopes replace the earlier snapshot/check-card plan. This document does not implement the fixes.  
> Working rule: each PR needs a clear primary behavior change and reviewable evidence; coordinated #74/#75 work may share one PR.

## 1. Delivery strategy

Implement the agreed issues without first rewriting `index.js`, `client.js` or `lib/workflow.js`. Identify which calls survive the handoff migration before extracting reusable modules. Do not modularize obsolete readers/uploaders merely to preserve them.

An implementation PR should explain:

- The concrete problem, evidence, intended behavior and affected functions.
- Meaningful tests for the change and its retained protections.
- Actual DSH/Windows observations when a conclusion depends on the host, with unverified cases identified.
- Compatibility or migration effects, including user/tool documentation that must change.

The baseline still contains the old flow. Update outdated `AGENTS.md`, README, tool guidance and UI text alongside the relevant implementation. Do not claim the new behavior shipped because planning documents changed. A documentation-only alignment needs content/diff verification, not a claim of new runtime test results.

## 2. Issue work and PR sequence

The labels below organize scope, not one mandatory PR per row. A2 and A3 belong to the same #74 migration. Tracks C-E retain candidate work for further review.

### Track A — Submission handoff, authorization and transport

| Item | Scope | Main areas | Acceptance source |
|---|---|---|---|
| A1 | Hybrid external-material authorization for retained plugin operations/references | paths, actual file access, host interaction | [#73](https://github.com/tjyyy3/dsh-playground/issues/73) |
| A2 | Send submit requests to the existing task Agent; retire plugin upload; track real attempt IDs | client, tool/command entries, workflow, guidance | [#74](https://github.com/tjyyy3/dsh-playground/issues/74), AUD-002 |
| A3 | Apply AUD-003 investigation to that same migration | quota rules, old entry points, supported user interactions | [#74](https://github.com/tjyyy3/dsh-playground/issues/74), AUD-003 |
| A4 | Remote HTTPS with the documented local HTTP exception | API client, settings/docs, fake-fetch tests | [#76](https://github.com/tjyyy3/dsh-playground/issues/76) |

**A1 requirements**

- Apply canonical/path-component checks to registered workspaces and targets, including symlinks, junctions, missing targets and Windows semantics.
- Default external grants to one logical operation; task-session reuse requires the user's choice, explicit scope/purpose, revocation and expiry.
- Separate reading permission from submitting, and material access from credential-store access.
- Apply policy only to actual retained operations and references. Do not restore scans or snapshots, or claim a sandbox for all Agent tools.

**A2/A3 requirements**

- One ordinary click or explicit request hands off once to the current task's existing Agent, without creating an unrequested session or switching challenge/account.
- Let the Agent choose official CLI/API steps, including necessary preparation/checks. No mandatory plugin dry-run, independent check card, old approval ID or second ordinary confirmation.
- Retire tools/commands and fallback upload paths as well as the visible old UI. Agent API use must not reactivate the plugin uploader.
- Preserve agreed quota exceptions. The reported local tests already showed Boolean-only fake submission and automatic `allowed-once`; neither proves human consent. Record the actual supported interaction and enforcement boundary.
- Pass the correct task, workspace, expected account, material references and known attempt context. Track actual returned IDs with existing ownership checks.
- Distinguish dispatch, creation, upload, scoring, failure and unknown results; query ambiguous outcomes before another create. Preserve known IDs.
- The old immutable-snapshot project is superseded. Any retained claim about a checked material version still requires matching evidence, but the handoff does not add full-file hashes or copies.

### Track B — Reliability and removal of redundant work

| Item | Scope | Main areas | Acceptance source |
|---|---|---|---|
| B1 | Preserve settlement reasons; reuse supported DSH evidence for state | controller projection, observers, task display | [#77](https://github.com/tjyyy3/dsh-playground/issues/77), AUD-006 |
| B2 | Remaining Windows descendant cleanup for plugin-created processes | CLI runner, Windows fixtures, host validation | [#17](https://github.com/tjyyy3/dsh-playground/issues/17), AUD-007 |
| B3 | Remove full material reads, hashes/conversions, ZIP inspection and plugin material gates | obsolete preparation/readers, related UI/tests | [#75](https://github.com/tjyyy3/dsh-playground/issues/75), AUD-004/AUD-009 |
| B4 | Additional history/comparison UI beyond #74 result clarity | presentation/UI | Candidate; separate product review |
| B5 | Byte-budgeted reads of retained plugin API responses | API request layer, fake-stream tests | [#78](https://github.com/tjyyy3/dsh-playground/issues/78), AUD-008 |

**B1 requirements**

- Preserve optional structured `stopReason` in existing persistent notices, compatibly with old records. Reuse supported passive reads; do not wake an Agent to inspect state.
- A previous result does not prove a new run completed; missing or non-running processes do not prove success. Keep unknown explicit and do not automatically redispatch.
- Verify native/external provider differences and actual host versions. No new database or mandatory recovery action is required.

**B2 requirements**

- Preserve existing pre-abort, POSIX escalation, Windows live-root cleanup, bounded waits and normal-exit behavior.
- Target new evidence at Windows roots exiting before descendants and applicable real-host lifecycle behavior. A returned call is not proof all descendants stopped.
- Inventory retained login and shared CLI update/version calls; the shared update has its own timeout, not necessarily one UI request's cancellation.
- Keep unresolved limits tracked. #74 owns submission-result reconciliation; do not add another uploader/retry system or supervise every Agent terminal process.

**B3/B5 requirements**

- Coordinate B3 with A2/A3: handoff must not depend on old `inspect`, trace/manifest/ZIP loading, repeated hashes/counts, Blob/Buffer preparation or copies.
- Remove the 200 MiB ZIP gate without new trace/manifest caps or archive scanners. Historical summaries must not reread files or imply that current materials were checked.
- Verify actual independent uses before deleting helpers. Future author workflows need their own contract; external Worker security testing is not a prerequisite for this participant migration.
- B5 protects response bytes rather than submitted materials. Cover actual streamed bytes, successful/error bodies, cleanup and precise errors while retaining timeouts/cancellation. Justify budgets from normal API needs; test with small fake streams.

**Ordering and coordination**

1. #74 and #75 should be designed together and may share a PR. Coordinate #73 with their surviving path/reference interfaces.
2. #76, #77, #17 and #78 can proceed independently when scope is clear. Coordinate #76/#78 edits in the API layer.
3. These fixes do not wait for a snapshot design, every product feature, or documentation PR #72 to merge.
4. Keep code-unit results, isolated-host observations and actual target-host acceptance distinguishable.

### Track C — Participant and Agent collaboration candidates

These rows require further product review and do not automatically become tasks in the current issue set.

| Item | Candidate scope | Question to resolve |
|---|---|---|
| C1 | Task board grouped by challenge/state | which existing views need an additional board? |
| C2 | Session/TODO association and daily done list | what creates a durable done record and what can be edited? |
| C3 | Cancel, retry and reassign controls | which target DSH/provider actions exist and what do they guarantee? |
| C4 | Evidence-based task review | what evidence helps without adding a universal submission gate? |
| C5 | Bounded parallelism and dependencies | which limits and dependency behavior do actual workflows need? |
| C6 | Artifact registry and optional Worktree isolation | which artifact identities/conflicts justify the added infrastructure? |

#74 already owns essential submission-result clarity; B4/C4 must not duplicate it. Unknown is valid, and cancel/retry UI needs verified host semantics.

### Track D — Incremental file splitting

Keep file splitting in the engineering plan, after the responsibilities of retained code are clear.

| Item | Candidate extraction | Boundary to preserve |
|---|---|---|
| D1 | Retained path access and material-reference handling | extract surviving behavior, not obsolete full readers |
| D2 | Submission intent/quota rules, Agent handoff and receipt tracking | separate policy from host adapters; no replacement uploader |
| D3 | Controller observers, projections and state presentation | preserve projection compatibility; no implied new task database |
| D4 | Workbench UI by page/domain | keep appearance and interactions stable during a structural PR |
| D5 | API request/response handling and plugin-owned CLI runner | preserve public contracts and tested cancellation/error behavior |

Use small, reviewable extractions. Do not combine a visual redesign, new product capability and broad structural rewrite. Create a module only when it clarifies a real responsibility; the table does not mandate a new service for every row.

### Track E — Author, organizer and community discovery

These are candidate business workflows, not current implementation commitments.

| Item | Candidate scope | Preconditions |
|---|---|---|
| E1 | Author workflow discovery and UX | official CLI/API support and permissions established |
| E2 | Author preflight/preview | actual author contract and need, separate from participant handoff |
| E3 | Author upload with explicit intent and receipt | reuse suitable grants/receipts; decide file processing without assuming a snapshot service |
| E4 | Evaluation-set management | platform contract established |
| E5 | Organizer competition listing/detail | ownership and permission contract established |
| E6 | Competition creation/metadata editing | official write and validation contract established |
| E7 | Challenge membership and seasons | lifecycle and permission rules established |
| E8 | Discussion/sharing | official endpoints and moderation constraints established |

Simplifying participant submission neither removes these candidates nor approves their implementation.

## 3. Focused verification matrix

### Authorization and migration

- Workspace/path/junction cases and hybrid grant scope, expiry, revocation and concurrent use.
- Correct existing task/session, account and references; ordinary one-action submission and agreed quota exceptions.
- Model consent or unattributed automatic approval is not recorded as verified human consent.
- Old card/tool/command/upload paths cannot independently submit after migration.
- Dispatch and historical UI do not reintroduce material reads, ZIP scans or extra material limits.
- Remote-HTTP/redirect restrictions and secret-free error/log handling.

### Reliability

- Duplicate clicks do not duplicate handoff; ID tracking is idempotent and ownership-checked.
- Known IDs survive upload failures; ambiguous results do not cause blind new attempts.
- Agent completion, platform acceptance and final scoring remain distinct.
- Old/new notices, structured reasons, reruns, missing evidence and provider differences.
- Plugin-owned CLI spawn/cancel/timeout and Windows root-exit descendants.
- API byte budgets, cleanup, timeout/cancel/overflow classification and legitimate large-response compatibility.

### Compatibility and host evidence

- Relevant Windows/macOS and supported DSH/Node paths; record actual versions.
- Official CLI/API behavior used by the changed feature, not an assumed universal route.
- Frontend refresh, plugin recreation, Host lifecycle and interaction provenance where applicable.
- Benign fake tasks and mocked responses cover most regressions; no real competition submission is required.

### Product acceptance

- Participant: discover/work → explicit submit intent → existing Agent follows official requirements → real attempt tracked → platform result displayed.
- Author/organizer/community: define acceptance when a candidate is selected for implementation.
- Structural refactors: preserve existing behavior and affected contracts.

## 4. Release and PR completion criteria

For the behavior actually changed:

- Meet the linked issue criteria and preserve affected existing protections.
- Run required offline/CI checks for runtime changes; record target-host evidence when needed.
- Document supported versions and actual limits without promising unverified host/platform guarantees.
- Keep unresolved items open and visible; opening a PR does not prove all issue conditions are complete.
- For this documentation alignment, verify the text, diff and issue links; do not claim new runtime test results.

Superseded snapshot, mandatory plugin material-cap and external Worker-audit prerequisites do not gate the new participant handoff.

## 5. Immediate next actions

1. Implement #74/#75 in coordinated increments, carrying #73's grants into actual retained boundaries.
2. Complete focused fixes in #76, #77, #17 and #78, coordinating shared files.
3. Use the AUD-003 findings already recorded in #74 and investigate the remaining production boundary, rather than restarting the completed isolated investigation.
4. Review later product choices and file-splitting scope separately; open narrow issues for selected work.
5. Update the audit and status table as implementation lands, not merely when discussion concludes.

## 6. Status tracking

| Item | Status at this update | Issue | Remaining evidence |
|---|---|---|---|
| A1 hybrid policy | Agreed; implementation pending | [#73](https://github.com/tjyyy3/dsh-playground/issues/73) | retained-call integration and path/host tests |
| A2/A3 handoff and consent migration | Agreed; implementation pending | [#74](https://github.com/tjyyy3/dsh-playground/issues/74) | new-flow regression and actual interaction channel |
| B3 material/ZIP cleanup | Agreed; implementation pending | [#75](https://github.com/tjyyy3/dsh-playground/issues/75) | no-read handoff and historical compatibility |
| A4 HTTPS | Reviewed; implementation pending | [#76](https://github.com/tjyyy3/dsh-playground/issues/76) | destination/redirect/local-development tests |
| B1 settlement/state evidence | Reviewed; implementation pending | [#77](https://github.com/tjyyy3/dsh-playground/issues/77) | target host/provider capabilities and recreation |
| B2 remaining CLI cleanup | Scope corrected; Windows validation pending | [#17](https://github.com/tjyyy3/dsh-playground/issues/17) | descendants and host lifecycle |
| B5 API response budgets | Reviewed; implementation pending | [#78](https://github.com/tjyyy3/dsh-playground/issues/78) | budget choice, streams and caller behavior |
| B4/C1-C6 product extensions | Candidates; further review needed | — | product decisions and host semantics |
| D1-D5 file splitting | Candidate engineering plan | — | retained boundaries and chosen scope |
| E1-E8 author/organizer/community | Discovery candidates | — | official contracts, permissions and selection |

