import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { PlaygroundApiError } from './api.js';
import { createMaterialAccess } from './material-access.js';
import { publicChallengeUrl } from './links.js';
import { createCatalog } from './catalog.js';
import { readCompetitionNotices } from './competition-notices.js';
import { createAuth } from './auth.js';
import { cleanDetail } from './redaction.js';
import { beijingDate, countSubmissions, detectStatementLimit, parsePlatformTime, submissionLimitsFor, submitPolicy } from './submission/policy.js';
import { createTaskLifecycle } from './task/lifecycle.js';
import { createSubmissionReceipts } from './submission/receipts.js';
import { createSubmissionHandoff } from './submission/handoff.js';
import { createSubmissionOverview } from './submission/overview.js';
import { attemptScopeError, compact, controllerTaskError, fail } from './workflow-result.js';
import { attemptNumber, belongsTo, platformReceivedBundle, receiptBundleMissing, receiptClosed, submissionStateOf, taskAttemptIds, taskAttemptScope, taskBundleClosedIds, taskBundleMissingIds } from './task/evidence.js';
export { SUBMISSION_OVERVIEW_TTL_MS } from './submission/overview.js';

export { cleanDetail, beijingDate, countSubmissions, detectStatementLimit, parsePlatformTime, submitPolicy };
export { submissionLimitsFor, platformReceivedBundle, receiptBundleMissing, taskAttemptIds, taskBundleClosedIds, taskBundleMissingIds };
export { SUBMIT_RULE, ASK_FIRST_REASONS, submissionCountsText } from './submission/policy.js';

// attemptIds lists the submissions made through this conversation, oldest first; receipt stays the latest.
// bundleMissingIds lists the submissions whose latest receipt here says the bundle upload failed, so the
// platform holds no bundle for them. lastFailure is the diagnosis of the latest failed confirmation (see
// cliFailure), kept until a receipt without one replaces it. All three are optional so states persisted
// before they existed still validate under stateVersion 1.
// rejectedBundles lists the bundles the Worker refused in this conversation, per challenge, newest last
// (at most REJECTED_BUNDLES_MAX), so a later failure of another kind does not hide that a bundle was
// refused. It is optional too.
// bundleClosedIds lists the task's submissions that a recorded receipt showed closed by the platform as
// "bundle missing" (bundleNotReceived), so their history rows keep saying so after a newer receipt
// replaced that one. It is optional too.
const stateSchema = z.object({ task: z.json().nullable(), prepared: z.json().nullable(), receipt: z.json().nullable(),
  materialAccess: z.json().optional(), materials: z.json().optional(), submission: z.json().optional(),
  attemptIds: z.array(z.number().int().positive()).optional(), bundleMissingIds: z.array(z.number().int().positive()).optional(),
  bundleClosedIds: z.array(z.number().int().positive()).optional(),
  lastFailure: z.json().optional(),
  rejectedBundles: z.array(z.object({ challengeId: z.string(), sha256: z.string(), at: z.string().optional() })).optional(),
  // Submission limits recorded per challenge (#62): from the statement at a material check, or a platform 429.
  submissionLimits: z.array(z.object({ challengeId: z.string(), source: z.enum(['statement', 'platform']), limit: z.number().int().positive().optional(),
    period: z.string().optional(), excerpt: z.string().optional(), at: z.string().optional() })).optional(),
  // The latest count of today's submissions (countSubmissions), from a material check or a results query.
  submissionCounts: z.json().optional() });
const REJECTED_BUNDLES_MAX = 10;
// A diagnosis of a Worker refusal adds its challenge and bundle hash; the same pair moves to the end.
function withRejectedBundle(state, diagnosis) {
  if (diagnosis?.reason !== 'bundle_rejected' || typeof diagnosis.bundleSha256 !== 'string' || !diagnosis.bundleSha256
    || diagnosis.challengeId === undefined || diagnosis.challengeId === null) return state;
  const entry = compact({ challengeId: String(diagnosis.challengeId), sha256: diagnosis.bundleSha256,
    at: typeof diagnosis.at === 'string' ? diagnosis.at : undefined });
  const kept = (Array.isArray(state.rejectedBundles) ? state.rejectedBundles : [])
    .filter((item) => item.challengeId !== entry.challengeId || item.sha256 !== entry.sha256);
  return { ...state, rejectedBundles: [...kept, entry].slice(-REJECTED_BUNDLES_MAX) };
}
/**
 * Whether the Worker refused this bundle for this challenge in the conversation: by rejectedBundles, or,
 * for a state saved before that field existed, by the latest failure or receipt diagnosis.
 */
