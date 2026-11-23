# Implementation Plan

> Updated decisions: 2026-11-23. Source baseline: `a6c88d5c65a1e95bb02cbb36ae3910111e143eaf`.  
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

Progress synchronized on 2026-11-23 at main `9ab61f829f0350095529005d395043d7229b6daf`: all four planned batches are merged (#96, #98, #101, #102); the additional D3 controller split is merged in [#105](https://github.com/tjyyy3/dsh-playground/pull/105), and the `base_url` association-tool fix is merged in [#104](https://github.com/tjyyy3/dsh-playground/pull/104), closing #103. The API/CLI review concluded that D5 does not need another split. This status update records repository delivery and each PR's reported verification; it does not claim to independently rerun those tests.

The labels below organize scope, not one mandatory PR per row. A2/A3 were delivered under #74/#88; C1 under #81/#89. Architecture batches 1–4 were delivered under #96, #98, #101 and #102. The additional controller split was delivered under #105, and the redundant `base_url` task-association parameter was removed under #104. D5 was reviewed and no API/CLI split was selected. Track E product areas remain candidates requiring separate product review.

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

### Track C — Task organization

C1 was delivered in [#89](https://github.com/tjyyy3/dsh-playground/pull/89), closing [#81](https://github.com/tjyyy3/dsh-playground/issues/81).

| Item | Scope | Status / implementation question |
|---|---|---|
| C1 | Group the existing controller task list by challenge; show each Agent task's state, results and supported session link | Delivered: [#89](https://github.com/tjyyy3/dsh-playground/pull/89), closing [#81](https://github.com/tjyyy3/dsh-playground/issues/81); preserve explicit challenge association and existing records |

**C1 requirements**

- Within the selected workspace/controller, preserve separate tasks for the same challenge and group them by reliable existing platform/challenge identity.
- Inspect the target DSH version's supported metadata and records. Add only the association information needed for new tasks; title matching, timing or the most recent handoff are not reliable association.
- Preserve old/unassociated tasks and results visibly, existing maintenance classification and session context. Avoid mixing unrelated top-level task conversations into controller child tasks.
- Reuse existing result displays and native session links. Provider records without a usable address remain readable without a fabricated link.
- Browsing/refreshing does not dispatch work, create sessions or submit. Reuse #77 state evidence; preserve unknown and distinguish it from #74 platform state.
- Verify same-challenge multiple tasks, different challenges, legacy records, workspace switches, association persistence, results and supported session opening with focused mock tests and actual DSH UI checks. No real competition submission is needed.

#74/#88 delivered essential submission-result clarity and preserved the then-existing history/score/quota behavior. Current-account history/count simplification was subsequently delivered by #95/#98. Other B4 extensions remain candidates and must not repeat completed work. C1 uses existing controller tasks and supported session associations. Keep Agent reports, host state and official results distinguishable, and preserve unknown where reliable evidence is unavailable.

### Track D — Incremental file splitting

#### Overall architecture draft

**Status: the four planned batches and the reviewed D3 controller split are delivered; D5 was reviewed and deliberately not split.** Keep one Host/Client package, feature modules, explicit state owners and gradual extraction. [#94](https://github.com/tjyyy3/dsh-playground/issues/94)/[#96](https://github.com/tjyyy3/dsh-playground/pull/96) delivered policy/redaction; [#95](https://github.com/tjyyy3/dsh-playground/issues/95)/[#98](https://github.com/tjyyy3/dsh-playground/pull/98) delivered task/submission modules and current-account statistics; [#99](https://github.com/tjyyy3/dsh-playground/issues/99)/[#101](https://github.com/tjyyy3/dsh-playground/pull/101) delivered catalog/auth and Host integration; [#100](https://github.com/tjyyy3/dsh-playground/issues/100)/[#102](https://github.com/tjyyy3/dsh-playground/pull/102) delivered Client source splitting and build/package verification. [#105](https://github.com/tjyyy3/dsh-playground/pull/105) subsequently split controller lifecycle, handoff, task observation and projections. No further API/CLI split is planned without a concrete maintenance need.

The initial architecture review used plugin main `46dacaf4579e825a26657dab135db76fe7184c5a` and official DSH `0.2.1-rc.5` source `b830ec950faba0a46dda564be3e2d854afed94f1` for the Client bundle contract. The third and fourth scopes were checked against main `7050e024a047f1fe633ff18eed4ee2f799c96882` after #96/#98. The current delivery state is synchronized against main `9ab61f829f0350095529005d395043d7229b6daf`; see the linked implementation PRs for their test and Host evidence. These are distinct from the historical audit baseline.

**Agreed direction:** keep one Host/Client plugin package, organize growing feature code into a few directories, retain already coherent modules, and make entry points assemble those modules. Success means that a change is easy to locate, has a limited effect on other features, and can be verified through existing interfaces. File count and a fixed lines-per-file limit are not goals.

##### Design criteria and research basis

| Criterion | Application to this plugin | Basis |
|---|---|---|
| Group code around a responsibility or a design decision that can change independently | Separate quota policy, submission handoff, task lifecycle and presentation. Keep a request's duplicate guard, confirmation and cancellation together when they share its state. | [Parnas, On the Criteria To Be Used in Decomposing Systems into Modules](https://www.cs.lafayette.edu/~gexia/cs301/resources/parnas.html), especially “The Criteria” and “Conclusion”; [original DOI](https://doi.org/10.1145/361598.361623) |
| Keep feature rules separate from how a caller or external system is connected | Workbench and tool adapters translate supported inputs and outputs; feature modules receive the specific DSH/platform capabilities they need. Plain functions and factory parameters are sufficient. | [Cockburn, original Ports and Adapters article](https://alistair.cockburn.us/hexagonal-architecture) |
| Give each state value an owner | Keep UI selection/loading state local where appropriate; read durable task facts from existing Host projections. Apply the same ownership discipline to grants, pending requests and caches. | [React, Sharing State Between Components](https://react.dev/learn/sharing-state-between-components); extending this principle to Host state is this proposal's design judgment |
| Make small changes that preserve observable behavior | Establish the target map, then move one coherent responsibility at a time behind existing exports and methods. Use existing behavior tests to check each move. | [Fowler, Refactoring](https://refactoring.com/) |
| Add structure for demonstrated complexity | Split the large entry/workflow/UI files; keep the existing material-access/API/CLI boundaries where they already work. Add directories as their modules are migrated, without creating empty frameworks for future candidates. | [Fowler, Yagni](https://martinfowler.com/bliki/Yagni.html) |

These sources justify the design criteria; they do not prescribe these exact filenames or certify the plugin's implementation.

##### Selected third batch and module granularity

[#99](https://github.com/tjyyy3/dsh-playground/issues/99) groups catalog, authentication and Host integration in one implementation scope, normally one PR. Build on the latest main containing #96/#98. Group code that is understood and changed together; separate responsibilities with different reasons to change. These are chosen starting boundaries, not an optimum proven by file size.

| Group | Why it stays together or separates |
|---|---|
| `lib/catalog.js` | Search, filtering, sorting and pagination produce one challenge list; their private helpers and facet cache belong with that flow. Changing a filter should not require understanding login or submission. |
| `lib/auth.js` | Current identity, login, failure guidance and the login area's CLI update status form the existing login flow. Keep its update state here; use the shared credential resolver. |
| `lib/host/settings.js`, `tools.js`, `views.js` | Configuration/credential-source resolution, tool registration and Host output shaping have different responsibilities. The directory groups these adapters; `views.js` is not a Client component module. |
| `index.js`, `lib/workflow.js` | Keep composition and compatible entry points. Continue using the already separate `lib/queries.js` workbench adapter. |

The current [catalog path](https://github.com/tjyyy3/dsh-playground/blob/7050e024a047f1fe633ff18eed4ee2f799c96882/lib/workflow.js#L357-L424) combines filtering, sorting and pagination, with a shared facet read/cache. Keep `facetsCache`, `facetsFailedAt` and `facetsReading` in the catalog instance. The [login flow](https://github.com/tjyyy3/dsh-playground/blob/7050e024a047f1fe633ff18eed4ee2f799c96882/lib/workflow.js#L475-L524) keeps `lastUpdate` and `refreshingUpdate` together. There is no requirement for one file per helper or one directory per feature.

Preserve the [current Host composition](https://github.com/tjyyy3/dsh-playground/blob/7050e024a047f1fe633ff18eed4ee2f799c96882/index.js#L801-L842): one API/CLI setup and credential resolver, and one overview shared by the outer history tool and injected workflow. Keep the original registration stages and session-free catalog/auth/detail queries. Preserve explicit per-operation token arguments and distinct cancellation/error semantics when moving identity helpers. Retain model-visible field selection, old public exports and the paired task recorder/consumer. Reuse `submission/policy.js`, `task/evidence.js`, `workflow-result.js` and `redaction.js` directly; new modules must not import composition entries to obtain services.

Finer splitting needs a concrete benefit such as independent consumers, state ownership or reasons to change. If two files always require joint edits and only exchange implementation details, reconsider the boundary. A broad `services.js` would conceal the catalog/auth distinction; tiny search/sort/page modules would currently add navigation and parameter passing without a demonstrated independent responsibility. Adjust filenames when implementation evidence supports it, while preserving the agreed scope and behavior.

Acceptance reuses existing behavior, export and registration tests, with targeted coverage only for migration gaps. Check package contents and local imports. Preserve #98's current-account statistics and ordinary one-action submission; this third batch adds no new feature or Client build.

##### Current responsibilities and proposed locations

The target is deliberately mixed: directories for related modules and standalone files for cohesive responsibilities. Policy, redaction, lifecycle, handoff, receipts and overview have landed through #96/#98; other paths remain target locations. Reuse #98's `task/evidence.js` and `workflow-result.js` helpers. Do not create directories before they have code to own.

| Proposed location | Responsibility and source to move | Boundary |
|---|---|---|
| `index.js` and `lib/workflow.js` | `index.js` remains the public Host entry and wires host services. `createWorkflow` becomes a small composition/compatibility facade that assembles feature instances and exposes the current methods. | Neither should keep growing with feature implementations. Feature modules must not import the facade back. Existing exports can be re-exported during migration. |
| `lib/host/settings.js`, `tools.js`, `views.js` | Selected in [#99](https://github.com/tjyyy3/dsh-playground/issues/99): settings/token resolution, tool definitions/registration and model-visible field selection/presentation metadata currently in `index.js` | Preserve credentials boundaries, registration phases and distinct model/UI views. Keep `lib/queries.js` as the existing workbench adapter. |
| `lib/task/lifecycle.js` | Task creation/binding, workspace selection/resolution and initial task instructions from `start`, `bind` and related helpers | Preserve explicit registered-workspace selection, existing-conversation binding and controller/task separation. |
| `lib/task/projection.js` | The current `workflowProjection`, schema, pure state interpretation and historical compatibility helpers | Keep the existing `playgroundTask` record, event shapes and state version. This is file relocation, not a new task database or a second submission store. |
| `lib/submission/handoff.js` | `submissionContext`, `quotaContext`, `requestSubmission`, `dispatchSubmission` and the associated pending/in-flight state | One cohesive owner for a submission request's lifetime; use the existing task Agent. Receive a record callback, material-access instance and needed Host capabilities. |
| `lib/submission/policy.js` | Pure date/count/limit calculations, `submitPolicy` and reusable submission guidance currently shared by workflow and tool context | Accept values and return policy/announcement data. It does not fetch platform data, own caches, prompt an Agent or establish user consent. |
| `lib/submission/overview.js` | Shared current-account history/count reader (`createSubmissionOverview`), delivered in #98 | One scoped instance shared by history tools, workflow policy and receipts. Retain `/api/user-submissions` as the only statistics source, account/platform isolation, freshness, invalidation and incomplete-data behavior. |
| `lib/submission/receipts.js` | `track`, `results` and progress/receipt handling | Verify the real attempt's challenge/account, preserve IDs and unknown outcomes, and emit the existing workflow events. Share overview invalidation and pure state helpers. |
| `lib/catalog.js` and `lib/auth.js` | Selected in [#99](https://github.com/tjyyy3/dsh-playground/issues/99): discovery/detail/filter/cache orchestration and identity/login/CLI-status orchestration currently nested in `createWorkflow` | Own catalog and login-update state separately; retain session-free queries and shared credential resolution. Neither feature needs a directory of tiny helpers. |
| `lib/redaction.js` | `cleanDetail` and its related pure cleanup helpers | Give consumers a direct import for redaction instead of importing the whole workflow. Preserve current behavior rather than redesigning the cleanup rules during the move. |
| Existing `lib/controller.js`, `material-access.js`, `api.js`, `cli.js`, `windows-process.js`, `competitions.js`, `releases.js`, `format.js`, `links.js` and `text.js` | Already separate controller, authorization, platform/process, catalog-data, release and presentation helpers | Keep them as the initial foundations. D3/D5 can later extract a demonstrated internal boundary; a uniform `platform/` directory is not required. |
| `src/client/index.js`, DSH access, feature areas `catalog/`, `tasks/`, `controller/`, `settings/`, and existing cards | Selected in [#100](https://github.com/tjyyy3/dsh-playground/issues/100): assembly and current Client components; submission/history/material UI stays with the task area and may be grouped further when useful | Preserve JavaScript/React behavior. Keep competition task sessions distinct from controller-delegated tasks; shared controls/hooks need actual consumers. See the fourth-batch delivery and state boundaries below. |
| Root `client.js` | Generated browser entry from the Client sources, retaining the current package export and ModuleLoader ID | Treat it as a reproducible deliverable after D4; edit its source modules instead of maintaining two independent implementations. |

The source mapping is based on [Host registration/composition](https://github.com/tjyyy3/dsh-playground/blob/46dacaf4579e825a26657dab135db76fe7184c5a/index.js#L807-L847), [task projection](https://github.com/tjyyy3/dsh-playground/blob/46dacaf4579e825a26657dab135db76fe7184c5a/lib/workflow.js#L28-L193), [submission rules](https://github.com/tjyyy3/dsh-playground/blob/46dacaf4579e825a26657dab135db76fe7184c5a/lib/workflow.js#L204-L358), [overview and handoff](https://github.com/tjyyy3/dsh-playground/blob/46dacaf4579e825a26657dab135db76fe7184c5a/lib/workflow.js#L677-L984), [task/catalog/account operations](https://github.com/tjyyy3/dsh-playground/blob/46dacaf4579e825a26657dab135db76fe7184c5a/lib/workflow.js#L986-L1388), [receipts](https://github.com/tjyyy3/dsh-playground/blob/46dacaf4579e825a26657dab135db76fe7184c5a/lib/workflow.js#L1391-L1499), and the current [Client components](https://github.com/tjyyy3/dsh-playground/blob/46dacaf4579e825a26657dab135db76fe7184c5a/client.js).

##### Calls, interfaces and shared state

The following diagram shows the intended responsibility boundaries. Input adapters retain their different authorization rules; grouping them in the diagram does not give model tools a new user-only submission or grant endpoint.

~~~mermaid
flowchart TD
    UI["Workbench UI"] --> Entry["Host entry adapters"]
    Tools["Agent tools"] --> Entry
    Entry --> Features["Task, submission and discovery modules"]
    Features --> Pure["Pure policy and state interpretation"]
    Features --> Capabilities["Injected DSH and platform capabilities"]
~~~

The composition code creates the existing API client, CLI runner, material-access and controller services once for their appropriate Host scope, and passes the required capabilities into the feature modules. Submission handoff uses the existing Agent through DSH; the retained API/CLI adapters do not become an uploader.

Use a few concrete interfaces rather than a new framework:

| Interface | Intended contract |
|---|---|
| Handoff `request(input, exec)` | Preserve the current request/status/confirmation/cancellation behavior and result shapes; share one in-flight/pending-request owner. |
| Policy calculation | Input: current counts, known limits, challenge and identity. Output: the current policy and announcement. Network reads and user interaction stay outside it. |
| Overview `read/counts/invalidate` | Share current-account `/api/user-submissions` history/counts, scoped caching and invalidation across history, policy and tracking. Preserve unknown/partial data; direct result/ownership reads remain separate. |
| Receipts `track/results/progress` | Read verified platform data, produce current receipt/progress events, and invalidate the shared overview when necessary. |
| State reader and event recorder | Read the existing projection; record through the existing DSH event/command path. Initially inject the current `record` callback rather than rebuilding its protocol in each module. |

Names above illustrate internal interfaces. Preserve externally used `createWorkflow` methods and Host tool/RPC/command contracts. The selected statistics change was delivered by #95/#98; the third batch preserves that behavior while moving existing responsibilities.

**State ownership must be recorded before moving closures:**

| State | Owner and lifetime |
|---|---|
| Task, material references, submission status, receipts and attempt IDs | Existing DSH `playgroundTask` projection. Persisted events remain the shared task record, including old records. |
| Controller association and notices | Existing controller projections; transient observation/creation state stays in its existing controller instance. |
| External material grants and pending authorization requests | The same `createMaterialAccess` instance used by both browser authorization and submission. Preserve current expiry/revocation behavior. |
| Task-binding guard | One task-lifecycle instance per current workflow/Host scope; retain the existing `binding` Map's session keys and concurrent-bind behavior. |
| In-flight submission guard and pending quota confirmation | One handoff instance per current workflow/Host scope; preserve session keys and confirmation invalidation after recreation. |
| Pending `record_submission` changes | One recorder whose `record` operation and command consumer share the same private `changes` Map and session checks. Initially keep both in the facade; migrate them together if later needed. |
| Current-account history/count cache | One overview shared by the outer read-only history tool and injected workflow, isolated by platform/account/challenge; receipt tracking invalidates that same instance, as established in #98. |
| Catalog facet cache and in-progress read | One catalog instance owns `facetsCache`, `facetsFailedAt` and `facetsReading`, preserving existing TTLs and shared reads. |
| Login-area CLI update state | One auth instance owns `lastUpdate` and `refreshingUpdate`, preserving bounded waiting and background refresh behavior. |
| Filters, selected rows, drawers and loading indicators | Client components or their nearest shared owner. Host snapshots are display data, not a separate authoritative task/submission store. |

These are scoped owners, not process-global singletons. Preserve operation-level token/identity consistency. A quota answer still requires fresh account/task/reference/count checks; those reads must not be removed as apparent duplication.

Three dependencies need particular care:

1. Move reusable pure functions to their own module before extracting consumers. Re-export old names from `workflow.js` if necessary; do not create `workflow -> submission -> workflow`.
2. Let overview gather data and policy compute from that data. Connect them in the feature composition, so policy does not import a stateful overview service that imports policy back.
3. Keep the recorder producer/consumer paired and reuse the same material-access instance. Do not construct a second workflow merely to obtain a helper.

An actual move should state which dependency is injected and which module owns its state. Import cycles, generic mutable “shared context” bags and duplicate caches would indicate an incomplete split.

##### Client build and package delivery

**Selected fourth batch: [#100](https://github.com/tjyyy3/dsh-playground/issues/100).** Split current Client sources by responsibility and add a reproducible build, normally in one implementation PR after #99, based on the then-current main. First establish an equivalent generated entry, then move existing components in reviewable steps within that PR. Keep the existing UI and interactions.

| Source area | Responsibility and state boundary |
|---|---|
| `src/client/index.js` and DSH access | Assemble the plugin and register existing slots/cards; connect actions, RPC, commands and credential operations. Keep one each of the current `taskRequest`, `controllerTarget` and `controllerSelection` objects per Client application. |
| `catalog/` | List/filter/page/detail components and their request/cancellation state; a stale response must not replace newer filter results. |
| `tasks/` | Competition task sessions, drawer/archive, materials, submission and history/results. Retain the same result-refresh owner shared by rows, details and history. |
| `controller/` | Controller chat, challenge-grouped delegated tasks and existing handoff/session navigation; retain workspace, controller and sidebar selection/observation ownership. |
| `settings/`, existing cards and shared display helpers | Existing login/update UI and tool/command cards. Form fields remain local; credential operations use DSH. Extract genuinely shared text/styles/controls/hooks by their consumers. |

These are starting boundaries, not a file-count target. Preserve the current mounted-page behavior, including the main chat and already visited views, native editor state, account/workspace switching, cancellation, cleanup and late-response handling. UI data continues to come from the same Host capabilities.

The official rc.5 [ui-conversation sources](https://github.com/deepseek-ai/deepseek-harness/tree/b830ec950faba0a46dda564be3e2d854afed94f1/packages/client/ui-conversation/src/client) use multiple modules; their [package scripts and Client export](https://github.com/deepseek-ai/deepseek-harness/blob/b830ec950faba0a46dda564be3e2d854afed94f1/packages/client/ui-conversation/package.json) and [configuration](https://github.com/deepseek-ai/deepseek-harness/blob/b830ec950faba0a46dda564be3e2d854afed94f1/packages/client/ui-conversation/tsdown.config.ts) lead through the shared [browser CJS build](https://github.com/deepseek-ai/deepseek-harness/blob/b830ec950faba0a46dda564be3e2d854afed94f1/packages/client/tsdown.client.ts#L499-L531) and [ModuleLoader wrapper](https://github.com/deepseek-ai/deepseek-harness/blob/b830ec950faba0a46dda564be3e2d854afed94f1/packages/client/tsdown.client.ts#L649-L669). Third-party dsh-im 5.10.0 similarly uses [modular Client sources](https://github.com/xmanrui/dsh-im/blob/fc2ceab217309f8973afa03c58cdd8ff3e900130/plugin-src/client/index.js), a small [esbuild configuration](https://github.com/xmanrui/dsh-im/blob/fc2ceab217309f8973afa03c58cdd8ff3e900130/plugin-src/client/build.mjs), and [build-before-check scripts](https://github.com/xmanrui/dsh-im/blob/fc2ceab217309f8973afa03c58cdd8ff3e900130/package.json).

These are examples, not a universal requirement: the official [minimal Host plugin](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/publish) directly ships JavaScript without a build script. Build is a source-to-delivery mechanism; architecture quality still depends on cohesive responsibilities, clear state ownership and limited coupling. Our choice fits the existing large Client and preserves its delivery contract.

**Agreed D4 delivery:** use static local imports in `src/client/`, bundle them into the root `client.js`, and preserve `window.__ModuleLoader__.load` with ID `dsh-playground`. The factory must directly return the existing plugin object with `inject` and `apply`, rather than accidentally returning a default-export wrapper. Host files remain Node ESM. Use a small repository-owned build configuration; the official monorepo preset is a contract reference, not an assumed installable build dependency.

Keep the current three loader-provided dependencies explicit: `react`, `@deepseek-ai/dsh-client-ui-primitives` and `@deepseek-ai/dsh-client-store`. Bundle local modules and preserve the host-provided React instance. The official [external-specifier rules](https://github.com/deepseek-ai/deepseek-harness/blob/b830ec950faba0a46dda564be3e2d854afed94f1/packages/client/tsdown.client.ts#L405-L432) are distinct from service `inject` metadata; additional externals need evidence that the target loader supplies them.

The official builder supports its own chunk protocol. This first migration chooses one static Client entry to keep delivery simple; DSH is not being characterized as single-file-only.

The current [manifest](https://github.com/tjyyy3/dsh-playground/blob/7050e024a047f1fe633ff18eed4ee2f799c96882/package.json#L21-L47) exports the two root entries and already includes `lib/**/*.js` following #96, with no Client build step yet. The fourth batch adds:

- An explicit `build` or `build:client` command, with build-before-test/artifact verification in CI, release and publishing. Current [publish](https://github.com/tjyyy3/dsh-playground/blob/7050e024a047f1fe633ff18eed4ee2f799c96882/.github/workflows/publish.yml) and [release](https://github.com/tjyyy3/dsh-playground/blob/7050e024a047f1fe633ff18eed4ee2f799c96882/.github/workflows/release.yml) verification use `npm ci --ignore-scripts`; an install lifecycle hook alone is insufficient.
- Source modules and the generated root `client.js` committed together, with a reproducible rebuild consistency check. This preserves the existing Git-install fallback; npm ships the same verified artifact. Build tooling is a development dependency, and installed users receive loadable output. The exact bundler remains an implementation choice.
- Client-only output cleanup, preserving `index.js`, Host modules, current `lib/**/*.js` inclusion, public exports, locales, metadata and assets. Decide source-map/resource delivery explicitly and avoid generated absolute paths or timestamps.
- `npm pack --dry-run --json` and actual unpacked-package checks for local imports, required assets and Client registration. [npm packaging](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#files) and [npm pack](https://docs.npmjs.com/cli/v11/commands/npm-pack/) describe the artifact tools.
- Existing [Client behavior fixtures](https://github.com/tjyyy3/dsh-playground/blob/7050e024a047f1fe633ff18eed4ee2f799c96882/test/client.test.mjs#L24-L85) against the generated root entry. Preserve component names in this first migration and verify affected state behavior through existing coverage or targeted gaps. A supported-Host load/navigation check is separate from mocks.
- README/AGENTS maintenance guidance updated to edit source, build and verify the generated entry.

The Client source split and reproducible build were delivered in [#102](https://github.com/tjyyy3/dsh-playground/pull/102). Its implementation PR records generated-entry tests, package verification and Host validation limits; this document update does not claim new independent runtime verification.

##### Module boundaries and migration order

| Item | Scope in this draft | Decision status |
|---|---|---|
| D2 | Submission folder with handoff, policy, shared overview and receipt responsibilities | #94 delivered in #96; combined #95 scope delivered in #98, including current-account statistics. Preserve the delivered behavior |
| D3 | Split controller lifecycle, handoff, task observation and projections behind the existing controller entry | Delivered in [#105](https://github.com/tjyyy3/dsh-playground/pull/105); preserves exports, queue/state ownership and Projection v2 compatibility |
| D4 | Split existing Client components by feature and build the existing root `client.js` entry | Delivered in [#102](https://github.com/tjyyy3/dsh-playground/pull/102); source/build/package checks and Host evidence are recorded there |
| D5 | Review whether API/CLI internals need further separation | Reviewed; no split selected. Keep `api.js`, `cli.js` and `windows-process.js` boundaries unless a concrete maintenance problem appears |

All four planned batches have been delivered in reviewable PRs: #96, #98, #101 and #102. The subsequent D3 controller split was delivered in #105. The `base_url` association-tool correction was delivered in #104, closing #103. D5 was reviewed and intentionally left unchanged. Module count does not prescribe issue or PR count; future extraction requires a demonstrated maintenance benefit.

| Batch | Concrete change | Evidence needed before moving on |
|---|---|---|
| 1. Establish leaf boundaries | Delivered: [#94](https://github.com/tjyyy3/dsh-playground/issues/94) / [#96](https://github.com/tjyyy3/dsh-playground/pull/96), pure policy/redaction extraction with compatibility exports and package inclusion | Preserve the reported behavior and packaging evidence; no need to repeat the completed extraction |
| 2. Combined task and submission extraction | Delivered: [#95](https://github.com/tjyyy3/dsh-playground/issues/95) / [#98](https://github.com/tjyyy3/dsh-playground/pull/98), lifecycle, handoff, receipts and shared overview with current-account statistics | Preserve task/confirmation/ownership behavior, shared cache invalidation, fresh policy reads, incomplete-data semantics and the sole statistics source |
| 3. Reduce the remaining workflow and entry | Delivered: [#99](https://github.com/tjyyy3/dsh-playground/issues/99) / [#101](https://github.com/tjyyy3/dsh-playground/pull/101), catalog/auth and Host settings/tools/views | Session-free reads, login/credential behavior, registration phases, output fields, shared overview and package imports preserved |
| 4. Split Client source and add build | Delivered: [#100](https://github.com/tjyyy3/dsh-playground/issues/100) / [#102](https://github.com/tjyyy3/dsh-playground/pull/102) | Generated-entry behavior/state fixtures, rebuild consistency, package contents/imports and supported-Host checks are recorded in #102 |
| 5. Reassess D3/D5 internals | D3 delivered in [#105](https://github.com/tjyyy3/dsh-playground/pull/105); D5 reviewed with no further split selected | Preserve controller compatibility and Projection v2; leave API/CLI structure as-is unless a concrete need emerges |

Within #95, submission and quota-confirmation reads stay fresh; result polling may reuse the existing 60-second overview cache. Keep the present `fresh: true` meaning (allow a valid cached overview), shared invalidation after tracking and platform/account/challenge isolation. A cross-caller cache/invalidation test is justified if existing coverage does not prove the extracted instance is shared.

The [current-account statistics decision](PRODUCT_ROADMAP.md#account-count-summary-draft) is an explicit behavior-change exception in #95: use only `GET /api/user-submissions` for history/count aggregation, and remove associated-Agent aggregation and combined-account totals. Do not fall back to `/me/attempts`, public attempt lists or bulk attempt-detail backfill for statistics. Keep identity reads and direct result/ownership checks for real attempt IDs, plus existing verified IDs and receipts. The minimal API adapter and statistics field/prompt/UI adjustments belong to #95; #94's pure extraction remains unchanged.

Verify the new endpoint's actual account scope, attempt/challenge/time fields, timezone and completeness/pagination contract during implementation; the observed signed-in official frontend usage is not a verified authenticated response contract. Current `counts.total` remains today's observed count, not a lifetime total. Cumulative/today values need distinct attempt IDs and a supported completeness scope; partial, missing or failed data must not become a false zero. Missing quota flags stay unknown, with no extra detail fetching to fill them in. Preserve known statement/platform limits and the existing confirmation path; the today-has-quota-use condition uses only reliable current-account information. Unknown statistics alone add no confirmation or blocking step and no calculated remaining quota. Verify that old statistics sources are no longer called and account changes cannot reuse another account's cached figures.

Keep source imports, test imports, publication metadata and repository guidance aligned with each batch. Update the current `AGENTS.md` instruction that UI changes live in `client.js` when Client source becomes the maintained location. Do not change the implementation guidance before that source/build change actually lands.

##### Acceptance examples and next discussion

Assess the architecture with concrete maintenance scenarios:

- A quota-reminder change is located in policy/guidance, without modifying task creation or introducing a separate UI rule.
- A submission-handoff change is localized to the request owner and the narrow DSH adapter; grants, current task identity and receipt ownership remain intact.
- A task-list presentation change is localized to Client components and existing query shapes; opening the page stays passive.
- A platform response/process fix stays in its existing adapter boundary, with the same error/cancellation contract.
- A clean install receives every referenced runtime file and the same generated Client entry that was tested.

Reuse the repository's relevant offline tests and required CI matrix. Add focused coverage only for a real gap introduced by a new interface or build artifact. Preserve the established distinctions between mock tests, isolated Host observations and live target-Host evidence. Structural work preserves the behavior specified for each batch.

All four planned architecture batches are merged: #94/#96, #95/#98, #99/#101 and #100/#102. D3 controller splitting is also merged in #105. D5 was reviewed and no further API/CLI split was selected. The redundant `base_url` association parameter was fixed in #104, closing #103. Further structural work is not currently scheduled; propose it only when a concrete maintenance problem justifies it. Recent product deliveries #106–#108 are summarized in PRODUCT_ROADMAP.md. Validation details and limits remain in each implementation PR; this documentation update adds no new runtime evidence.

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
- Structural refactors: preserve existing behavior and affected contracts except for the explicitly selected current-account history/count source/scope change in #95.

## 4. Release and PR completion criteria

For the behavior actually changed:

- Meet the linked issue criteria and preserve affected existing protections.
- Run required offline/CI checks for runtime changes; record target-host evidence when needed.
- Document supported versions and actual limits without promising unverified host/platform guarantees.
- Keep unresolved items open and visible; opening a PR does not prove all issue conditions are complete.
- For this documentation alignment, verify the text, diff and issue links; do not claim new runtime test results.

Superseded snapshot, mandatory plugin material-cap and external Worker-audit prerequisites do not gate the new participant handoff.

## 5. Immediate next actions

1. Keep the status tables aligned with merged PRs #96, #98, #101, #102, #104 and #105; do not reopen completed work solely because an older paragraph described it as pending.
2. Preserve the validation limits recorded in implementation PRs. The historical AUD-003 production-session bypass remains unproven; documentation updates do not supply new production-path evidence.
3. D5 has no planned split. Any future D3/D5 refactor needs a concrete maintenance case and separate review.
4. Track new participant, author/organizer and community proposals separately; do not treat Track E candidates as implementation commitments.

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
| B4 participant-history extensions | Current-account history/count simplification merged; other extensions remain candidates | [#95](https://github.com/tjyyy3/dsh-playground/issues/95) / [#98](https://github.com/tjyyy3/dsh-playground/pull/98) | Retain the sole current-account statistics source and incomplete/unknown behavior; use the implementation for evidence and limits |
| Architecture batch 1 | Merged; #94 closed | [#94](https://github.com/tjyyy3/dsh-playground/issues/94) / [#96](https://github.com/tjyyy3/dsh-playground/pull/96) | Pure policy/redaction extraction, compatibility and package inclusion |
| Architecture batch 2 | Merged; #95 closed | [#95](https://github.com/tjyyy3/dsh-playground/issues/95) / [#98](https://github.com/tjyyy3/dsh-playground/pull/98) | Lifecycle, handoff, receipts and shared overview; current-account statistics |
| Architecture batch 3 | Merged; #99 closed | [#99](https://github.com/tjyyy3/dsh-playground/issues/99) / [#101](https://github.com/tjyyy3/dsh-playground/pull/101) | Catalog/auth and Host integration; behavior and shared state preserved |
| Architecture batch 4 | Merged; #100 closed | [#100](https://github.com/tjyyy3/dsh-playground/issues/100) / [#102](https://github.com/tjyyy3/dsh-playground/pull/102) | Client source modules, reproducible build, generated-entry testing and package delivery |
| D3 controller split | Merged | [#105](https://github.com/tjyyy3/dsh-playground/pull/105) | Controller lifecycle, handoff, task observation and Projection modules; preserve existing public contracts |\n| D5 API/CLI split | Reviewed; not selected | — | Keep current API/CLI modules; reconsider only if a concrete maintenance need appears |\n| Controller association `base_url` bug | Fixed; #103 closed | [#103](https://github.com/tjyyy3/dsh-playground/issues/103) / [#104](https://github.com/tjyyy3/dsh-playground/pull/104) | Read platform base URL from the active Client instead of requiring Agent input |
| E1-E8 author/organizer/community | Discovery candidates | — | Official contracts, permissions and selection |

Merge/issue status above was verified during this documentation review. Implementation and target-host tests were not independently rerun; use the linked PRs for their reported evidence and remaining limits.
