export const attemptNumber = (value) => {
  const id = typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : value;
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
};

// The platform's timestamps without an offset are UTC.
const NO_OFFSET_TIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/;
export function parsePlatformTime(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return Number.NaN;
  const text = value.trim();
  return Date.parse(NO_OFFSET_TIME.test(text) ? `${text.replace(' ', 'T')}Z` : text);
}

export function compareAttemptUpdates(previous, next) {
  const before = parsePlatformTime(previous);
  const after = parsePlatformTime(next);
  return Number.isFinite(before) && Number.isFinite(after) ? Math.sign(after - before) : undefined;
}

const observedWorker = (attempt) => attempt.scoringQueue?.workerReceivedAt ?? attempt.lastWorkerReceivedAt;

// updatedAt belongs to the attempt row. The owner queue separately identifies the latest Worker
// job by its creation time. A final attempt omits that queue, so retain its last observed job.
export function compareAttemptRevisions(previous, next) {
  const row = compareAttemptUpdates(previous.updatedAt, next.updatedAt);
  if (row) return row;
  const job = compareAttemptUpdates(observedWorker(previous), observedWorker(next));
  if (job) return job;
  if (row === undefined && Number.isFinite(parsePlatformTime(previous.updatedAt))) return -1;
  return row ?? job;
}

export const ATTEMPT_STATE_FIELDS = ['status', 'bundleStatus', 'score', 'scoringState', 'scoringQueue', 'bundleNotReceived'];

export function refreshedAttemptFields(previous, incoming, order) {
  const attempt = {};
  for (const field of ATTEMPT_STATE_FIELDS) {
    attempt[field] = incoming[field] ?? (order === 1 ? undefined : previous[field]);
  }
  if (!incoming.scoringQueue && (incoming.scoringState?.scoreIsFinal || incoming.scoringState?.state === 'provisional')) {
    attempt.scoringQueue = undefined;
  }
  attempt.updatedAt = Number.isFinite(parsePlatformTime(incoming.updatedAt)) ? incoming.updatedAt : previous.updatedAt;
  const lastWorkerReceivedAt = observedWorker(incoming) ?? observedWorker(previous);
  if (lastWorkerReceivedAt) attempt.lastWorkerReceivedAt = lastWorkerReceivedAt;
  return attempt;
}

// A queued zero is a placeholder. An explicitly provisional zero is a reference, and only the
// platform's final flag publishes a score. Legacy string scoring states carry no such flag.
export function attemptScore(item) {
  const raw = item?.scoringState;
  const scoring = typeof raw === 'string' ? { state: raw } : raw || {};
  const failed = [scoring.state, item?.status].some((value) => ['failed', 'rejected'].includes(value)) || item?.bundleStatus === 'failed';
  const scoreIsFinal = !failed && scoring.scoreIsFinal === true;
  const finalScore = scoreIsFinal ? scoring.displayScore ?? item?.score : undefined;
  const reference = scoreIsFinal || failed ? undefined : scoring.provisionalScore ?? scoring.displayScore ?? item?.score;
  const explicitZero = scoring.state === 'provisional' && scoring.provisionalScore === 0;
  return { scoring, failed, scoreIsFinal, finalScore, referenceScore: Number.isFinite(reference) && (reference !== 0 || explicitZero) ? reference : undefined };
}

/** Attempt ids attributed to a task state; states without the field derive it from the latest receipt. */
export function taskAttemptIds(state) {
  const ids = Array.isArray(state?.attemptIds) ? state.attemptIds.map(attemptNumber) : [attemptNumber(state?.receipt?.attemptId)];
  return [...new Set(ids.filter((id) => id !== undefined))];
}
// Platform states that the Worker can only reach with a bundle in hand.
const RECEIVED_STATES = new Set(['evaluating', 'scoring', 'provisional', 'final', 'late_scored']);
// Platform states after which an attempt's countsTowardQuota no longer changes.
const FINISHED_STATUSES = new Set(['final', 'late_scored', 'failed', 'rejected', 'cancelled', 'closed']);
/**
 * The platform's evidence that a submission's bundle arrived: an evaluating, provisional or final state, or
 * a `scoringQueue.workerReceivedAt` time. The platform's `awaiting_receipt` queue stage is not used the
 * other way round (see README): it is also the normal state between creating a submission and its upload.
 */