// The id of a marked submission leaves the list only with a successful receipt for it (a re-upload) or
// platform evidence that its bundle arrived. Every other receipt for it, an interrupted retry
// (`outcome_unknown`) included, keeps the mark: the bundle most likely is still missing.
// A closed submission stays listed in bundleClosedIds while later receipts, for other submissions,
// replace its receipt; only platform evidence that its bundle arrived removes it.
function withReceiptEvidence(state, receipt) {
  const id = attemptNumber(receipt?.attemptId);
  const clears = receipt?.ok === true || platformReceivedBundle(receipt);
  const missing = taskBundleMissingIds(state).filter((item) => !clears || item !== id);
  if (receiptBundleMissing(receipt) && !missing.includes(id)) missing.push(id);
  const closed = taskBundleClosedIds(state).filter((item) => !platformReceivedBundle(receipt) || item !== id);
  if (receiptClosed(receipt) && !closed.includes(id)) closed.push(id);
  const { lastFailure, bundleMissingIds, bundleClosedIds, ...rest } = state;
  // A results query carries the same diagnosis on; the recorded one keeps whether it was acted on.
  const failure = receipt?.diagnosis && lastFailure?.at === receipt.diagnosis.at ? lastFailure : receipt?.diagnosis;
  return { ...rest, ...(missing.length || bundleMissingIds ? { bundleMissingIds: missing } : {}),
    ...(closed.length || bundleClosedIds ? { bundleClosedIds: closed } : {}),
    ...(failure ? { lastFailure: failure } : {}) };
}

function refreshKeepsEvidence(receipt, next) {
  if (receipt.trackedAt !== next.trackedAt || !isDeepStrictEqual(receipt.agentReport, next.agentReport)) return false;
  if (Date.parse(receipt.updatedAt) > Date.parse(next.updatedAt)) return false;
  const settled = submissionStateOf(receipt) === 'final' || receiptClosed(receipt);
  const nextStatus = submissionStateOf(next);
  return (!settled || nextStatus === 'final' || receiptClosed(next))
    && (receipt.scoringState?.scoreIsFinal !== true || next.scoringState?.scoreIsFinal === true)
    && (!platformReceivedBundle(receipt) || platformReceivedBundle(next) || nextStatus === 'final')
    && (receipt.submissionState !== 'uploaded' || next.submissionState === 'uploaded' || ['running', 'final'].includes(nextStatus));
}
// A material check or a mode switch after a failure means the agent acted on it: the prompt stops
// asking it to read the failure first (index.js), while playground_task status keeps it.
const withFailureSeen = (state) => (state.lastFailure && typeof state.lastFailure === 'object' && !state.lastFailure.superseded
  ? { ...state, lastFailure: { ...state.lastFailure, superseded: true } } : state);
/**
 * Task recorded before webUrl existed: build it from the API base the task was created against, not the
 * current one, so the drawer opens the site the task belongs to. Tasks without a baseUrl stay unchanged.
 */
