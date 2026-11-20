# Implementation Plan

> Updated decisions: 2026-11-20. Source baseline: `a6c88d5c65a1e95bb02cbb36ae3910111e143eaf`.  
> Status: current issue scopes replace the earlier snapshot/check-card plan. Previously agreed fixes and challenge grouping have merged; remaining feature candidates require separate review. This document records scope and status, not new runtime verification.  
> Working rule: each PR needs a clear primary behavior change and reviewable evidence; coordinated #74/#75 work was delivered together in #88.

## 1. Delivery strategy

The previously agreed audit fixes and challenge grouping have merged. Build on their retained behavior without first rewriting `index.js`, `client.js` or `lib/workflow.js`. Identify surviving calls before extracting reusable modules. Do not recreate or modularize obsolete readers/uploaders merely to preserve them.

An implementation PR should explain:

- The concrete problem, evidence, intended behavior and affected functions.
- Meaningful tests for the change and its retained protections.
- Actual DSH/Windows observations when a conclusion depends on the host, with unverified cases identified.
- Compatibility or migration effects, including user/tool documentation that must change.

The historical source baseline contains the old flow; #88 replaces it. Keep `AGENTS.md`, README, tool guidance and UI text aligned with retained behavior in future changes. Do not claim a feature shipped merely because planning documents changed. A documentation-only alignment needs content/diff verification, not a claim of new runtime test results.

## 2. Issue work and PR sequence

