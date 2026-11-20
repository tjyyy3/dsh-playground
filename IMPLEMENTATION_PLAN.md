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

The labels below organize scope, not one mandatory PR per row. A2 and A3 belong to the same #74 migration delivered in #88. Track C1 was delivered under #81/#89. C3 records the direction of reusing existing controller tools. C4 is removed as a standalone feature. C5 reuses existing controller and host capabilities. C6 reuses existing results and material references with task-appropriate file organization. D1 retains the existing material-access module without a standalone extraction. D2-D5 follow the agreed overall modularization direction in Track D. The pure-helper extraction is selected under #94; task lifecycle, submission handoff, receipt tracking and their shared overview reader are selected as one combined implementation scope under #95. Remaining migration details stay under review. Track E retains candidate work for further review.

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

C1 was delivered in #89, closing #81. C3 is an agreed direction to reuse existing controller capabilities, with no new controls committed. C4 is removed as a standalone feature. C5 is an agreed direction to reuse controller coordination and host capacity limits. C6 is an agreed direction to retain existing results/material references and coordinate file assignments without new management infrastructure; item numbers are retained.

| Item | Scope | Status / implementation question |
|---|---|---|
| C1 | Group the existing controller task list by challenge; show each Agent task's state, results and supported session link | Delivered: [#89](https://github.com/tjyyy3/dsh-playground/pull/89), closing [#81](https://github.com/tjyyy3/dsh-playground/issues/81); preserve explicit challenge association and existing records |
| C3 | Reuse controller stop/message capabilities | Agreed direction; use supported host/provider operations, with no new control UI planned |
| C5 | Controller-coordinated task order and parallel work, using DSH capacity limits | Agreed direction; no independent plugin queue or dependency scheduler planned |
| C6 | Existing results/material references and task-appropriate directory or Worktree use | Agreed direction; no independent artifact registry or plugin-managed Worktree lifecycle planned |

**C1 requirements**

- Within the selected workspace/controller, preserve separate tasks for the same challenge and group them by reliable existing platform/challenge identity.
- Inspect the target DSH version's supported metadata and records. Add only the association information needed for new tasks; title matching, timing or the most recent handoff are not reliable association.
- Preserve old/unassociated tasks and results visibly, existing maintenance classification and session context. Avoid mixing unrelated top-level task conversations into controller child tasks.
- Reuse existing result displays and native session links. Provider records without a usable address remain readable without a fabricated link.
- Browsing/refreshing does not dispatch work, create sessions or submit. Reuse #77 state evidence; preserve unknown and distinguish it from #74 platform state.
- Verify same-challenge multiple tasks, different challenges, legacy records, workspace switches, association persistence, results and supported session opening with focused mock tests and actual DSH UI checks. No real competition submission is needed.

**C3: reuse existing capabilities**

Reuse the controller's supported DSH stop/message operations within the target provider's capabilities. No additional stop/retry/reassign controls are planned at this stage. Preserve the distinction between a request being accepted and the target actually stopping or processing the message. Starting a new execution does not authorize competition submission.

**C4 disposition: no separate result-review feature**

Keep the existing result display and let the Agent choose the content, detail and organization of its report. The controller may ask for clarification when needed. Do not introduce a fixed three-part reporting template, reduce returned results to that template, or add a separate completion-review panel, review state or submission gate.

**C5: reuse controller coordination and host limits**

Let the controller arrange task order and parallel work using existing DSH delegation and result handling. Reuse the host's supported child-task capacity limits. Do not add a separate plugin queue, persistent dependency graph or scheduler; instructions to the controller are not program-enforced dependency rules.

**C6: reuse results and material references**

Keep existing result displays and authorized material references. Let the controller coordinate file assignments and let executors use separate directories or Git worktrees when appropriate. No independent artifact registry or automatic plugin-owned worktree creation, merging or cleanup is planned.

Directory or worktree organization does not replace file-access authorization. Do not restore whole-file reads, hashes, ZIP scans or an extra review stage to populate an artifact inventory. A path reference does not certify file contents or an immutable version.

#74/#88 own essential submission-result clarity and preservation of existing history/score/quota behavior; B4 must not duplicate them. C1 uses existing controller tasks and supported session associations. Keep Agent reports, host execution state and official platform results distinguishable, and preserve unknown where reliable state evidence is unavailable.

### Track D — Incremental file splitting

