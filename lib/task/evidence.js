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

/** Attempt ids attributed to a task state; states without the field derive it from the latest receipt. */
export function taskAttemptIds(state) {
  const ids = Array.isArray(state?.attemptIds) ? state.attemptIds.map(attemptNumber) : [attemptNumber(state?.receipt?.attemptId)];
  return [...new Set(ids.filter((id) => id !== undefined))];
}
// Platform states that the Worker can only reach with a bundle in hand.
const RECEIVED_STATES = new Set(['evaluating', 'scoring', 'final', 'late_scored']);
// Platform states after which an attempt's countsTowardQuota no longer changes.
const FINISHED_STATUSES = new Set(['final', 'late_scored', 'failed', 'rejected', 'cancelled', 'closed']);
/**
 * The platform's evidence that a submission's bundle arrived: an evaluating, scoring or final state, or
 * a `scoringQueue.workerReceivedAt` time. The platform's `awaiting_receipt` queue stage is not used the
 * other way round (see README): it is also the normal state between creating a submission and its upload.
 */
export function platformReceivedBundle(attempt) {
  const state = typeof attempt?.scoringState === 'string' ? attempt.scoringState : attempt?.scoringState?.state;
  return RECEIVED_STATES.has(state) || (typeof attempt?.scoringQueue?.workerReceivedAt === 'string' && attempt.scoringQueue.workerReceivedAt !== '');
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
