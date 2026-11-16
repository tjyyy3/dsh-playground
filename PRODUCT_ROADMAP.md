# Playground Product Roadmap

> Updated: 2026-11-16  
> Product centre: Playground competitions and the workflows around participating, authoring and organizing them.

## 1. Product direction

The plugin should make Playground workflows usable from DSH without turning into a generic agent-management product.

The primary user journeys are:

1. **Participant:** discover a challenge → understand requirements → work with one or more agents → validate deliverables → inspect materials → explicitly authorize submission → follow scoring and history.
2. **Author:** prepare a task package → validate task metadata and evaluation assets → preview the package → authorize upload → inspect the published task.
3. **Organizer:** create and configure a competition → manage seasons and challenge membership → monitor participation and results → manage lifecycle within platform permissions.

Agent orchestration supports all three journeys. It should be designed as reusable infrastructure but remain grounded in a Playground task or competition context.

## 2. Product principles

- **User control:** preparation is not submission authorization. External writes and uploads must have clear targets and understandable confirmation.
- **Evidence over claims:** an agent saying "done" is not proof. Preserve test output, Git diff, artifacts and platform receipts.
- **One task, one durable identity:** tasks and child sessions must be traceable across restarts.
- **Safe workspace access:** workspace files are the default boundary; external files require explicit user authorization.
- **Competition-native concepts:** distinguish competition, season, challenge, task, child task, artifact, submission and score.
- **Incremental delivery:** add one independently testable workflow at a time; do not build every organizer feature before participant workflows are reliable.

## 3. Product areas

### A. Participant experience

**Existing foundation**
- Challenge discovery, filtering and detail.
- Competition / season discovery.
- Personal and public submission lookup.
- Task conversations, material checking, confirmation, submission and score tracking.

**Next improvements**
- Clear participant workflow stages: Discover → Working → Validate → Awaiting confirmation → Submitted → Scoring → Final.
- Submission history grouped by challenge and task, with explicit distinction between new submission and retry.
- Explain scoring states and whether a score is provisional or final.
- Surface missing bundle / closed attempt states and safe next actions.
- Compare multiple attempts and show scorecard changes over time.
- Keep challenge rules, submission limits and resource requirements visible while working.

### B. Agent-assisted execution

**Existing foundation**
- Workspace controller and challenge handoff.
- Native Codex delegation with DSH subagent fallback guidance.
- Child session observation and result notices.
- Separate challenge task conversations and controller conversations.

**Next improvements**
1. Durable task lifecycle and restart recovery.
2. Task board grouped by challenge and status.
3. Child session deep links and task-to-session association.
4. Explicit cancel / retry / reassign controls, subject to DSH host support.
5. Task dependencies and bounded parallelism.
6. Artifact collection and provenance.
7. Evidence-based completion review: Git diff, tests, lint, type checks and required output files.
8. Human review before merging code or submitting a competition attempt.

**Suggested task lifecycle**

`created → queued → running → awaiting_review → completed`

Alternative terminal states: `failed`, `cancelled`, `blocked`, `unknown`.

Do not infer `completed` from a missing process or a missing notification. Unknown is a valid state requiring reconciliation.

### C. Author workflow

The author workflow should be separate from participant submission. It may reuse generic file inspection, confirmation, receipt and audit primitives, but must have its own domain rules and UI.

**Proposed first release**
- Author task creation / selection.
- Local task-package preflight.
- Metadata and required-file validation.
- Package generation and preview.
- Evaluation-set upload where the official CLI supports it.
- Explicit upload confirmation and receipt.
- Published task status lookup.

**Later**
- Task revisions and version history.
- Evaluation-set management.
- Batch task creation.
- Dry-run / preview of grader configuration.
- Regression checks against sample solutions.

Before implementation, verify exact supported CLI commands and server API contracts against the target Playground CLI version. Do not infer undocumented write endpoints from website behavior.

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

Permission-sensitive lifecycle actions should not be implemented until the platform's authorization model is documented.

### E. Discussion and community

Later opportunities:
- Browse topic discussions.
- Search community posts.
- Create a post or reply with explicit confirmation.
- Challenge comments, once official API support is verified.
- Skills and solution sharing.

Discussion is lower priority than participant, author and organizer workflows.

## 4. Shared platform capabilities

These should be shared primitives, not separate copies in each business workflow:

| Capability | Responsibility |
|---|---|
| Identity provider | Resolve one account identity consistently for API and CLI |
| Authorization service | Verify user intent and any additional approval |
| File access service | Enforce workspace boundary and external-file grants |
| Immutable material snapshot | Ensure reviewed bytes equal uploaded bytes |
| CLI runner | Version checks, safe arguments, timeout and cancellation |
| Task store | Persist task, child session and lifecycle facts |
| Artifact registry | Record file path, hash, producing task and review state |
| Receipt service | Normalize write outcomes and reconcile ambiguous operations |
| Audit log | Record actor, target, operation, time and outcome without secrets |

## 5. Suggested workbench information architecture

Keep the existing top-level Playground areas, but clarify the task context:

- **赛题:** browse challenges, competitions and seasons.
- **工作:** current challenge tasks, controller, child agents, TODOs and artifacts.
- **提交:** attempts, scorecards, quota and submission receipts.
- **出题:** authoring and task-package workflow.
- **比赛管理:** organizer workflows.
- **连接设置:** account identity, CLI status and connection configuration.

Do not add every tab immediately. Add authoring and organizer navigation only when their first complete workflows are ready.

## 6. Prioritization

| Priority | Capability | Why |
|---|---|---|
| P0 | File boundary, authorization, immutable upload | Protect local data and user intent |
| P0 | Submission outcome reconciliation | Prevent duplicate or ambiguous writes |
| P1 | Durable task lifecycle and restart recovery | Make delegated work dependable |
| P1 | Participant workflow stage and history clarity | Improve the core Playground journey |
| P1 | Task board, session links, cancel / retry | Improve agent-assisted participation |
| P1 | Evidence-based completion review | Reduce false completion claims |
| P2 | Artifact registry and Worktree isolation | Improve parallel work and review |
| P2 | Author workflow MVP | Expand beyond participation |
| P3 | Organizer workflow MVP | Complete competition management |
| P3 | Discussion, sharing and advanced reports | Broaden community features |

## 7. Success measures

Measure product outcomes rather than number of tools:

- Percentage of participant workflows completed without leaving DSH.
- Submission duplicate rate and ambiguous-outcome recovery rate.
- Percentage of delegated tasks with a durable terminal state.
- Percentage of agent completion claims backed by test / diff / artifact evidence.
- Time from challenge selection to first validated deliverable.
- Author package preflight pass rate.
- Organizer actions completed without permission or lifecycle errors.
- User-reported confusion around task state, identity and submission authorization.
