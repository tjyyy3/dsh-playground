# Playground Product Roadmap

> Decisions synchronized: 2026-11-20  
> Source-review baseline: `a6c88d5c65a1e95bb02cbb36ae3910111e143eaf`  
> Product centre: Playground competitions and the workflows around participating, authoring and organizing them.  
> Status: agreed items and remaining candidates are separated below. Implementation and verification status is tracked per issue and summarized below. Later candidates require separate product review and are not prerequisites for the submission redesign.

Near-term scope and acceptance are tracked in [#73](https://github.com/tjyyy3/dsh-playground/issues/73), [#74](https://github.com/tjyyy3/dsh-playground/issues/74), [#75](https://github.com/tjyyy3/dsh-playground/issues/75), [#76](https://github.com/tjyyy3/dsh-playground/issues/76), [#77](https://github.com/tjyyy3/dsh-playground/issues/77), [#17](https://github.com/tjyyy3/dsh-playground/issues/17), [#78](https://github.com/tjyyy3/dsh-playground/issues/78) and [#81](https://github.com/tjyyy3/dsh-playground/issues/81). Implementation status is recorded in the linked issues and PRs; updating this roadmap does not itself ship a feature.

Repository status checked on 2026-11-20 at main `4eb4e4b6d0c3611a80ebdf85398ec0f8b087edba`: the linked audit implementations and challenge grouping are merged, as recorded in section 6. The source-review baseline above remains the historical evidence for the original findings. Merge status does not mean this documentation review independently reran implementation or target-host tests.

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
- **Truthful status:** distinguish Agent-reported results, host execution records and official platform receipts. An Agent execution ending does not establish that a submission was accepted or scored successfully.
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
- Legacy material checks, confirmation cards and plugin-operated submission paths existed at this baseline. They were retired by [#88](https://github.com/tjyyy3/dsh-playground/pull/88), closing #74/#75; they are not requirements to restore.

**Agreed submission behavior — implemented in #88**

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

<a id="account-count-summary-draft"></a>

**Current-account submission counts — selected for #95**

Use **only `GET /api/user-submissions`** to read the current signed-in platform account's submission history/counts. For the current challenge, show cumulative and today's submission counts when the returned data supports them; “today” keeps the existing Beijing calendar day. Remove confirmed-Agent aggregation, per-Agent rows and all-account combined totals from this scope. Keep the scope visible as “current account”; it says nothing about other accounts' submissions or any shared remaining quota. This supersedes the earlier per-account-plus-combined summary draft.

This is an explicit, selected behavior change within [#95](https://github.com/tjyyy3/dsh-playground/issues/95), alongside the shared overview extraction; #94 remains a behavior-preserving helper extraction. Do not fall back to `/me/attempts`, public author/challenge lists, or bulk attempt-detail reads to reconstruct these statistics. Retain current-identity reads and direct result/ownership queries for actual attempt IDs; retain verified task IDs, receipts and prior task history.

The [official frontend](https://play.bohrium.com/assets/index-Cpx9jxZK.js) uses `user-submissions` while signed in and reads fields such as `attemptId`, `challengeId` and `time`; its dashboard counts the returned array. That observation does not establish the authenticated response's account scope, completeness or quota semantics. During implementation, verify identity scope, field mapping, timestamp/timezone handling and any actual pagination/completeness contract. Match challenges by stable ID and count distinct attempt IDs. Do not treat a returned page/array length as a proven lifetime total. Missing fields, partial data or a failed read must remain incomplete/unknown or show a fetch error, rather than becoming a false zero.

Ordinary submission count is separate from quota consumption. Use quota information only when this same response provides reliable evidence; missing quota flags are unknown. Keep known statement limits and observed platform-limit responses on the existing confirmation path. The existing today-has-quota-use condition can use only reliable current-account data. Unknown statistics alone add no confirmation or blocking step, and do not justify a calculated “remaining N” value. Isolate cached statistics by platform/account/challenge and invalidate them after relevant tracked submissions or an identity change.

Baseline references: [submission history and association markers](https://github.com/tjyyy3/dsh-playground/blob/a6c88d5c65a1e95bb02cbb36ae3910111e143eaf/client.js#L1158-L1257), [existing score/status explanations](https://github.com/tjyyy3/dsh-playground/blob/a6c88d5c65a1e95bb02cbb36ae3910111e143eaf/client.js#L149-L270), and [the statement-limit dependency on the old prepared event](https://github.com/tjyyy3/dsh-playground/blob/a6c88d5c65a1e95bb02cbb36ae3910111e143eaf/lib/workflow.js#L192-L197). These are source-review findings, not a new runtime verification.

The participant flow has no mandatory plugin-owned "Validate → Awaiting confirmation" stage between a user's ordinary submit request and Agent execution. An Agent may still perform checks required by the official workflow or needed to diagnose a concrete problem.

### B. Agent-assisted execution

**Existing foundation at the review baseline**

- Workspace controller and challenge handoff.
- Native Codex delegation with DSH subagent fallback guidance.
- A controller child-task list with observed state, persisted result notices, result details and native child-session links where supported.
- Separate challenge task conversations, their task overview, and controller conversations. These are existing views of different kinds of records.

**Agreed reliability behavior — #77 implemented in #84**

- [#84](https://github.com/tjyyy3/dsh-playground/pull/84) implements #77's preservation of the structured end reason supplied by DSH in existing result projections, with compatibility for historical notices that lack it.
- Reuse existing DSH records and supported passive state reads where available. Distinguish frontend refresh, plugin recreation and Host restart, and verify the target DSH version's capabilities.
- Treat an old result as historical evidence when it cannot be reliably associated with the current execution. A missing notification or a non-running process is not proof of success or failure.
- Preserve unknown when evidence is insufficient. State inspection must not wake the Agent or automatically repeat its work. No new task database or recovery action is required for this change.

**Agreed task organization — #81 implemented in #89**

Within the selected workspace's controller task list, organize tasks by challenge. Opening a challenge shows which Agents are working on it, each task's execution state, existing results and the conversations that can actually be opened.

- Keep multiple execution tasks for the same challenge distinct, including their results and session context.
- Preserve explicit challenge association for new tasks using platform/challenge identities and supported DSH records. The original baseline lacked this association; [#89](https://github.com/tjyyy3/dsh-playground/pull/89) adds explicit task linking. Do not infer ownership from labels, timing or the most recent challenge handoff.
- Keep historical or other unassociated tasks visible in an explicitly unassociated area. Preserve the existing maintenance category and workspace/controller boundaries.
- Reuse existing result displays and session links. Where a provider supplies no usable address, keep the available result readable.
- Browsing groups and results remains passive. Reuse #77 state evidence and keep it distinct from #74 platform submission/scoring status.

This approved scope was delivered by [#89](https://github.com/tjyyy3/dsh-playground/pull/89), closing [#81](https://github.com/tjyyy3/dsh-playground/issues/81). It uses existing task/session records with the necessary association information. C3, C5 and C6 below record the direction of reusing existing controller, host and material-reference capabilities. Further task controls remain separate product decisions.

**Agreed control direction — C3**

Prefer the controller's existing DSH tools for stopping a task and relaying additional ideas, within the capabilities supported by the host and target provider. Additional stop/retry/reassign controls are not planned at this stage.

Keep request acceptance distinct from actual task termination or processing of a message. For a provider without follow-up input support, a message to the controller does not reach an already-running external execution. Starting a new execution does not authorize a competition submission.

**Candidate follow-up**

Further session-link and task-association improvements beyond #81, where providers expose usable addresses.

Baseline references: [existing controller list, details and session links](https://github.com/tjyyy3/dsh-playground/blob/a6c88d5c65a1e95bb02cbb36ae3910111e143eaf/client.js#L1818-L1885), [baseline child-task row fields](https://github.com/tjyyy3/dsh-playground/blob/a6c88d5c65a1e95bb02cbb36ae3910111e143eaf/lib/controller.js#L274-L310), and [the separate task overview's session selection](https://github.com/tjyyy3/dsh-playground/blob/a6c88d5c65a1e95bb02cbb36ae3910111e143eaf/client.js#L1345-L1355). #77/#84 preserve state evidence; #81/#89 deliver challenge grouping.

**Result presentation — C4 removed as a separate feature**

Keep the existing result display. Agents may organize their reports according to the task and include explanations, failures, alternatives or next steps; the controller can ask for clarification when needed. The plugin does not require a fixed three-part report or reduce returned results to those fields. No separate completion-review panel, review state or additional submission gate is planned under C4.

Retain the existing distinction between Agent execution status and the platform's submission/scoring status. Use available host and platform records for their respective states, and preserve unknown when evidence is insufficient. An Agent's report is not labelled as an independent plugin verification.

**Agreed task coordination — C5**

The controller coordinates task order and parallel work using existing DSH capabilities. Reuse the host's supported child-task capacity limits. No independent plugin queue or dependency scheduler is planned; natural-language task arrangements do not constitute program-enforced dependency rules.

**Agreed file organization — C6**

Reuse existing task results and authorized material references. The controller coordinates file assignments; executors may use separate directories or Git worktrees when appropriate. These choices organize working files and do not replace access authorization.

An independent artifact registry and automatic plugin-managed worktree creation, merging or cleanup are not planned. Do not restore material scanning, whole-file reading or hashing to populate a file inventory; material references do not certify a file's contents or version.

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
| CLI runner | Handle arguments, timeouts and cancellation for processes the plugin itself starts, including retained login and version/update checks; preserve the Windows cleanup delivered by #82/#87 for #17/#85 without claiming control over all Agent terminal processes |
| Task projections and observation | Reuse DSH identity, persisted notices and supported state information; preserve end reasons and retain unknown where appropriate (#77) |
| Receipts and result tracking | Associate actual attempt IDs, report platform state and preserve evidence needed to investigate ambiguous outcomes (#74) |
| Audit evidence | Reuse appropriate host events and operation records without secrets; distinguish observed user interaction, configured approval outcomes and unverified claims |

### Engineering structure

The [overall architecture draft in the implementation plan](IMPLEMENTATION_PLAN.md#overall-architecture-draft) records the agreed direction: one Host/Client package with feature-based modules, explicit state owners and gradual extraction behind existing interfaces. The first pure-policy/redaction extraction is scoped in [#94](https://github.com/tjyyy3/dsh-playground/issues/94). [#95](https://github.com/tjyyy3/dsh-playground/issues/95) combines task creation/binding, submission handoff, receipt tracking and their shared overview reader into one work item, normally one implementation PR after #94. It also includes the explicitly selected current-account `/api/user-submissions` history/count simplification above; other behavior remains unchanged. Both scopes remain pending implementation. Remaining module placement and migration scopes stay under review; separate modules do not require separate issues. The draft maps current code to target locations and records the Client bundle/publishing contract. Apart from that selected statistics change, it does not approve additional product features, navigation or runtime changes. The product areas above describe user workflows; they do not mandate one new service or directory per area.

## 5. Suggested workbench information architecture

Keep the existing top-level Playground areas, but clarify the task context:

- **赛题:** browse challenges, competitions and seasons.
- **工作:** current challenge tasks, controller, child agents, existing results and material references.
- **提交:** attempts, scorecards, quota and submission receipts.
- **出题:** authoring and task-package workflow.
- **比赛管理:** organizer workflows.
- **连接设置:** account identity, CLI status and connection configuration.

This remains a proposed information architecture. Add authoring, organizer or other new navigation only when its workflow has been reviewed and is ready; do not add every tab as part of the current issue set.

## 6. Prioritization

The linked issues define agreed scope and acceptance. Candidate priorities below remain proposals, not instructions to implement the entire roadmap. #74 and #75 were delivered together in #88; their acceptance scopes remain distinct. No material-snapshot project is a prerequisite.

| Priority | Capability | Status / purpose |
|---|---|---|
| P0 | File-use authorization and explicit submission handoff | #73 delivered in [#83](https://github.com/tjyyy3/dsh-playground/pull/83); #74 delivered in [#88](https://github.com/tjyyy3/dsh-playground/pull/88); both issues closed |
| P1 | Retire redundant material processing and ZIP inspection | #75 delivered with #74 in [#88](https://github.com/tjyyy3/dsh-playground/pull/88); issue closed |
| P1 | HTTPS for the plugin's remote API requests | [#80](https://github.com/tjyyy3/dsh-playground/pull/80) merged; #76 closed |
| P1 | Preserve end reasons and recover supported task evidence | [#84](https://github.com/tjyyy3/dsh-playground/pull/84) merged; #77 closed; preserve documented host/provider limits |
| P1 | Windows CLI cleanup and host cancellation boundaries | [#82](https://github.com/tjyyy3/dsh-playground/pull/82) and follow-up [#87](https://github.com/tjyyy3/dsh-playground/pull/87) merged; #17/#85 closed; limited to plugin-launched processes |
| P2 | Bounded API response consumption and credential-free bases | [#86](https://github.com/tjyyy3/dsh-playground/pull/86) merged; #78/#79 closed; response safeguards do not set material limits |
| P1 | Participant history and workflow-state clarity | Core receipt migration delivered in #88; current-account history/counts from `/api/user-submissions` selected in #95, pending implementation; other history UI remains a candidate |
| P1 | Challenge-grouped tasks, results and existing conversation entry points | [#89](https://github.com/tjyyy3/dsh-playground/pull/89) merged; #81 closed |
| P2 | Author workflow MVP | Candidate; verify official contracts and review product scope |
| P3 | Organizer workflow MVP | Candidate; verify permissions and lifecycle contracts |
| P3 | Discussion, sharing and advanced reports | Candidate; lower-priority community features |

## 7. Success measures

Measure product outcomes rather than number of tools:

- Percentage of ordinary submission requests handed to the correct existing task conversation with one user action.
- Submission duplicate rate and ambiguous-outcome recovery rate, with actual platform receipts as evidence.
- Percentage of task status displays supported by available DSH evidence, and preservation of known end reasons across reload/restart.
- Unknown task states reported separately and accurately; do not improve a completion metric by guessing a terminal state.
- Time from challenge selection to a usable deliverable and to a traceable submission.
- For future authoring and organizer features: package-preflight outcomes and actions completed without permission or lifecycle errors.
- User-reported confusion around task state, identity and submission authorization.