function taskWithWebUrl(task) {
  if (!task || typeof task !== 'object' || Array.isArray(task) || (typeof task.webUrl === 'string' && task.webUrl)) return task;
  const id = task.challengeId;
  if (typeof task.baseUrl !== 'string' || !task.baseUrl || !((typeof id === 'string' && id) || Number.isFinite(id))) return task;
  return { ...task, webUrl: publicChallengeUrl(task.baseUrl, id) };
}
export const workflowProjection = {
  key: 'playgroundTask', stateVersion: 1, stateSchema,
  init: () => ({ task: null, prepared: null, receipt: null, attemptIds: [] }),
  apply(state, event) {
    let change = event.type === 'tool/result' ? event.data.meta?.playgroundWorkflow : undefined;
    if (event.type === 'command/done' && event.data.text?.startsWith('{"playgroundWorkflow":')) {
      try { change = JSON.parse(event.data.text).playgroundWorkflow; } catch { return state; }
    }
    if (!change) return state;
    if (change.kind === 'submission') return { ...withSubmissionLimit(state, change.limit?.challengeId, change.limit), prepared: null, materialAccess: null, submission: change.submission };
    if (change.kind === 'materials') return { ...state, prepared: null, materialAccess: null, materials: change.materials };
    if (change.kind === 'material-access') return { ...state, materialAccess: change.request };
    // Refused bundles are kept per challenge, so they stay true across a new task or a bind.
    const refused = { ...(Array.isArray(state.rejectedBundles) && state.rejectedBundles.length ? { rejectedBundles: state.rejectedBundles } : {}),
      ...(Array.isArray(state.submissionLimits) && state.submissionLimits.length ? { submissionLimits: state.submissionLimits } : {}) };
    if (change.kind === 'task') return { task: change.task, prepared: null, receipt: null, attemptIds: [], ...refused };
    // Binding an existing conversation keeps the work it already holds for the bound challenge. attemptIds
    // only grow with receipts, so they follow the latest receipt. A task-less conversation that submitted to
    // several challenges can hold earlier ids of another one; ids carry no challenge, and the history drawer
    // lists only the bound challenge's submissions, so they are kept rather than guessed away.
    // The reducer repeats bind()'s guards for results logged in an order bind() could not see: a bind over
    // an existing task is ignored (the first logged bind wins), and the receipt must match the task's scope.
    if (change.kind === 'bind') {
      const id = change.task?.challengeId;
      if (state.task || (state.receipt && (!belongsTo(state.receipt, id)
        || taskAttemptScope({ task: change.task, receipt: state.receipt }).conflict))) return state;
      const keepsReceipt = belongsTo(state.receipt, id);
      const missing = keepsReceipt ? taskBundleMissingIds(state) : [];
      const closed = keepsReceipt ? taskBundleClosedIds(state) : [];
      const failure = state.lastFailure && String(state.lastFailure.challengeId) === String(id) ? state.lastFailure : undefined;
      return { task: change.task, prepared: null,
        receipt: keepsReceipt ? state.receipt : null, attemptIds: keepsReceipt ? taskAttemptIds(state) : [],
        ...(missing.length ? { bundleMissingIds: missing } : {}), ...(closed.length ? { bundleClosedIds: closed } : {}),
        ...(failure ? { lastFailure: failure } : {}), ...refused };
    }
    if (change.kind === 'mode') return { ...withFailureSeen(state), task: { ...state.task, mode: change.mode }, prepared: null };
    // Replay retired check events for historical count snapshots; current entry points never emit them.
    if (change.kind === 'prepared') return { ...state, prepared: change.prepared };
    if (change.kind === 'receipt' || change.kind === 'results') {
      const id = attemptNumber(change.receipt?.attemptId);
      const refresh = change.kind === 'results';
      if (refresh) {
        const currentScope = taskAttemptScope(state);
        if (!id || id !== attemptNumber(state.receipt?.attemptId) || currentScope.conflict
          || taskAttemptScope({ task: currentScope, receipt: change.receipt }).conflict
          || !refreshKeepsEvidence(state.receipt, change.receipt)) return state;
      }
      const previousIds = taskAttemptIds(state);
      const submittedId = attemptNumber(state.submission?.attemptId);
      const advancesSubmission = state.submission && id && !taskAttemptScope({ task: state.submission, receipt: change.receipt }).conflict
        && (submittedId === id || (!submittedId && !refresh && !previousIds.includes(id)));
      const limited = withSubmissionLimit(state, change.receipt?.diagnosis?.challengeId, platformLimitEntry(change.receipt?.diagnosis));
      const counted = change.submissionCounts ? { ...limited, submissionCounts: change.submissionCounts } : limited;
      return { ...withRejectedBundle(withReceiptEvidence(counted, change.receipt), change.receipt?.diagnosis), prepared: null, receipt: change.receipt,
        ...(advancesSubmission ? { submission: { ...state.submission, status: submissionStateOf(change.receipt, change.receipt.submissionState), attemptId: id } } : {}),
        attemptIds: taskAttemptIds({ attemptIds: [...previousIds, id] }) };
    }
    // A failed confirmation that left no receipt clears the card and records its diagnosis.
    if (change.kind === 'clear') return { ...withRejectedBundle(withSubmissionLimit(state, change.failure?.challengeId, platformLimitEntry(change.failure)), change.failure), prepared: null, ...(change.failure ? { lastFailure: change.failure } : {}) };
    return state;
  },
  wire: { viewSchema: stateSchema, view: (state) => ({ ...state, task: taskWithWebUrl(state.task), attemptIds: taskAttemptIds(state),
    ...(taskBundleMissingIds(state).length ? { bundleMissingIds: taskBundleMissingIds(state) } : {}),
    ...(taskBundleClosedIds(state).length ? { bundleClosedIds: taskBundleClosedIds(state) } : {}) }) },
};