export function platformReceivedBundle(attempt) {
  const state = typeof attempt?.scoringState === 'string' ? attempt.scoringState : attempt?.scoringState?.state;
  return RECEIVED_STATES.has(state) || (typeof attempt?.scoringQueue?.workerReceivedAt === 'string' && attempt.scoringQueue.workerReceivedAt !== '');
}

// Within one Worker job, the platform resolves queued, evaluating, Harbor's provisional reward,
// then trace scoring. The trace stage is also presented as evaluating.
function workerPhase(attempt, scoring) {
  if (scoring.state === 'provisional') return 3;
  if (scoring.workerStatus === 'trace_scoring') return 4;
  if (['evaluating', 'scoring'].includes(scoring.state)) return 2;
  return platformReceivedBundle(attempt) ? 1 : 0;
}

export function keepsWorkerProgress(previous, next) {
  const before = attemptScore(previous);
  const after = attemptScore(next);
  const phase = workerPhase(next, after.scoring) - workerPhase(previous, before.scoring);
  return phase > 0 || (phase === 0 && (before.referenceScore === undefined || after.referenceScore !== undefined));
}
export const submissionStateOf = (attempt, fallback = 'created') => attempt.scoringState?.scoreIsFinal
  || [attempt.status, attempt.scoringState?.state].some((state) => FINISHED_STATUSES.has(state)) ? 'final'
  : platformReceivedBundle(attempt) ? 'running' : fallback;
// The plugin's own evidence that a submission has no bundle: its confirmation created the submission and
// the upload into it failed. Only `upload_failed` says so; an unknown outcome does not. Platform evidence
// of receipt (a results query merges the platform attempt into the receipt) overrides it.
export const receiptBundleMissing = (receipt) => receipt?.ok === false && receipt?.error?.code === 'upload_failed'
  && attemptNumber(receipt?.attemptId) !== undefined && !platformReceivedBundle(receipt);
/** Submissions without a bundle by this task's receipts; states without the field derive it from the latest receipt. */
export function taskBundleMissingIds(state) {
  const ids = Array.isArray(state?.bundleMissingIds) ? state.bundleMissingIds.map(attemptNumber) : [];
  if (receiptBundleMissing(state?.receipt)) ids.push(attemptNumber(state.receipt.attemptId));
  return [...new Set(ids.filter((id) => id !== undefined))];
}
// A receipt that shows the platform closed its submission as "bundle missing" (a results query merges
// the platform attempt, with bundleNotReceived, into the receipt).
export const receiptClosed = (receipt) => receipt?.bundleNotReceived === true && attemptNumber(receipt?.attemptId) !== undefined;
/**
 * Submissions of this task the platform closed as "bundle missing", by every receipt recorded here;
 * states without the field derive it from the latest receipt.
 */
export function taskBundleClosedIds(state) {
  const ids = Array.isArray(state?.bundleClosedIds) ? state.bundleClosedIds.map(attemptNumber) : [];
  if (receiptClosed(state?.receipt)) ids.push(attemptNumber(state.receipt.attemptId));
  return [...new Set(ids.filter((id) => id !== undefined))];
}
// Older receipts name their challenge through challenge.id or the caller's args.challenge_id.
export const workChallengeId = (item) => {
  const id = item?.challenge?.id ?? item?.challengeId ?? item?.args?.challenge_id;
  return id === undefined || id === null ? undefined : String(id);
};
export const belongsTo = (item, challengeId) => Boolean(item) && workChallengeId(item) === String(challengeId);

export function taskAttemptScope(state) {
  const { task, receipt } = state || {};
  const taskId = workChallengeId(task);
  const receiptId = workChallengeId(receipt);
  if (task?.baseUrl && receipt?.baseUrl && task.baseUrl !== receipt.baseUrl) return { conflict: 'platform_changed' };
  if (taskId && receiptId && taskId !== receiptId) return { conflict: 'challenge_mismatch' };
  return { baseUrl: task?.baseUrl || receipt?.baseUrl, challengeId: taskId || receiptId };
}