#### Overall architecture draft

**Status: overall modularization direction agreed; two implementation scopes selected, with remaining details under review.** Keep one Host/Client package with feature modules, explicit state ownership and gradual extraction. D1 remains agreed: retain the existing material-access module without a standalone split. The first extraction batch is scoped in [#94](https://github.com/tjyyy3/dsh-playground/issues/94): pure submission policy and redaction. [#95](https://github.com/tjyyy3/dsh-playground/issues/95) combines task creation/binding, submission handoff, receipt tracking and the shared history/count overview into one implementation scope, normally one PR, after #94. Both are pending implementation. Remaining module placement, Client build settings and migration scopes stay under review; this status does not record a delivered refactor.

The architecture review uses plugin main `46dacaf4579e825a26657dab135db76fe7184c5a` (package `dsh-playground`, `0.6.0-beta.1`) and the official DSH `0.2.1-rc.5` source `b830ec950faba0a46dda564be3e2d854afed94f1` for the Client bundle contract. This is a separate current-code snapshot from the historical audit baseline. The review read source and existing tests; it did not build a new bundle, run tests, install a package or verify a live Host.

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

##### Current responsibilities and proposed locations

The target is deliberately mixed: feature directories for several related files, and standalone files for cohesive existing modules. The paths below describe a proposal, not the current tree. Do not create every possible directory before it has code to own.

| Proposed location | Responsibility and source to move | Boundary |
|---|---|---|
| `index.js` and `lib/workflow.js` | `index.js` remains the public Host entry and wires host services. `createWorkflow` becomes a small composition/compatibility facade that assembles feature instances and exposes the current methods. | Neither should keep growing with feature implementations. Feature modules must not import the facade back. Existing exports can be re-exported during migration. |
| `lib/host/settings.js`, `tools.js`, `views.js` | Settings/token resolution, tool definitions and registration, model-visible field selection and presentation metadata currently in `index.js` | Preserve credentials boundaries and the distinct model/UI views. Moving a schema must not expose extra stored fields. Keep the current workbench RPC adapter in `lib/queries.js` initially; a later move into this directory needs a concrete benefit. |
| `lib/task/lifecycle.js` | Task creation/binding, workspace selection/resolution and initial task instructions from `start`, `bind` and related helpers | Preserve explicit registered-workspace selection, existing-conversation binding and controller/task separation. |
| `lib/task/projection.js` | The current `workflowProjection`, schema, pure state interpretation and historical compatibility helpers | Keep the existing `playgroundTask` record, event shapes and state version. This is file relocation, not a new task database or a second submission store. |
| `lib/submission/handoff.js` | `submissionContext`, `quotaContext`, `requestSubmission`, `dispatchSubmission` and the associated pending/in-flight state | One cohesive owner for a submission request's lifetime; use the existing task Agent. Receive a record callback, material-access instance and needed Host capabilities. |
| `lib/submission/policy.js` | Pure date/count/limit calculations, `submitPolicy` and reusable submission guidance currently shared by workflow and tool context | Accept values and return policy/announcement data. It does not fetch platform data, own caches, prompt an Agent or establish user consent. |
| `lib/submission/overview.js` | `submissionOverview`, `readOverview`, `countsFor`, `forgetOverview` and the shared history/count read path; selected within #95 | One scoped instance for history, policy and receipts, owning the existing overview/settled-quota caches. Keep current freshness, identity and partial-data behavior. |
| `lib/submission/receipts.js` | `track`, `results` and progress/receipt handling | Verify the real attempt's challenge/account, preserve IDs and unknown outcomes, and emit the existing workflow events. Share overview invalidation and pure state helpers. |
| `lib/catalog.js` and `lib/auth.js` | Discovery/detail/filter/cache orchestration; identity/login/CLI-status orchestration currently nested in `createWorkflow` | Retain queries that work without a task session. These responsibilities do not yet require a directory each. |
| `lib/redaction.js` | `cleanDetail` and its related pure cleanup helpers | Give consumers a direct import for redaction instead of importing the whole workflow. Preserve current behavior rather than redesigning the cleanup rules during the move. |
| Existing `lib/controller.js`, `material-access.js`, `api.js`, `cli.js`, `windows-process.js`, `competitions.js`, `releases.js`, `format.js`, `links.js` and `text.js` | Already separate controller, authorization, platform/process, catalog-data, release and presentation helpers | Keep them as the initial foundations. D3/D5 can later extract a demonstrated internal boundary; a uniform `platform/` directory is not required. |
| `src/client/index.js` plus feature areas `catalog/`, `tasks/`, `controller/`, `submission/` and `settings/` | Client registration plus the corresponding components currently inside `client.js` | Start with existing JavaScript/React behavior. A language/framework conversion or navigation redesign is outside this structural migration. Shared controls/hooks belong in a small shared area only when they have actual consumers. |
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
| Overview `read/counts/invalidate` | Share the existing identity/challenge cache and partial-data semantics across history, policy and tracking. |
| Receipts `track/results/progress` | Read verified platform data, produce current receipt/progress events, and invalidate the shared overview when necessary. |
| State reader and event recorder | Read the existing projection; record through the existing DSH event/command path. Initially inject the current `record` callback rather than rebuilding its protocol in each module. |

Names above illustrate the internal interfaces. Preserve the externally used `createWorkflow` return methods and Host tool/RPC/command contracts during migration.

**State ownership must be recorded before moving closures:**

| State | Owner and lifetime |
|---|---|
| Task, material references, submission status, receipts and attempt IDs | Existing DSH `playgroundTask` projection. Persisted events remain the shared task record, including old records. |
| Controller association and notices | Existing controller projections; transient observation/creation state stays in its existing controller instance. |
| External material grants and pending authorization requests | The same `createMaterialAccess` instance used by both browser authorization and submission. Preserve current expiry/revocation behavior. |
| Task-binding guard | One task-lifecycle instance per current workflow/Host scope; retain the existing `binding` Map's session keys and concurrent-bind behavior. |
| In-flight submission guard and pending quota confirmation | One handoff instance per current workflow/Host scope; preserve session keys and confirmation invalidation after recreation. |
| Pending `record_submission` changes | One recorder whose `record` operation and command consumer share the same private `changes` Map and session checks. Initially keep both in the facade; migrate them together if later needed. |
| History/count cache and quota flags | One overview instance shared by all relevant callers; receipt tracking invalidates that instance. |
| Filters, selected rows, drawers and loading indicators | Client components or their nearest shared owner. Host snapshots are display data, not a separate authoritative task/submission store. |

These are scoped owners, not process-global singletons. Preserve operation-level token/identity consistency. A quota answer still requires fresh account/task/reference/count checks; those reads must not be removed as apparent duplication.

Three dependencies need particular care:

1. Move reusable pure functions to their own module before extracting consumers. Re-export old names from `workflow.js` if necessary; do not create `workflow -> submission -> workflow`.
2. Let overview gather data and policy compute from that data. Connect them in the feature composition, so policy does not import a stateful overview service that imports policy back.
3. Keep the recorder producer/consumer paired and reuse the same material-access instance. Do not construct a second workflow merely to obtain a helper.

An actual move should state which dependency is injected and which module owns its state. Import cycles, generic mutable “shared context” bags and duplicate caches would indicate an incomplete split.

##### Client build and package delivery

The official rc.5 source provides a concrete multi-source-to-bundle pattern: [a UI package's configuration](https://github.com/deepseek-ai/deepseek-harness/blob/b830ec950faba0a46dda564be3e2d854afed94f1/packages/client/ui-conversation/tsdown.config.ts) uses the shared builder, whose [browser CJS configuration](https://github.com/deepseek-ai/deepseek-harness/blob/b830ec950faba0a46dda564be3e2d854afed94f1/packages/client/tsdown.client.ts#L499-L531) and [ModuleLoader wrapper](https://github.com/deepseek-ai/deepseek-harness/blob/b830ec950faba0a46dda564be3e2d854afed94f1/packages/client/tsdown.client.ts#L649-L669) produce a loadable Client entry.

**Proposed D4 delivery:** use static local imports in `src/client/`, bundle them into the root `client.js`, and preserve `window.__ModuleLoader__.load` with ID `dsh-playground` and the existing plugin-object contract. Host files remain Node ESM. A small repository-owned build configuration should reproduce that contract; the official monorepo preset is a reference, not an assumed installable public build dependency.

Keep the current three loader-provided dependencies explicit: `react`, `@deepseek-ai/dsh-client-ui-primitives` and `@deepseek-ai/dsh-client-store`. Bundle local modules and dependencies not supplied by the target loader. The official [external-specifier rules](https://github.com/deepseek-ai/deepseek-harness/blob/b830ec950faba0a46dda564be3e2d854afed94f1/packages/client/tsdown.client.ts#L405-L432) are distinct from service `inject` metadata; do not externalize every package with a matching name prefix. New externals need evidence that the target Host provides them.

The official builder has a dedicated chunk protocol; that does not establish ordinary browser/Node relative-module loading for arbitrary split plugin files. The proposed first migration uses one static Client entry, avoiding a new chunk-delivery requirement.

The current [manifest](https://github.com/tjyyy3/dsh-playground/blob/46dacaf4579e825a26657dab135db76fe7184c5a/package.json#L21-L48) exports the two root entries and includes `lib/*.js`, with no Client build step. Implementation must therefore address delivery in the same structural PR:

- Include all runtime Host subdirectories in the package's `files` policy; inspect the actual tarball rather than assuming a wildcard includes them. Preserve `.` and `./client` exports, bundle metadata, locales and assets.
- Add an explicit Client build before relevant tests and publishing. The current [publish workflow](https://github.com/tjyyy3/dsh-playground/blob/46dacaf4579e825a26657dab135db76fe7184c5a/.github/workflows/publish.yml) uses `npm ci --ignore-scripts`, so a dependency-install lifecycle hook alone is insufficient.
- Proposed initial policy: commit the generated root `client.js` alongside its sources and verify that rebuilding it produces no unexplained diff. This preserves the existing Git-install fallback without requiring consumers to install build tooling. npm receives the same generated artifact. The exact bundler is an implementation choice; the output contract is the requirement.
- Keep the build limited to Client output; it must not clean away `index.js` or Host modules. Decide explicitly whether source maps/resources ship and keep generated paths reproducible.
- Inspect `npm pack --dry-run --json`, then check imports and Client registration from an unpacked package. [npm's packaging documentation](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#files) explains the inclusion policy; [npm pack](https://docs.npmjs.com/cli/v11/commands/npm-pack/) provides the artifact inspection command.
- Preserve the existing Client behavior fixtures against the generated entry. Current [Client tests](https://github.com/tjyyy3/dsh-playground/blob/46dacaf4579e825a26657dab135db76fe7184c5a/test/client.test.mjs#L24-L75) load `client.js` through a fake ModuleLoader and inspect component names, so avoid incidental minification/name changes in the first move. A supported-Host load/navigation check remains separate from mock-test evidence.

No build or installation success is claimed by this architecture draft.

##### D1-D5 scope and migration order

| Item | Scope in this draft | Decision status |
|---|---|---|
| D1 | Retain `lib/material-access.js`; move only small reference adapters when another extraction needs them | Agreed; no independent D1 refactoring PR planned |
| D2 | Submission folder with handoff, policy, shared overview and receipt responsibilities | Policy selected in #94; handoff, receipts and shared overview selected with task lifecycle in #95. Preserve existing behavior |
| D3 | Preserve controller and task projection/observation boundaries; extract controller internals only where the code demonstrates a useful separation | Candidate; no new task database or execution controls |
| D4 | Split existing Client components by feature, with the single-entry build/delivery contract above | Proposed structure; preserve appearance, navigation and interactions |
| D5 | Retain current API/CLI foundations initially; consider targeted separation of transport/normalization or credential/process handling when justified | Candidate; preserve public contracts, HTTPS/response budgets and cancellation/error behavior |

Migrate toward the whole structure in reviewable scopes. The selected combined scope #95 normally uses one implementation PR for its three feature modules and shared overview reader; module count does not prescribe issue or PR count. The remaining rows are review topics and a suggested order, not mandatory separate PRs.

| Batch | Concrete change | Evidence needed before moving on |
|---|---|---|
| 1. Establish leaf boundaries | Selected scope: [#94](https://github.com/tjyyy3/dsh-playground/issues/94), pure redaction and submission-policy extraction with compatible re-exports and complete package contents; leave projection reducers, request Maps, network reads and dispatch in place | Existing date/count/limit/policy and redaction cases, plus affected submission cases; unchanged outputs and rules; no reverse import into the facade |
| 2. Combined task and submission extraction | Selected scope: [#95](https://github.com/tjyyy3/dsh-playground/issues/95), extract task creation/binding, request/confirmation/duplicate-guard lifecycle, receipt/results/progress and their shared `submission/overview.js` together; compose them behind existing workflow methods, reusing the recorder and authorization | Workspace/binding behavior; ordinary one-action dispatch, repeated clicks, expired/changed confirmation and cancellation/unknown outcomes; attempt ownership, retained IDs, shared cache invalidation, fresh policy reads and preserved incomplete-data semantics |
| 3. Reduce the remaining workflow and entry | Review catalog/auth operations and Host registration/views; task lifecycle is already included in selected scope #95 | Session-free reads, unchanged tool/RPC shapes, model-visible field selection and prompt guidance |
| 4. Split Client source | First establish a reproducible equivalent bundle; then migrate existing feature components a few at a time | Generated-entry fixtures, artifact contents/imports and supported-Host UI checks, with no accompanying redesign |
| 5. Reassess D3/D5 internals | Inspect whether controller/API/CLI modules still have a concrete change-locality problem after the earlier moves | A specific extraction and relevant existing lifecycle/transport tests; no mandatory directory churn |

Within #95, submission and quota-confirmation reads stay fresh; result polling may reuse the existing 60-second overview cache. Keep the present `fresh: true` meaning (allow a valid cached overview), shared invalidation after tracking, identity separation and partial-data labels. A cross-caller cache/invalidation test is justified if existing coverage does not prove the extracted instance is shared. The [account-count display draft](PRODUCT_ROADMAP.md#account-count-summary-draft) is separate from this behavior-preserving extraction: current `counts.total` is today's observed count, not a lifetime total.

Keep source imports, test imports, publication metadata and repository guidance aligned with each batch. Update the current `AGENTS.md` instruction that UI changes live in `client.js` when Client source becomes the maintained location. Do not change the implementation guidance before that source/build change actually lands.

##### Acceptance examples and next discussion

Assess the architecture with concrete maintenance scenarios:

- A quota-reminder change is located in policy/guidance, without modifying task creation or introducing a separate UI rule.
- A submission-handoff change is localized to the request owner and the narrow DSH adapter; grants, current task identity and receipt ownership remain intact.
- A task-list presentation change is localized to Client components and existing query shapes; opening the page stays passive.
- A platform response/process fix stays in its existing adapter boundary, with the same error/cancellation contract.
- A clean install receives every referenced runtime file and the same generated Client entry that was tested.

Reuse the repository's relevant offline tests and required CI matrix. Add focused coverage only for a real gap introduced by a new interface or build artifact. Preserve the established distinctions between mock tests, isolated Host observations and live target-Host evidence. Structural work does not introduce a new uploader, material scanner, scheduler, result-review gate or author/organizer feature.

The **first extraction** is scoped in [#94](https://github.com/tjyyy3/dsh-playground/issues/94), followed by the **combined task/submission extraction** in [#95](https://github.com/tjyyy3/dsh-playground/issues/95); both remain pending implementation. Shared overview extraction is included in #95. Review the remaining responsibilities next; the account-count display draft still needs a reliable data-source decision and is not a new #95 behavior. Record implementation evidence in the corresponding issue/PR and settle Client build settings with that later scope.

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
3. Review further participant history, author/organizer/community choices and file-splitting scope separately; record the selected scope before implementation.
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
| B4 participant-history extensions | Candidate; further review needed | — | Compact per-account cumulative/today summary recorded as a draft; complete data sources and product scope still need review |
| D1 path/material access | Agreed: retain existing module; no standalone split planned | — | Existing `lib/material-access.js`; small reference adapters may be adjusted with D2 |
| Architecture batch 1 | Scoped; implementation pending | [#94](https://github.com/tjyyy3/dsh-playground/issues/94) | Pure submission policy/redaction extraction, compatibility and package inclusion |
| Architecture batch 2 | Combined scope selected; implementation pending | [#95](https://github.com/tjyyy3/dsh-playground/issues/95) | Task creation/binding, submission handoff, receipts and shared overview in one work item, normally one PR; existing state, counting semantics and interfaces retained |
| Remaining D2-D5 file splitting | Overall modularization direction agreed; detailed migration scope remains under review | — | Track D: source mapping, state ownership, Client delivery and staged acceptance |
| E1-E8 author/organizer/community | Discovery candidates | — | Official contracts, permissions and selection |

Merge/issue status above was verified during this documentation review. Implementation and target-host tests were not independently rerun; use the linked PRs for their reported evidence and remaining limits.
