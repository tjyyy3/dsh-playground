# Security and Reliability Audit

> Audit snapshot: 2026-11-16  
> Reviewed revision: `a6c88d5c65a1e95bb02cbb36ae3910111e143eaf` (`main`, 0.5.0-preview.7)  
> Scope: static review of the plugin source, tests, README and current CI configuration. This is not a penetration test and does not claim that every finding has been reproduced in a live DSH host.

## 1. Product and security decisions

The following decisions were confirmed during review and are treated as requirements:

1. **File access:** workspace files are allowed by default. Files outside the workspace may be used only after explicit user authorization for the specific file and purpose.
2. **Submission authorization:** an explicit user request in the conversation authorizes an ordinary submission. If the challenge states a submission limit, today's quota has already been used, or the platform has returned a quota limit, the user must give an additional confirmation.
3. **Product direction:** Playground competition workflows remain the product centre: participant, author and organizer workflows. Agent orchestration is an enabling capability, not a separate generic agent manager.
4. **Review scope:** security, reliability, product and engineering roadmap are all in scope.

## 2. Severity and evidence labels

- **P0 / Critical:** a trust-boundary or data-integrity issue that should block release until addressed or explicitly accepted.
- **P1 / High:** a material reliability or security weakness with a practical mitigation.
- **P2 / Medium:** meaningful quality or maintainability improvement.
- **Confirmed from code:** the relevant behavior is directly visible in the reviewed revision.
- **Needs host validation:** the source shows a dependency on DSH behavior that cannot be established from this repository alone.
- **Defense-in-depth:** a risk whose final exploitability depends on the external platform or runtime.

A confirmed code behavior is not automatically a confirmed exploit. Findings below distinguish those cases.

## 3. Findings

### AUD-001 — File reads are not confined to the selected workspace

- **Severity:** P0
- **Status:** Confirmed from code; intended product policy now clarified.
- **Areas:** `index.js` — `resolveToolPath`, `readBundle`, `readTrace`, `readManifest`; `lib/workflow.js` — `inspect`.
- **Evidence:** absolute paths are accepted directly; relative paths are resolved against the working directory without rejecting paths that escape it. The readers then open the resolved path. There is no workspace-root containment check in this path-resolution helper.
- **Impact:** an agent that is induced by untrusted challenge content or other context to select an unintended local file may cause that file to be read and potentially included in a platform upload. The confirmation card displays file metadata, but that is not equivalent to an explicit external-file authorization step.
- **Required behavior:** workspace-contained files are the default. For an external file, require a user-originated authorization bound to the canonical real path, operation purpose (read/check/upload), and preferably file fingerprint. Agent-supplied tool arguments alone must not create this authorization.
- **Implementation notes:** canonicalize both workspace root and target with `realpath`; compare path components using platform-aware semantics; reject traversal and symlink escapes; handle missing files safely; revalidate before use. Do not use naive string-prefix checks (for example, `/work/project-evil` starts with `/work/project`).
- **Acceptance tests:** `../` traversal rejected; absolute path outside root rejected by default; symlink to outside rejected; symlink within root accepted if policy permits; explicitly authorized external file accepted; authorization for one file cannot authorize another file or another purpose.

### AUD-002 — File contents can change between final check and CLI upload

- **Severity:** P0
- **Status:** Confirmed TOCTOU window in the CLI submission path.
- **Areas:** `lib/workflow.js` — `inspect`, `confirmOnce`; `index.js` — `readBundle`, `readTrace`, `readManifest`; `lib/cli.js` — `submit`.
- **Evidence:** confirmation re-runs inspection and compares recorded file metadata including SHA-256. The CLI is then invoked with file paths and independently reads the files. A writer can modify a file after the last hash check but before the CLI reads it.
- **Impact:** the bytes uploaded may differ from the bytes the user approved. This undermines the integrity promise of the confirmation card.
- **Required behavior:** upload exactly the immutable bytes that were checked and approved.
- **Preferred implementation:** create a protected temporary snapshot during inspection, hash the snapshot, show its fingerprint in the approval UI, and pass the snapshot path to the CLI. Verify the snapshot fingerprint immediately before invocation and clean it up after the operation. If the CLI can accept streams or file descriptors in a future version, prefer that interface.
- **Acceptance tests:** mutate the original file after inspection and after confirmation; verify the approved snapshot is still uploaded; tampering with the snapshot itself must fail closed; cleanup must occur on success, failure, cancellation and DSH shutdown.

### AUD-003 — Submission authorization depends partly on model-provided assertions