export { CHALLENGE_CONTENT_MAX, disciplineFacets } from './catalog.js';
export { loginFailure, cliUpdateNotice } from './auth.js';
export { REASONS_HEADER, withoutReasonsList } from './redaction.js';

const LIMIT_SOURCES = ['statement', 'platform'];
// One recorded limit per challenge and source, newest wins; at most 50 challenges are kept.
function withSubmissionLimit(state, challengeId, entry) {
  if (!entry || challengeId === undefined || challengeId === null || !LIMIT_SOURCES.includes(entry.source)) return state;
  const id = String(challengeId);
  const kept = (Array.isArray(state.submissionLimits) ? state.submissionLimits : []).filter((item) => item.challengeId !== id || item.source !== entry.source);
  return { ...state, submissionLimits: [...kept, compact({ ...entry, challengeId: id })].slice(-100) };
}
// A material check whose statement states no limit removes the statement limit recorded earlier.
function withoutStatementLimit(state, challengeId) {
  if (challengeId === undefined || challengeId === null || !Array.isArray(state.submissionLimits)) return state;
  const id = String(challengeId);
  const kept = state.submissionLimits.filter((item) => item.challengeId !== id || item.source !== 'statement');
  return kept.length === state.submissionLimits.length ? state : { ...state, submissionLimits: kept };
}
// The limit a failed confirmation records: a submission_limit refusal, with the number when the reply names it.
const platformLimitEntry = (failure) => (failure?.reason === 'submission_limit'
  ? compact({ limit: Number.isSafeInteger(failure.platformLimit) ? failure.platformLimit : undefined, at: failure.at, source: 'platform' }) : undefined);
