# Playground Product Roadmap

> Decisions synchronized: 2026-11-19  
> Source-review baseline: `a6c88d5c65a1e95bb02cbb36ae3910111e143eaf`  
> Product centre: Playground competitions and the workflows around participating, authoring and organizing them.  
> Status: agreed items and remaining candidates are separated below. Implementation and verification status is tracked per issue. Later candidates require separate product review and are not prerequisites for the submission redesign.

Near-term scope and acceptance are tracked in [#73](https://github.com/tjyyy3/dsh-playground/issues/73), [#74](https://github.com/tjyyy3/dsh-playground/issues/74), [#75](https://github.com/tjyyy3/dsh-playground/issues/75), [#76](https://github.com/tjyyy3/dsh-playground/issues/76), [#77](https://github.com/tjyyy3/dsh-playground/issues/77), [#17](https://github.com/tjyyy3/dsh-playground/issues/17), [#78](https://github.com/tjyyy3/dsh-playground/issues/78) and [#81](https://github.com/tjyyy3/dsh-playground/issues/81). Implementation status is recorded in the linked issues and PRs; updating this roadmap does not itself ship a feature.

## 1. Product direction

The plugin should make Playground workflows usable from DSH while keeping its responsibilities tied to competition tasks.

The agreed participant submission entry point is a button, or an explicit request in the current task conversation. It sends one submission request to that task's existing Agent. The Agent follows the challenge and platform's official requirements, chooses a supported CLI or API route, and performs the necessary material preparation and checks. The plugin passes task context and material references, associates a real attempt ID with the task, and shows platform progress and results.

The primary user journeys are:

1. **Participant:** discover a challenge → understand requirements → work with one or more agents → explicitly request submission → the current task Agent follows the official submission process → associate the attempt ID → follow scoring and history.
2. **Author, candidate direction:** prepare a task package → validate task metadata and evaluation assets → preview the package → authorize upload → inspect the published task.
3. **Organizer, candidate direction:** create and configure a competition → manage seasons and challenge membership → monitor participation and results → manage lifecycle within platform permissions.

Agent orchestration supports these journeys through existing DSH capabilities. It should remain grounded in a Playground task or competition context. Author and organizer workflows require their own product review and verified platform contracts.

## 2. Product principles

- **User control:** an ordinary submission needs one explicit user request or button action. Only the already-agreed quota-sensitive cases need additional confirmation. Preparing materials or finishing a solution does not authorize submission. A model-provided Boolean or an approval result without a verified human source must not be labelled as verified user consent.
- **Official submission requirements:** the current task Agent chooses the official CLI/API route and necessary preparation, packaging and checks. The plugin does not impose a separate mandatory dry-run, check card, material snapshot or second ordinary confirmation.
- **Evidence over claims:** use evidence appropriate to the operation, including platform receipts and, where relevant, tests, diffs and artifacts. An Agent execution ending does not establish that a submission was accepted or scored successfully.
- **Task continuity:** preserve the correct task, workspace, account, material references and existing attempt information. Reuse the existing task conversation. Preserve known evidence across restarts and show unknown when reliable evidence is unavailable.
- **Safe workspace access:** ordinary task materials inside the workspace are the default. External-file grants use the agreed hybrid policy: one logical operation by default, with optional user-selected reuse within the task, scoped by path and purpose and subject to revocation and expiry. Reading permission does not authorize upload. This policy governs the plugin's actual retained file handling and handoff; it does not make the plugin a sandbox for every Agent tool.
- **Proportionate resource protection:** remove redundant whole-file loading from submission handoff. Protect the API responses the plugin still reads with an appropriate byte budget before full decoding/parsing, as scoped in #78. This is a client resource safeguard, not a competition-material size rule.
- **Competition-native concepts:** distinguish competition, season, challenge, task, child task, artifact, submission and score.
- **Incremental delivery:** deliver independently reviewable changes with evidence for the affected behavior. Later authoring, organizer and collaboration features do not block the agreed submission redesign.

## 3. Product areas

### A. Participant experience

**Existing foundation at the review baseline**

- Challenge discovery, filtering and detail.
- Competition / season discovery.
- Personal and public submission lookup, including per-challenge history with time ordering, identity and current-conversation association markers.
- Task conversations, attempt association and score tracking. Current displays already distinguish reference/final scores, a bundle not uploaded, and an attempt closed by the platform.
- Challenge rules and resources in detail views; submission counts and known limits, with their sources and incomplete-data notices, in submission history.
- Legacy material checks, confirmation cards and plugin-operated submission paths. These are being replaced under #74/#75; they are not requirements to preserve in the new participant flow.

**Agreed near-term changes**

- One submission request goes to the correct existing task Agent, with the task, workspace, account, material references and known attempt context. Repeated clicks must not create parallel duplicate requests.
- The Agent follows official CLI or API requirements. The plugin's old uploader and fallback must not also submit in parallel.
- Submission handoff does not load or parse trace, manifest or ZIP contents, create material hashes/snapshots, or run ZIP summary/layout inspection. Do not restore those reads merely to populate UI statistics. Use official receipt data when it supplies the needed information.
- Remove the plugin's old 200 MiB ZIP gate from handoff and do not replace it with new universal trace/manifest limits. Report actual official errors and preserve any attempt ID already obtained.
- Distinguish request dispatched, attempt created, upload/result uncertainty, scoring and final platform result. Query an ambiguous outcome before another create operation; cancellation does not undo a platform write that already happened.
- Preserve the existing history, score explanations and known quota information during migration. Replace instructions that still send users through checks/cards. Known challenge limits must remain usable without a retired preparation card; retain their provenance and the agreed quota-sensitive confirmation rules under #74.

**Candidate follow-ups**

- Additional task-specific filtering or grouping within the existing per-challenge submission history. Correct new-submission versus retransmission behavior belongs to #74; a separate history of each retransmission would need its own product decision.
- Compare multiple attempts or scorecard changes over time. Per-attempt totals and details already exist; define whether users need two-attempt comparison, scorecard evolution, or both before designing any additional storage.
- Make existing challenge rules, known submission limits and resource information easier to reach while working in a task.

Baseline references: [submission history and association markers](https://github.com/tjyyy3/dsh-playground/blob/a6c88d5c65a1e95bb02cbb36ae3910111e143eaf/client.js#L1158-L1257), [existing score/status explanations](https://github.com/tjyyy3/dsh-playground/blob/a6c88d5c65a1e95bb02cbb36ae3910111e143eaf/client.js#L149-L270), and [the statement-limit dependency on the old prepared event](https://github.com/tjyyy3/dsh-playground/blob/a6c88d5c65a1e95bb02cbb36ae3910111e143eaf/lib/workflow.js#L192-L197). These are source-review findings, not a new runtime verification.

The participant flow has no mandatory plugin-owned "Validate → Awaiting confirmation" stage between a user's ordinary submit request and Agent execution. An Agent may still perform checks required by the official workflow or needed to diagnose a concrete problem.

### B. Agent-assisted execution

**Existing foundation at the review baseline**

- Workspace controller and challenge handoff.
- Native Codex delegation with DSH subagent fallback guidance.
- A controller child-task list with observed state, persisted result notices, result details and native child-session links where supported.
- Separate challenge task conversations, their task overview, and controller conversations. These are existing views of different kinds of records.

**Agreed near-term reliability work**

- Under #77, preserve the structured end reason supplied by DSH in existing result projections, with compatibility for historical notices that lack it.
- Reuse existing DSH records and supported passive state reads where available. Distinguish frontend refresh, plugin recreation and Host restart, and verify the target DSH version's capabilities.
- Treat an old result as historical evidence when it cannot be reliably associated with the current execution. A missing notification or a non-running process is not proof of success or failure.
- Preserve unknown when evidence is insufficient. State inspection must not wake the Agent or automatically repeat its work. No new task database or recovery action is required for this change.

**Agreed task organization — #81**

Within the selected workspace's controller task list, organize tasks by challenge. Opening a challenge shows which Agents are working on it, each task's execution state, existing results and the conversations that can actually be opened.

- Keep multiple execution tasks for the same challenge distinct, including their results and session context.
- Establish explicit challenge association for new tasks using existing platform/challenge identities and supported DSH records. The current child-task rows have no structured challenge ID; verify the smallest reliable addition rather than inferring ownership from labels, timing or the most recent challenge handoff.
- Keep historical or other unassociated tasks visible in an explicitly unassociated area. Preserve the existing maintenance category and workspace/controller boundaries.
- Reuse existing result displays and session links. Where a provider supplies no usable address, keep the available result readable.
- Browsing groups and results remains passive. Reuse #77 state evidence and keep it distinct from #74 platform submission/scoring status.

This approved scope is tracked in [#81](https://github.com/tjyyy3/dsh-playground/issues/81). It uses existing task/session records with the necessary association information; TODOs, new task actions, scheduling, artifacts and review remain separate candidates.

**Candidate follow-ups**

1. Further session-link and task-association improvements beyond #81, where providers expose usable addresses.
2. Explicit cancel / retry / reassign controls, subject to DSH host support and verified semantics.
3. Task dependencies and bounded parallelism.
4. Artifact collection and provenance.
5. Evidence-based completion review: Git diff, tests, lint, type checks and required output files where relevant to the task.
6. Human review for code merging or other tasks that require it. For ordinary competition submission, the explicit submit request remains the user action; this does not add another universal review step.

Baseline references: [existing controller list, details and session links](https://github.com/tjyyy3/dsh-playground/blob/a6c88d5c65a1e95bb02cbb36ae3910111e143eaf/client.js#L1818-L1885), [current child-task row fields](https://github.com/tjyyy3/dsh-playground/blob/a6c88d5c65a1e95bb02cbb36ae3910111e143eaf/lib/controller.js#L274-L310), and [the separate task overview's session selection](https://github.com/tjyyy3/dsh-playground/blob/a6c88d5c65a1e95bb02cbb36ae3910111e143eaf/client.js#L1345-L1355). #77 preserves state evidence; #81 adds the approved challenge grouping. TODOs and new task actions remain separate candidates.

**Suggested task lifecycle, pending product review**

`created → queued → running → awaiting_review → completed`

Alternative states: `failed`, `cancelled`, `blocked`, `unknown`.

`awaiting_review` is optional for tasks that need a separate review; it is not a required stage for every submission. Completion labels must describe the verified task outcome, rather than being inferred from a missing process or notification. An Agent's execution status and the platform's submission/scoring status remain separate.

### C. Author workflow

The author workflow is a candidate direction separate from participant submission. It may reuse retained identity, file-access authorization and receipt capabilities, but its domain rules and UI need their own review. Do not assume that participant check cards, ZIP inspection or an immutable snapshot service will be available as shared infrastructure.

**Proposed first release**

- Author task creation / selection.
- Local task-package preflight.
- Metadata and required-file validation.
- Package generation and preview.
- Evaluation-set upload where official tooling supports it.
- Explicit upload confirmation and receipt.
- Published task status lookup.

**Later**

- Task revisions and version history.
- Evaluation-set management.
- Batch task creation.
- Dry-run / preview of grader configuration.
- Regression checks against sample solutions.

Before implementation, verify supported official CLI/API operations, versions and permissions. Do not infer undocumented write endpoints from website behavior. These candidate authoring checks are not prerequisites for participant submission.

### D. Organizer workflow

**Proposed first release**

- List competitions owned or manageable by the current account.
- Read competition details and lifecycle.
- Create a competition if supported by an official API / CLI.
- Edit metadata and dates.
- Add or remove challenge membership.
- View competition challenge list and public results.

**Later**

- Season and round management.
- Participant / team overview.
- Leaderboards by competition type.
- Organizer reports and exports.
- Co-organizer permissions.
- Start / end / archive actions with explicit permission checks and confirmation.

These remain candidate workflows. Permission-sensitive lifecycle actions require a documented platform authorization model before implementation.

### E. Discussion and community

Later opportunities:

- Browse topic discussions.
- Search community posts.
- Create a post or reply with explicit confirmation.
- Challenge comments, once official API support is verified.
- Skills and solution sharing.

Discussion is lower priority than participant, author and organizer workflows. No community feature is included in the current submission and reliability issues.

## 4. Shared platform capabilities

Reuse existing capabilities where they meet the actual workflow's needs. This table does not require a separate service or new persistence layer for every row.

| Capability | Responsibility and scope |
|---|---|
| Identity and task context | Keep the intended account, challenge, workspace and existing task conversation consistent; verify returned attempt ownership through the retained tracking path |
| Authorization integration | Apply file-use and submission-intent rules within plugin-controlled actions; describe what the target host can verify and do not equate automatic approval with human consent |
| File access and references | Apply #73 hybrid grants to actual retained file handling and material references; do not restore full-file preparation removed by #75 |
| Submission handoff | Send one request to the current task Agent, which chooses the official CLI/API process; retire the parallel plugin uploader under #74 |
| API client | Keep plugin read/query operations; enforce remote HTTPS with the documented local-development exception (#76), and bounded response consumption (#78) |
| CLI runner | Handle arguments, timeouts and cancellation for processes the plugin itself starts, including retained login and version/update checks; track the Windows limitation in #17 without claiming control over all Agent terminal processes |
| Task projections and observation | Reuse DSH identity, persisted notices and supported state information; preserve end reasons and retain unknown where appropriate (#77) |
| Artifact registry, candidate | Record producing task, references and review evidence if separately approved; do not make whole-file hashing or a registry a prerequisite for submission |
| Receipts and result tracking | Associate actual attempt IDs, report platform state and preserve evidence needed to investigate ambiguous outcomes (#74) |
| Audit evidence | Reuse appropriate host events and operation records without secrets; distinguish observed user interaction, configured approval outcomes and unverified claims |

## 5. Suggested workbench information architecture

Keep the existing top-level Playground areas, but clarify the task context:

- **赛题:** browse challenges, competitions and seasons.
- **工作:** current challenge tasks, controller, child agents, TODOs and artifacts.
- **提交:** attempts, scorecards, quota and submission receipts.
- **出题:** authoring and task-package workflow.
- **比赛管理:** organizer workflows.
- **连接设置:** account identity, CLI status and connection configuration.

This remains a proposed information architecture. Add authoring, organizer or other new navigation only when its workflow has been reviewed and is ready; do not add every tab as part of the current issue set.

## 6. Prioritization

The linked issues define agreed near-term scope and acceptance. Candidate priorities below remain proposals, not instructions to implement the entire roadmap. #74 and #75 may be delivered together with separate acceptance evidence; no material-snapshot project is a prerequisite.

| Priority | Capability | Status / purpose |
|---|---|---|
| P0 | File-use authorization and explicit submission handoff | Agreed: #73 / #74; protect the intended scope and user request |
| P1 | Retire redundant material processing and ZIP inspection | Agreed: #75, coordinated with #74 |
| P1 | HTTPS for the plugin's remote API requests | Implemented via merged #80; #76 closed. Merge status verified; not independently rerun in this document review |
| P1 | Preserve end reasons and recover supported task evidence | Agreed: #77; keep unknown honest |
| P1 | Remaining Windows CLI cleanup and host cancellation boundaries | Agreed: #17; limited to retained plugin-launched processes |
| P2 | Bounded API response consumption | Agreed: #78; protect plugin resources without setting material limits |
| P1 | Participant history and workflow-state clarity | Core receipts in #74; further history UI remains a candidate |
| P1 | Challenge-grouped tasks, results and existing conversation entry points | Agreed: #81; establish reliable association and preserve existing records |
| P1 | Further session integration and cancel / retry | Candidate; confirm host-supported operations before adding controls |
| P1 | Evidence-based completion review | Candidate; match evidence to the task |
| P2 | Artifact registry and Worktree isolation | Candidate; improve parallel work and review |
| P2 | Author workflow MVP | Candidate; verify official contracts and review product scope |
| P3 | Organizer workflow MVP | Candidate; verify permissions and lifecycle contracts |
| P3 | Discussion, sharing and advanced reports | Candidate; lower-priority community features |

## 7. Success measures

Measure product outcomes rather than number of tools:

- Percentage of ordinary submission requests handed to the correct existing task conversation with one user action.
- Submission duplicate rate and ambiguous-outcome recovery rate, with actual platform receipts as evidence.
- Percentage of task status displays supported by available DSH evidence, and preservation of known end reasons across reload/restart.
- Unknown task states reported separately and accurately; do not improve a completion metric by guessing a terminal state.
- Percentage of Agent completion claims backed by the appropriate test / diff / artifact / platform evidence when those review capabilities are available.
- Time from challenge selection to a usable deliverable and to a traceable submission.
- For future authoring and organizer features: package-preflight outcomes and actions completed without permission or lifecycle errors.
- User-reported confusion around task state, identity and submission authorization.