- **Severity:** P0
- **Status:** Confirmed trust-boundary limitation; exact exploitability depends on DSH tool-call provenance.
- **Areas:** `lib/workflow.js` — `submitApproved`, `submitPolicy`, `confirm`; `index.js` — tool registration and submission guidance.
- **Evidence:** the quota exception is represented by the tool argument `user_confirmed_limit: true`. The plugin checks the Boolean value, but the reviewed code does not bind it to a verifiable DSH user-approval event. Ordinary submission intent is also conveyed through agent instructions that say the user must explicitly request submission.
- **Impact:** a model can potentially assert that the user agreed without the plugin independently proving that the required user message or approval event occurred. Prompt rules reduce accidental misuse but are not a security boundary.
- **Required behavior:** preserve the agreed policy: ordinary submission requires explicit user intent in the conversation; quota-sensitive submission additionally requires user confirmation. The program must not treat a model-authored Boolean as proof of that confirmation.
- **Implementation options:** use a DSH-originated user-message / approval event with provenance if the host exposes one; otherwise use a host approval panel or workbench confirmation for quota-sensitive writes. Bind authorization to session, challenge, account identity, operation (new submission vs retry), and approved file hashes; make it one-time and expire it. A retry into an existing attempt must remain distinguishable from creating a new attempt.
- **Host validation required:** determine whether DSH tool execution metadata can distinguish a user-originated event from an agent-generated tool call, and whether agents can invoke user-only commands. Do not claim a hard guarantee until tested.
- **Acceptance tests:** agent-only tool call cannot manufacture quota consent; a real user confirmation permits exactly one matching operation; changed challenge, identity, files or operation invalidates authorization; replay is rejected.

### AUD-004 — Trace and manifest reads have no explicit size limits

- **Severity:** P1
- **Status:** Confirmed from code.
- **Areas:** `index.js` — `readTrace`, `readManifest`; compare with `readBundle` and `MAX_BUNDLE_BYTES` in `lib/api.js`.
- **Evidence:** bundle reads enforce a 200 MiB limit, while trace and manifest are read as complete UTF-8 strings without corresponding byte limits. Trace parsing and conversion can allocate additional copies.
- **Impact:** unexpectedly large or hostile files can cause excessive memory use, long event-loop stalls or process termination.
- **Required behavior:** enforce documented byte limits before reading; validate JSONL incrementally where practical; avoid unnecessary full-size copies; make limits configurable only within safe upper bounds.
- **Acceptance tests:** files exactly at and just above each limit; multibyte UTF-8 boundaries; very long JSONL line; malformed final line; cancellation during reading.

### AUD-005 — API credentials may be sent over cleartext HTTP for custom API bases

- **Severity:** P1
- **Status:** Confirmed from code; custom HTTP use may be intentional for local development.
- **Areas:** `lib/api.js` — `normalizeApiBase`, `request`; `index.js` — `normalizeSettings`.
- **Evidence:** `normalizeApiBase` accepts both `http:` and `https:`; `request` attaches the Bearer token whenever a token is available.
- **Impact:** when a non-local HTTP base URL is configured, the Authorization header can be observed or modified in transit.
- **Required behavior:** require HTTPS for non-loopback hosts. If local HTTP is needed for development, restrict it to loopback addresses or require a conspicuous explicit unsafe-development override. Never silently downgrade HTTPS.
- **Acceptance tests:** HTTPS accepted; loopback HTTP accepted only under the documented development policy; non-loopback HTTP rejected by default; no token attached to a rejected destination.

### AUD-006 — Controller running-state evidence is partly process-local

- **Severity:** P1
- **Status:** Confirmed from code; recovery behavior needs real-host validation.
- **Areas:** `lib/controller.js` — `lifecycle` Map, `observeStart`, `observeEnd`, `tasks`; `controllerNoticesProjection`.
- **Evidence:** child start/end facts are held in an in-memory `Map`; settled inbox notices are persisted through a projection. After a host restart, the in-memory lifecycle map is empty. A child with no persisted settled notice can be shown as `unknown`, even if it was running or finished before restart.
- **Impact:** users may lose confidence in whether delegated work is still running, completed, failed or cancelled. Retrying an unknown task can duplicate work.
- **Required behavior:** reconstruct task state from durable DSH session events / projections where possible. Represent unknown as unknown; never silently convert it to failed or completed. Before retrying an unknown task, inspect its session and artifacts.
- **Acceptance tests:** restart while child is running; restart after child completes but before notice delivery; restart after failure/cancellation; archived child; missing or inaccessible session. Verify the UI distinguishes running, settled, failed, cancelled and unknown only when evidence is insufficient.

### AUD-007 — Windows may leave a descendant process after the CLI root exits

