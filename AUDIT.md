# Security and Reliability Audit

> Original source review: 2026-11-16; decisions and issue alignment updated: 2026-11-20.  
> Source baseline: `a6c88d5c65a1e95bb02cbb36ae3910111e143eaf`.  
> Status: AUD-001 through AUD-009 have a recorded review disposition, and their linked implementation PRs have merged. Original findings retain their historical source baseline. The controller split and redundant-platform-parameter fix are also merged (#105 and #104). Merge status is not independent runtime or target-host verification.

The baseline observations come from source and test inspection. AUD-003 additionally includes a local Codex investigation supplied by the user. That report used fake submissions in an isolated host; it does not establish a complete production-session bypass. No real competition submission or production memory/crash test was performed during this review.

## 1. Confirmed product and authorization decisions

1. **Submission is a handoff.** One workbench click or an explicit conversation request sends the submission intent to the existing Agent conversation for the current task. The Agent follows the challenge and platform's official requirements, choosing CLI or API and any necessary preparation/checks. The plugin passes context, tracks the real attempt ID and presents results.
2. **Ordinary submission needs one explicit action.** Finishing a solution or checking materials is not submission intent. Only the already-agreed quota-sensitive cases need an additional user answer. Do not add a universal second confirmation, mandatory dry-run or separate check-card stage.
3. **The old plugin uploader is retired.** Remove legacy prepare/confirm cards, independent CLI/API upload and fallback paths, including reachable tools and commands. Do not submit once through the Agent and again through the plugin. Agent use of the official API does not reactivate the old uploader.
4. **External materials use hybrid authorization.** Workspace materials are the default. External files/directories need a scoped user grant: one logical operation by default, with optional task-session reuse explicitly chosen by the user. Grants identify scope and purpose, can be revoked and expire at task end, workspace change or host restart. Reading permission is not submission permission.
5. **Material references are sufficient for handoff.** Do not fully read, parse, hash, copy or snapshot trace, manifest or ZIP just to dispatch submission. Remove the plugin's old 200 MiB ZIP gate rather than replacing it with another competition-material limit. The Agent still follows official requirements and reports official errors.
6. **Keep the capability boundary honest.** These rules govern plugin-controlled operations and instructions to the task Agent. The plugin is not a sandbox for all terminal/HTTP tools. Model-authored consent and generic automatic approval outcomes do not prove that a human approved this particular operation.
7. **Playground workflows remain the product centre.** Participant, author and organizer work remain the wider direction. Additional product features and structural refactors are proposals until separately reviewed, not prerequisites for these issue fixes.

## 2. Evidence labels and implementation tracking

- **Confirmed from code:** the relevant branch or data flow is visible at the baseline.
- **Reported local validation:** a user-supplied investigation describes its environment and results; this review did not independently rerun it.
- **Needs host validation:** behavior depends on the installed DSH version, provider or lifecycle.
- **Capability limitation:** a component provides less than complete validation; this alone is not proof of an exploit.

Priorities below describe the original concern. The current disposition and linked issue define the work; a retiring mechanism is not a new feature that must be rebuilt.

| Finding | Current disposition | Tracking |
|---|---|---|
| AUD-001 | Hybrid grants for retained plugin operations and material references | [#73](https://github.com/tjyyy3/dsh-playground/issues/73) |
| AUD-002 | Retire the stale check-card/upload contract through Agent handoff | [#74](https://github.com/tjyyy3/dsh-playground/issues/74) |
| AUD-003 | Apply local investigation results to authorization migration | [#74](https://github.com/tjyyy3/dsh-playground/issues/74) |
| AUD-004 | Remove redundant full material reads and plugin material gates | [#75](https://github.com/tjyyy3/dsh-playground/issues/75) |
| AUD-005 | Require remote HTTPS, preserving the documented local HTTP path | [#76](https://github.com/tjyyy3/dsh-playground/issues/76) |
| AUD-006 | Preserve settlement reasons and reuse supported DSH state evidence | [#77](https://github.com/tjyyy3/dsh-playground/issues/77) |
| AUD-007 | Address the remaining Windows descendant-cleanup boundary | [#17](https://github.com/tjyyy3/dsh-playground/issues/17) |
| AUD-008 | Bound the API response bodies the plugin actually consumes | [#78](https://github.com/tjyyy3/dsh-playground/issues/78) |
| AUD-009 | Retire ZIP inspection with the old material-preparation path | [#75](https://github.com/tjyyy3/dsh-playground/issues/75) |

Repository status synchronized on 2026-11-23 at main `9ab61f829f0350095529005d395043d7229b6daf`: the audit fixes listed below are merged. The later controller-association issue #103 was fixed by #104; the D3 controller split was delivered by #105. The findings below preserve the original evidence and accepted scope; they do not describe every finding as still present on current main. Implementation PRs contain their own verification reports; this document update did not independently rerun those tests.

## 3. Findings

### AUD-001 — External materials need scoped authorization

- **Priority:** P0. **Status:** confirmed in the historical baseline; hybrid policy implemented in merged [#83](https://github.com/tjyyy3/dsh-playground/pull/83), closing #73.
- **Evidence:** legacy path resolution accepts absolute paths and relative paths without a workspace-containment check before material reads. See [path resolution and readers](https://github.com/tjyyy3/dsh-playground/blob/a6c88d5c65a1e95bb02cbb36ae3910111e143eaf/index.js#L399-L440).
- **Required behavior:** apply #73 to retained plugin file operations and material-reference scope. A single-operation grant covers one logical operation, not one low-level read; task-session reuse requires the user's choice. Neither silently expands to another task, path or purpose.
- **Implementation boundary:** handle canonical paths, traversal, symlinks, Windows junctions and case semantics; avoid naive string prefixes. Resolve the registered workspace and revalidate before actual use. Do not retain obsolete readers or require a full-file fingerprint solely for grants.
- **Acceptance:** normal workspace use needs no unnecessary prompts; external scope is checked before retained content access; grant reuse, expiry and revocation work. Credential-store reads remain a separate purpose and do not authorize uploading credentials as materials. Do not claim enforcement over all Agent terminal access.

### AUD-002 — The legacy check/upload path has a material-consistency gap

- **Priority:** P0. **Status:** confirmed in the baseline path; that path was retired by merged [#88](https://github.com/tjyyy3/dsh-playground/pull/88), closing #74.
- **Evidence:** `confirmOnce` inspects and compares hashes, then passes paths to a CLI that reads later, leaving a window for file changes. See [legacy confirmation](https://github.com/tjyyy3/dsh-playground/blob/a6c88d5c65a1e95bb02cbb36ae3910111e143eaf/lib/workflow.js#L1561-L1587).
- **Current disposition:** remove the old checked-card/second-confirmation/uploader contract. Send one request to the correct existing task Agent with intended account, workspace, material references and known attempt context. No new plugin snapshot, whole-file hash or upload-copy requirement is introduced.
- **Acceptance:** no stale card or independent uploader continues after migration; duplicate clicks do not create parallel requests. Any retained claim that a particular file version was checked still needs corresponding evidence.
- **Boundary:** delegation does not prove that every official tool's internal file race is solved. State the retired plugin contract and external execution boundary accurately.

### AUD-003 — Model declarations and generic approvals do not prove human consent

- **Priority:** P0. **Status:** the legacy plugin-entry gap was demonstrated in reported local tests; migration delivered in merged [#88](https://github.com/tjyyy3/dsh-playground/pull/88), closing #74. The historical production end-to-end bypass remains unverified.
- **Local investigation:** the user supplied results for DSH `0.2.1-rc.5` / official revision `b830ec9`, installed plugin `0.5.0-preview.7` and repository tests `0.5.0-preview.8`. Nine targeted offline tests passed. With a valid legacy card, supplying only `user_confirmed_limit: true` reached a fake submission without a new user answer or host approval record.
- **Host evidence:** command IDs and service-written `source.kind=user` support tracing but do not prove a physical click at the plugin handler. Generic `allowed-once` can come from an automatic answerer; the recorded ID/outcome does not identify a human response. Web reply permissions still exist, so this is not a claim that arbitrary callers can answer approvals. See [#74's investigation and sources](https://github.com/tjyyy3/dsh-playground/issues/74).
- **Required migration:** remove legacy Boolean-dependent upload entry points, not merely the button. Preserve one ordinary user action and the existing quota exceptions. Use supported user-interaction evidence for plugin-controlled sensitive actions; do not record model assertions or unattributed automatic approval as verified human consent.
- **Acceptance:** rejected, cancelled, unavailable or unverifiable confirmation does not continue the protected plugin action. Record the tested host channel and distinguish enforceable checks from Agent behavior rules outside plugin control.
- **Historical evidence limit:** the reported investigation did not verify production Desktop routing, Agent reachability of the same legacy command entry or binding of a human message to a production submission. The merged migration does not retroactively prove that historical production bypass.

### AUD-004 — Submission handoff should not fully read materials

- **Priority:** P1. **Status:** redundant reads confirmed at the baseline; removal delivered in merged [#88](https://github.com/tjyyy3/dsh-playground/pull/88), closing #75.
- **Evidence:** legacy readers load trace and manifest in full; `inspect` loads ZIP, repeats hashes/parsing and counts trace entries. The ZIP 200 MiB ceiling is a local plugin value, not a universal official-platform rule. See [legacy preparation](https://github.com/tjyyy3/dsh-playground/blob/a6c88d5c65a1e95bb02cbb36ae3910111e143eaf/lib/workflow.js#L1314-L1347).
- **Required behavior:** hand off context and references without material loading, conversion, hashing or size gates. Remove obsolete API-fallback preparation and summary work. Do not add trace/manifest caps or replace the ZIP threshold with a different hardcoded competition limit.
- **Acceptance:** fake filesystem/dispatch tests show that clicking or retrying handoff does not read trace/manifest/ZIP contents. The Agent may choose official CLI or API; report official failures and preserve attempt IDs.
- **Retained processing:** identify and test any actual remaining content-processing feature separately. Do not truncate or rewrite competition materials to avoid errors. API response budgets belong to AUD-008.

### AUD-005 — Custom remote HTTP endpoints expose credential-bearing requests

- **Priority:** P1. **Status:** conditional configuration issue confirmed in the review baseline. [#80](https://github.com/tjyyy3/dsh-playground/pull/80) merged on 2026-11-19 and #76 is closed; repository status verified, implementation tests not independently rerun in this documentation review.
- **Evidence:** the default base uses HTTPS, but arbitrary HTTP bases are accepted and requests attach an available token. See [#76](https://github.com/tjyyy3/dsh-playground/issues/76).
- **Required behavior:** require HTTPS for remote hosts. Preserve local-development HTTP for `localhost`, `127.0.0.1` and `[::1]`; do not add a general unsafe-remote override. Reject disallowed destinations before fetching and prevent silent downgrade through redirects.
- **Acceptance:** fake-token tests cover remote HTTPS, permitted local HTTP, rejected remote HTTP and the chosen redirect policy; existing local demo/CI use remains possible.
- **Boundary:** this governs plugin requests, including retained read-only APIs. It is not a default credential leak or a guarantee about all Agent/CLI traffic.

### AUD-006 — Settlement reasons should survive controller recreation

- **Priority:** P1. **Status:** the baseline persistence omission was addressed by merged [#84](https://github.com/tjyyy3/dsh-playground/pull/84), closing #77. State recovery remains bounded by actual DSH/provider evidence.
- **Evidence:** the Host-side lifecycle map is process-local, but settled notifications already have a persistent projection and a cold-controller test. The projection stores child ID/text and drops the structured stop reason when supplied. See [the projection](https://github.com/tjyyy3/dsh-playground/blob/a6c88d5c65a1e95bb02cbb36ae3910111e143eaf/lib/controller.js#L25-L39) and [#77](https://github.com/tjyyy3/dsh-playground/issues/77).
- **Required behavior:** preserve the optional reason in existing records, compatibly with old notices. Use supported passive host reads where available; querying must not wake the Agent. No new task database or mandatory recovery button is required.
- **Acceptance:** supplied error/aborted reasons survive recreation; old notices remain readable; insufficient evidence stays unknown. Old results do not prove a new run completed, and `running: false` alone does not prove task success.
- **Host boundaries:** distinguish frontend refresh, plugin recreation and Host restart. Native sessions and external providers have different evidence. Do not parse prose into guaranteed state, auto-redispatch unknown work or equate Agent completion with platform acceptance/scoring.

### AUD-007 — Windows may leave descendants after the CLI root exits

- **Priority:** P1. **Status:** the baseline Windows gap was addressed in merged [#82](https://github.com/tjyyy3/dsh-playground/pull/82), with follow-up [#87](https://github.com/tjyyy3/dsh-playground/pull/87); #17/#85 are closed. Use those PRs for reported Windows validation and remaining host limits.
- **Already present at the review baseline:** pre-aborted signals do not spawn; POSIX groups escalate SIGTERM to SIGKILL; Windows uses `taskkill /T /F` while the root is alive; waits are bounded and normal exit results are preserved.
- **Evidence:** after a Windows root exits, `terminate()` returns without cleaning surviving descendants. Closing pipes and ending the wait does not prove those descendants stopped. The root-exited test is skipped on Windows. See [cleanup](https://github.com/tjyyy3/dsh-playground/blob/a6c88d5c65a1e95bb02cbb36ae3910111e143eaf/lib/cli.js#L85-L123) and [the test](https://github.com/tjyyy3/dsh-playground/blob/a6c88d5c65a1e95bb02cbb36ae3910111e143eaf/test/cli.test.mjs#L471-L506).
- **Required scope:** inventory plugin-created processes after #74/#75. Login and shared CLI update/version checks still use the runner. The shared update check has its own timeout, not necessarily one UI request's cancellation. Agent-created terminal processes belong to their actual host/tool.
- **Acceptance:** use benign Windows fixtures and OS-level process checks; preserve POSIX behavior and bounded returns. Verify applicable real-DSH lifecycle behavior separately. Unresolved cleanup remains explicitly tracked, not marked fixed by closing output streams.
- **Submission results:** #74 owns attempt retention and ambiguous-result queries. Local cancellation cannot retract an already-completed platform write.

### AUD-008 — API responses need a byte budget during reading

- **Priority:** P2. **Status:** unbounded reading confirmed at the baseline; response budgets and the related credential-bearing-base follow-up were delivered in merged [#86](https://github.com/tjyyy3/dsh-playground/pull/86), closing #78/#79.
- **Evidence:** `response.text()` consumes the entire success/error body before JSON parsing. Timeout/cancellation already cover reading; display truncation happens later. See [request handling](https://github.com/tjyyy3/dsh-playground/blob/a6c88d5c65a1e95bb02cbb36ae3910111e143eaf/lib/api.js#L470-L545) and [existing tests](https://github.com/tjyyy3/dsh-playground/blob/a6c88d5c65a1e95bb02cbb36ae3910111e143eaf/test/api.test.mjs#L37-L87).
- **Required behavior:** count actual bytes while reading in chunks; stop and release resources on overflow. Cover error bodies as well as successes. Content-Length may help early rejection but cannot be the sole check.
- **Budget selection:** justify defaults from legitimate response needs, using endpoint-specific budgets when necessary. Do not reuse upload thresholds or UI character limits. This is a plugin-response resource safeguard, not a material rule.
- **Acceptance:** small fake streams cover exact/over-budget boundaries, multibyte text, missing/inaccurate length headers, cleanup and existing timeout/cancel/network errors. Do not return partial JSON as success or turn a result-query failure into a new submission.

### AUD-009 — Retire ZIP inspection instead of expanding it into a scanner

- **Priority:** P2 / capability limitation. **Status:** folded into #75 with AUD-004 and delivered in merged [#88](https://github.com/tjyyy3/dsh-playground/pull/88); #75 is closed.
- **Evidence:** `summarizeZip` and `bundleLayout` inspect central-directory metadata without decompressing contents. Their production calls are in legacy `inspect`, after the whole ZIP is loaded. Existing wording already describes directory/layout checks, not complete security validation. See [helpers](https://github.com/tjyyy3/dsh-playground/blob/a6c88d5c65a1e95bb02cbb36ae3910111e143eaf/lib/bundle.js#L113-L190) and [call site](https://github.com/tjyyy3/dsh-playground/blob/a6c88d5c65a1e95bb02cbb36ae3910111e143eaf/lib/workflow.js#L1317-L1331).
- **Required behavior:** remove ZIP loading, summaries and layout gates from retired submission preparation. Do not add compression-ratio, expanded-size or complete archive-scanning requirements to the thin handoff.
- **Acceptance:** migration tests show no such scan is triggered. Historical summaries can remain informational or be removed compatibly, without rereading files or implying the current archive was checked. Official failures are relayed under #74.
- **External boundary:** Worker internals were not validated. Do not claim the platform rejects every unsafe archive, or require an external Worker test campaign before this plugin migration. Future plugin extraction/rewriting capabilities need their own review.

## 4. Behavior guarantees to preserve

- Correct registered workspace, task/session, challenge, expected identity and material scope.
- One explicit ordinary request; additional confirmation only for the agreed sensitive cases.
- No parallel legacy upload or duplicate dispatch from repeated clicks.
- Real attempt IDs, ownership checks, idempotent tracking and truthful progress/results.
- Query unknown outcomes before considering another create; do not describe accepted writes as undone by cancellation.
- Label/sanitize untrusted platform text; keep secrets and private local paths out of public logs.
- Supported invocation and cleanup of processes the plugin actually starts.
- Existing durable notices, controller ownership checks and conservative unknown states.

Legacy cards, approval-ID machinery, whole-material checks and the uploader were retired by #88; they are not preservation requirements.

## 5. Implementation and release tracking

The following repository delivery status was verified on 2026-11-20:

| Scope | Closed issue(s) | Merged implementation |
|---|---|---|
| Hybrid scope, lifetime and retained file/reference boundaries | [#73](https://github.com/tjyyy3/dsh-playground/issues/73) | [#83](https://github.com/tjyyy3/dsh-playground/pull/83) |
| Existing-Agent handoff, retired entry points, consent rules and real result tracking | [#74](https://github.com/tjyyy3/dsh-playground/issues/74) | [#88](https://github.com/tjyyy3/dsh-playground/pull/88) |
| Removal of redundant material/ZIP reads and plugin material gates | [#75](https://github.com/tjyyy3/dsh-playground/issues/75) | [#88](https://github.com/tjyyy3/dsh-playground/pull/88) |
| Remote HTTPS and the documented local-development exception | [#76](https://github.com/tjyyy3/dsh-playground/issues/76) | [#80](https://github.com/tjyyy3/dsh-playground/pull/80) |
| Settlement reasons, compatible notices and supported state evidence | [#77](https://github.com/tjyyy3/dsh-playground/issues/77) | [#84](https://github.com/tjyyy3/dsh-playground/pull/84) |
| Windows CLI cleanup and startup/test follow-up | [#17](https://github.com/tjyyy3/dsh-playground/issues/17), [#85](https://github.com/tjyyy3/dsh-playground/issues/85) | [#82](https://github.com/tjyyy3/dsh-playground/pull/82), [#87](https://github.com/tjyyy3/dsh-playground/pull/87) |
| Bounded API response reads and refusal of credential-bearing bases | [#78](https://github.com/tjyyy3/dsh-playground/issues/78), [#79](https://github.com/tjyyy3/dsh-playground/issues/79) | [#86](https://github.com/tjyyy3/dsh-playground/pull/86) |

These are merge and issue-closure records, not claims that this documentation review independently reran the tests. Use each implementation PR for its reported validation, actual environment and remaining limits. Preserve the accepted behavior when changing affected code. Do not repeat closed work solely because the historical findings remain in this audit. Old snapshot, trace/manifest-cap and external Worker-audit prerequisites remain superseded.

## 6. Evidence boundaries and document status

1. Use the linked implementation PRs for reported installed DSH/provider behavior and test coverage. Generic IDs or approval outcomes alone do not prove human consent.
2. Preserve any explicitly unverified host cases. For future runtime changes, run focused checks of the affected behavior; the supplied isolated AUD-003 investigation is not production-path evidence and does not need repeating merely to update these documents.
3. Follow official challenge requirements at execution time. This review did not certify every CLI/API version or Worker internals.
4. Keep issue status, this audit and the implementation plan aligned as fixes land. Later product and refactoring proposals still need their own review.

The documentation PR does not have to merge before a clear independent issue can be implemented.