Implementation progress checked on 2026-11-20 at main `4eb4e4b6d0c3611a80ebdf85398ec0f8b087edba`: [#80](https://github.com/tjyyy3/dsh-playground/pull/80), [#82](https://github.com/tjyyy3/dsh-playground/pull/82), [#83](https://github.com/tjyyy3/dsh-playground/pull/83), [#84](https://github.com/tjyyy3/dsh-playground/pull/84), [#86](https://github.com/tjyyy3/dsh-playground/pull/86), [#87](https://github.com/tjyyy3/dsh-playground/pull/87), [#88](https://github.com/tjyyy3/dsh-playground/pull/88) and [#89](https://github.com/tjyyy3/dsh-playground/pull/89) are merged. Issues #17, #73–#79, #81 and #85 are closed. This confirms repository status; this documentation review did not independently rerun implementation or target-host tests. The requirements below retain the accepted scope for future changes; they are not instructions to repeat closed implementation work.

The labels below organize scope, not one mandatory PR per row. A2 and A3 belong to the same #74 migration delivered in #88. Track C1 was delivered under #81/#89. C3 records the direction of reusing existing controller tools, with any local capability check handled through a direct prompt. C4 is removed as a standalone feature; C5-C6 and Tracks D-E retain candidate work for further review.

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
- Preserve existing per-challenge history, association markers, reference/final score explanations and quota information. Migrate the known statement-limit dependency on the old `prepared` event into retained task/context handling; keep source/unknown information and existing quota-sensitive confirmation rules without restoring cards or introducing a new statement parser. Replace outdated check-and-confirm recovery instructions.
- The old immutable-snapshot project is superseded. Any retained claim about a checked material version still requires matching evidence, but the handoff does not add full-file hashes or copies.

### Track B — Reliability and removal of redundant work

| Item | Scope | Main areas | Acceptance source |
|---|---|---|---|
| B1 | Preserve settlement reasons; reuse supported DSH evidence for state | controller projection, observers, task display | [#77](https://github.com/tjyyy3/dsh-playground/issues/77), AUD-006 |
| B2 | Windows descendant cleanup for plugin-created processes | CLI runner, Windows fixtures, host validation | [#17](https://github.com/tjyyy3/dsh-playground/issues/17), AUD-007 |
| B3 | Remove full material reads, hashes/conversions, ZIP inspection and plugin material gates | obsolete preparation/readers, related UI/tests | [#75](https://github.com/tjyyy3/dsh-playground/issues/75), AUD-004/AUD-009 |
| B4 | Additional task-history filtering/grouping or attempt comparisons beyond the existing history and score displays | presentation/UI | Candidate; separate product review; existing behavior migration belongs to #74 |
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

**Coordination to preserve after delivery**

1. #74/#75 were delivered together in #88. Preserve #73's grants at the surviving path/reference interfaces.
2. Keep the merged HTTPS, state-evidence, Windows cleanup and API response protections intact when changing shared code.
3. These fixes were independent of a snapshot project, later product candidates and documentation PR #72 merging.
4. Keep code-unit results, isolated-host observations and actual target-host acceptance distinguishable.

### Track C — Task organization and further collaboration

C1 was delivered in #89, closing #81. C3 is an agreed direction to reuse existing controller capabilities, with no new controls committed. C4 is removed as a standalone feature. C5-C6 remain candidates for separate product review; their item numbers are retained.

| Item | Scope | Status / implementation question |
|---|---|---|
| C1 | Group the existing controller task list by challenge; show each Agent task's state, results and supported session link | Delivered: [#89](https://github.com/tjyyy3/dsh-playground/pull/89), closing [#81](https://github.com/tjyyy3/dsh-playground/issues/81); preserve explicit challenge association and existing records |
| C3 | Reuse controller stop/message capabilities | Agreed direction; local availability is checked through a direct prompt, with no separate development task or button set committed |
| C5 | Bounded parallelism and dependencies | which limits and dependency behavior do actual workflows need? |
| C6 | Artifact registry and optional Worktree isolation | which artifact identities/conflicts justify the added infrastructure? |

**C1 requirements**

- Within the selected workspace/controller, preserve separate tasks for the same challenge and group them by reliable existing platform/challenge identity.
- Inspect the target DSH version's supported metadata and records. Add only the association information needed for new tasks; title matching, timing or the most recent handoff are not reliable association.
- Preserve old/unassociated tasks and results visibly, existing maintenance classification and session context. Avoid mixing unrelated top-level task conversations into controller child tasks.
- Reuse existing result displays and native session links. Provider records without a usable address remain readable without a fabricated link.
- Browsing/refreshing does not dispatch work, create sessions or submit. Reuse #77 state evidence; preserve unknown and distinguish it from #74 platform state.
- Verify same-challenge multiple tasks, different challenges, legacy records, workspace switches, association persistence, results and supported session opening with focused mock tests and actual DSH UI checks. No real competition submission is needed.

**C3: reuse existing capabilities**

The user will give local Codex a one-off prompt to check actual tool visibility, effective configuration and native/external provider boundaries. That local check does not need an issue, code PR or release milestone, and does not itself authorize configuration changes, adapter changes or new controls. Discuss an implementation only if the findings establish a concrete gap.

Preserve the difference between a stop request and observed termination, and between accepting a message and the child acting on it. The reviewed external Codex adapter has one execution and a terminal result, without a local child conversation or follow-up/resume; verify the installed adapter when answering a local capability question. A new delegation does not authorize competition submission.

**C4 disposition: no separate result-review feature**

Keep the existing result display and let the Agent choose the content, detail and organization of its report. The controller may ask for clarification when needed. Do not introduce a fixed three-part reporting template, reduce returned results to that template, or add a separate completion-review panel, review state or submission gate.

#74/#88 own essential submission-result clarity and preservation of existing history/score/quota behavior; B4 must not duplicate them. C1 uses existing controller tasks and supported session associations. Keep Agent reports, host execution state and official platform results distinguishable, and preserve unknown where reliable state evidence is unavailable.

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
- Task organization (#81): select workspace → open a challenge group → inspect separate Agent tasks, supported states and results → open an available existing conversation.
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

1. Build on the merged implementations recorded below. Do not reopen or reimplement closed work solely because an older planning paragraph still described it as pending.
2. Preserve the validation limits recorded in implementation PRs. The historical AUD-003 production-session bypass remains unproven; a documentation status update supplies no new production-path evidence.
3. Review C5-C6, further participant history, author/organizer/community choices and file-splitting scope separately. Handle one-off local capability questions through direct prompts; open narrow issues for agreed implementation work.
4. Keep the audit and status table aligned with repository delivery and actual evidence.

## 6. Status tracking

| Item | Status at this update | Issue / implementation | Evidence and limits |
|---|---|---|---|
| A1 hybrid policy | Merged; #73 closed | [#73](https://github.com/tjyyy3/dsh-playground/issues/73) / [#83](https://github.com/tjyyy3/dsh-playground/pull/83) | See implementation evidence for retained-call integration and path/host coverage |
| A2/A3 handoff and consent migration | Merged; #74 closed | [#74](https://github.com/tjyyy3/dsh-playground/issues/74) / [#88](https://github.com/tjyyy3/dsh-playground/pull/88) | Retain reported interaction-channel limits; the historical production bypass is not newly proven |
| B3 material/ZIP cleanup | Merged with A2/A3; #75 closed | [#75](https://github.com/tjyyy3/dsh-playground/issues/75) / [#88](https://github.com/tjyyy3/dsh-playground/pull/88) | See no-read handoff and historical-compatibility evidence in the implementation |
| A4 HTTPS | Merged; #76 closed | [#76](https://github.com/tjyyy3/dsh-playground/issues/76) / [#80](https://github.com/tjyyy3/dsh-playground/pull/80) | Preserve remote HTTPS and the documented local-development exception |
| B1 settlement/state evidence | Merged; #77 closed | [#77](https://github.com/tjyyy3/dsh-playground/issues/77) / [#84](https://github.com/tjyyy3/dsh-playground/pull/84) | Preserve host/provider evidence limits and unknown states |
| B2 Windows CLI cleanup | Merged with follow-up; #17/#85 closed | [#82](https://github.com/tjyyy3/dsh-playground/pull/82) / [#87](https://github.com/tjyyy3/dsh-playground/pull/87) | See reported Windows checks and lifecycle boundaries; no claim to supervise every Agent process |
| B5 API response budgets / credential-free bases | Merged; #78/#79 closed | [#86](https://github.com/tjyyy3/dsh-playground/pull/86) | Preserve response-byte budgets and secret-free base validation |
| C1 challenge-grouped task list | Merged; #81 closed | [#81](https://github.com/tjyyy3/dsh-playground/issues/81) / [#89](https://github.com/tjyyy3/dsh-playground/pull/89) | Preserve explicit association, legacy/workspace compatibility and supported session navigation |
| B4/C5-C6 product extensions | Candidates; further review needed | — | Product decisions and host semantics |
| D1-D5 file splitting | Candidate engineering plan | — | Retained boundaries and chosen scope |
| E1-E8 author/organizer/community | Discovery candidates | — | Official contracts, permissions and selection |

Merge/issue status above was verified during this documentation review. Implementation and target-host tests were not independently rerun; use the linked PRs for their reported evidence and remaining limits.