- **Severity:** P1
- **Status:** Residual platform-specific limitation; the current code already addresses several cases and has corresponding tests. [Issue #17](https://github.com/tjyyy3/dsh-playground/issues/17) remains open.
- **Area:** `lib/cli.js` — `terminate`, `trackGroup`, `run`; `test/cli.test.mjs`.
- **Evidence:** the current runner checks an already-aborted signal before spawning. POSIX uses a detached process group and escalates SIGTERM to SIGKILL; tests cover a CLI that ignores SIGTERM. Windows uses `taskkill /T /F` while the root process is alive. The Windows test comments explicitly note that Windows cannot end a grandchild after the CLI root has already exited while the grandchild still holds output pipes open.
- **Impact:** a descendant may outlive the timed-out operation on Windows in this edge case. The plugin can return after destroying its output streams, but that alone does not prove the descendant has stopped.
- **Required behavior:** establish a Windows process-tree strategy that can also identify and terminate descendants after the root exits, or document the residual limitation and avoid claiming complete descendant cleanup. Preserve bounded return time and ambiguous-submission safeguards.
- **Already covered:** pre-aborted signal does not spawn; POSIX SIGTERM-ignoring process is escalated; POSIX process-group cleanup handles a grandchild that holds output open.
- **Remaining acceptance tests:** Windows CLI exits cleanly while a grandchild holds stdout/stderr open; Windows cmd fallback with descendants; cancellation during upload; verify no orphan process using an OS-level process check.

### AUD-008 — API response bodies are read without a byte ceiling

- **Severity:** P2
- **Status:** Confirmed from code.
- **Area:** `lib/api.js` — `request`.
- **Evidence:** `response.text()` reads the complete response before JSON parsing. There is no explicit response-size ceiling.
- **Impact:** oversized responses can consume excessive memory. Public challenge content and scorecards are platform-controlled input.
- **Required behavior:** enforce a response-body ceiling, with endpoint-specific limits if necessary. Keep error-body parsing bounded too.
- **Acceptance tests:** oversized success response, oversized error response, normal large challenge within the documented limit.

### AUD-009 — ZIP metadata summary is not a complete archive safety validator

- **Severity:** P2 / defense-in-depth
- **Status:** Confirmed limitation, not a demonstrated platform exploit.
- **Area:** `lib/bundle.js` — `summarizeZip`, `bundleLayout`.
- **Evidence:** the plugin reads central-directory metadata only; it does not decompress entries or validate the full archive contents. The summary reports uncompressed sizes and symlinks but does not establish that every entry is safe to extract.
- **Impact:** archive path traversal, duplicate entries, extreme compression ratios and malformed ZIP edge cases must ultimately be handled by the platform Worker / CLI. The plugin's summary must not be presented as a complete security validation.
- **Required behavior:** retain the current honest wording that the plugin checks only outer layout. Consider warnings for extreme total uncompressed size or compression ratio. Confirm that the official CLI / Worker rejects traversal paths, duplicate names, unsupported symlinks and ZIP bombs.
- **Acceptance tests:** crafted archives for each case against the supported CLI and, where available, a safe staging Worker. Do not extract untrusted archives in the DSH host process.

## 4. Existing protections to preserve

The following are valuable and should not be weakened during refactoring:

- Confirmation cards bind to checked material hashes and platform identity.
- Re-check occurs before confirmation; a changed file or base URL invalidates the card.
- Approval IDs are derived from a process-local HMAC key; stale approvals do not survive a DSH restart.
- In-flight confirmation is deduplicated per conversation.
- Ambiguous submission outcomes are not blindly retried.
- Failed bundle uploads retain the attempt ID for safe retry where the platform still accepts the attempt.
- Platform-provided error text is cleaned and labelled as untrusted data.
- CLI execution avoids shell invocation by default and includes platform-specific process cleanup.
- Controller dispatch verifies workspace/session ownership and serializes operations per workspace.

## 5. Release gates

Before calling the next release production-ready, require:

- [ ] AUD-001 external file authorization and workspace containment tests.
- [ ] AUD-002 immutable upload snapshot or a documented equivalent.
- [ ] AUD-003 DSH provenance / quota confirmation design verified in the real host.
- [ ] AUD-004 bounded trace and manifest reads.
- [ ] AUD-005 safe HTTP policy.
- [ ] AUD-006 restart recovery behavior tested in real DSH.
- [ ] AUD-007 Issue #17 acceptance tests completed or residual risk explicitly documented.
- [ ] AUD-008 response-body bounds.
- [ ] AUD-009 official CLI / Worker archive validation behavior documented.

## 6. Review limitations and next evidence needed

This review did not execute the plugin in a real DSH installation, inspect the external Playground Worker implementation, or verify every supported Playground CLI version. The following evidence is still needed:

1. DSH's actual authorization provenance and user-only command semantics.
2. The official CLI / Worker archive extraction and validation behavior.
3. Real Windows and macOS cancellation behavior inside DSH, not only GitHub Actions.
4. The expected product rule for explicitly authorized files outside the workspace, including whether authorization is per operation or can be remembered for a session.