// The platform closes a submission whose bundle never arrived (about an hour later: failed, "bundle
// missing", "请重新提交") and does not score a late upload into it, so the agent reads its state first.
export function createWorkflow({ ctx, client, cli, presentationMeta, tokenStatus, isController, overview = createSubmissionOverview(client) }) {
  const current = (exec) => ctx.sessionProjections.stateOf(exec.agent.session, 'playgroundTask');
  const materialAccess = createMaterialAccess(ctx);
  const materialFailure = (error) => ({ ...fail(error.message, error.code),
    ...(error.materialAccess ? { workflow: { kind: 'material-access', request: error.materialAccess } } : { workflow: { kind: 'clear' } }) });
  // Keep identity and quota reads on the same token for this operation.
  const sessionToken = async () => (typeof client.currentToken === 'function' ? client.currentToken() : undefined);


  const { countsFor, forgetOverview } = overview;
  const { catalog, challenge } = createCatalog({ client });
  const { auth, login, requireAuth, userOrUndefined } = createAuth({ ctx, client, cli, tokenStatus });
  /**
   * #63: the ask-first policy for a new submission to `challenge` from today's counts read now (bypassing
   * the overview cache) and the limits recorded now. `counts` is undefined when they cannot be read.
   */
  async function livePolicy(challenge, exec, { token, user } = {}) {
    const recorded = submissionLimitsFor(current(exec), challenge?.id).filter((entry) => entry.source !== 'statement');
    const statement = detectStatementLimit(challenge?.content);
    const limits = statement ? [...recorded, statement] : recorded;
    user ??= await userOrUndefined(exec, token);
    const counts = user ? await countsFor(String(challenge.id), exec, { token, user, limits }) : undefined;
    return { counts, user, limits, policy: submitPolicy({ counts, limits, challenge, user }) };
  }
  /** The policy for the task's challenge, for playground_task status; undefined without a task. */
  async function taskPolicy(exec) {
    const state = current(exec);
    const task = state?.task;
    if (task?.challengeId === undefined || task.challengeId === null || task.challengeId === '') return undefined;
    const issue = attemptScopeError(taskAttemptScope(state), client.baseUrl);
    if (issue) return issue;
    const challenge = await client.getChallenge(String(task.challengeId), { signal: exec.signal });
    return livePolicy(challenge, exec, { token: await sessionToken() });
  }
  const changes = new Map();
  const materialKeys = ['outputs_path', 'bundle_path', 'trace_path', 'manifest_path'];
  async function record(workflow, exec) {
    const id = randomUUID();
    changes.set(id, { sessionId: exec.agent.id, workflow });
    try {
      const logged = await ctx.commands.execute(exec.agent, `/playground ${JSON.stringify({ action: 'record_submission', id })}`, [], exec.signal);
      if (logged?.result?.kind !== 'success') throw new PlaygroundApiError('无法保存提交交接状态，未继续派发。', { code: 'record_failed' });
    } finally { changes.delete(id); }
  }

  async function resolveMaterials(args, exec, operation) {
    const input = Object.fromEntries(materialKeys.flatMap((key) => {
      const value = args[key];
      return typeof value === 'string' && value.trim() ? [[key, value.trim()]] : [];
    }));
    const access = await materialAccess.begin(exec, { ...input, action: args.action, ...(args.material_request_id ? { material_request_id: args.material_request_id } : {}) }, operation);
    const keys = Object.keys(input);
    const paths = await access.resolveAll(keys.map((key) => ({ path: input[key] })));
    return { access, materials: Object.fromEntries(keys.map((key, index) => [key, paths[index]])) };
  }

  async function setMaterials(args, exec) {
    if (isController?.(exec.agent)) return controllerTaskError();
    try {
      const { materials } = await resolveMaterials({ ...args, action: 'materials' }, exec, 'check');
      return { ok: true, materials, note: '仅记录已授权的材料引用，没有读取内容、检查格式或提交。', workflow: { kind: 'materials', materials } };
    } catch (error) { return materialFailure(error); }
  }

  const { start, bind } = createTaskLifecycle({ ctx, client, current, requireAuth, isController });
  const { requestSubmission } = createSubmissionHandoff({ ctx, client, current, requireAuth, sessionToken, livePolicy, isController,
    resolveMaterials, materialFailure, record });
  const { attempt, results, track, reportSubmission } = createSubmissionReceipts({ client, current, requireAuth, isController,
    sessionToken, countsFor, forgetOverview, presentationMeta });

  // The current account's submissions for one challenge, including those made outside the plugin.
  // Read-only and session-free: it neither reads nor writes any conversation.
  async function myAttempts(args, exec) {
    const issue = attemptScopeError(args, client.baseUrl);
    if (issue) return issue;
    try {
      return { ok: true, ...await overview.history(args, exec) };
    } catch (error) {
      if (error?.code === 'authentication_required') return fail('登录后可查看提交历史。', 'authentication_required');
      throw error;
    }
  }

  return { start, bind, results, track, taskPolicy, catalog, competitionNotices: (exec) => readCompetitionNotices(client, exec),
    auth, attempt, login, myAttempts, challenge, materialAccess, requestSubmission, setMaterials, reportSubmission,
    async command(inv) {
      const input = JSON.parse(inv.rawInput);
      const exec = { agent: inv.agent, signal: inv.signal };
      let result;
      // Login status and catalog reads use the session-free query service (lib/queries.js).
      if (['context', 'mode'].includes(input.action) && isController?.(exec.agent)) result = controllerTaskError();
      else if (input.action === 'context') result = { ok: true, workflow: { kind: 'task', task: input.task } };
      else if (input.action === 'mode') {
        const state = current(exec);
        result = state?.task ? { ok: true, workflow: { kind: 'mode', mode: input.mode === 'author' ? 'author' : 'participate' } } : fail('当前没有任务。');
      } else if (input.action === 'start') result = await start(input, exec);
      else if (input.action === 'record_submission') {
        const pending = changes.get(input.id);
        if (!pending || pending.sessionId !== exec.agent.id) result = fail('提交状态记录已失效。', 'invalid_request');
        else { changes.delete(input.id); result = { ok: true, workflow: pending.workflow }; }
      }
      else if (input.action === 'materials') result = await setMaterials(input, exec);
      else if (input.action === 'results') result = await results(input, exec);
      else return { kind: 'error', text: '未知 Playground 操作。' };
      return { kind: result.ok ? 'success' : 'error', text: JSON.stringify({ playgroundWorkflow: result.workflow, ...result }) };
    },
  };
}
