import { attemptNumber, attemptScore, parsePlatformTime, platformReceivedBundle, taskAttemptIds, taskAttemptScope } from '../../../lib/task/evidence.js';
import { beijingDate } from '../../../lib/submission/policy.js';
import { msg } from '../shared/language.js';
import { receiptAttemptId, receiptProgress } from './attempts.js';

export const needsQuotaDecision = (request) => request?.status === 'awaiting_user' && request.policy?.askFirst !== false;

export function submissionStatus(item, bundleMissing) {
  const progress = receiptProgress(item, undefined, { bundleMissing });
  if (item?.bundleNotReceived && !progress.scoreIsFinal) return { key: 'missing', tone: 'warning', shape: 'dot', label: msg('未收到评测包，需重新提交', 'Bundle missing. Submit again.') };
  if (progress.stage === 'failed') return { key: 'failed', tone: 'error', shape: 'ring', label: msg('未通过', 'Failed') };
  if (progress.scoreIsFinal) return { key: 'final', tone: 'scored', shape: 'square', label: progress.stage === 'finalLate' ? msg('赛后评分完成', 'Late score finalized') : msg('评分完成', 'Scored') };
  if (!platformReceivedBundle(item) && item?.submissionState === 'created') return { key: 'created', tone: 'warning', shape: 'striped', label: msg('已创建，上传未确认', 'Created. Upload unconfirmed.') };
  if (progress.stage === 'evaluating') return { key: 'evaluating', tone: 'evaluating', shape: 'dot', label: msg('评测中', 'Evaluating') };
  return { key: bundleMissing || progress.stage === 'incomplete' || item?.scoringState?.actionNeeded ? 'attention' : 'other', tone: progress.badgeTone, label: progress.badgeText };
}

export const needsAttention = (key) => ['missing', 'created', 'attention'].includes(key);

export function submissionTotals(items, { counts, scoringTotals, partial, nextCursor } = {}, now = new Date()) {
  const date = beijingDate(now);
  if (!items || partial) return { date };
  const statuses = items.map(({ attempt, bundleMissing }) => submissionStatus(attempt, bundleMissing).key);
  return {
    date,
    total: counts?.lifetime ?? (nextCursor ? undefined : items.length),
    today: counts?.partialReasons?.includes('time_unknown') ? undefined : counts?.date === date ? counts.total
      : nextCursor || items.some(({ attempt }) => !beijingDate(attempt.createdAt)) ? undefined
        : items.filter(({ attempt }) => beijingDate(attempt.createdAt) === date).length,
    final: scoringTotals?.final ?? (nextCursor ? undefined : statuses.filter((key) => key === 'final').length),
    attention: scoringTotals?.attention ?? (nextCursor ? undefined : statuses.filter(needsAttention).length),
  };
}

export function lifecycle(session, state, request, receipt) {
  const attemptId = receiptAttemptId(receipt);
  const previousId = attemptNumber(request?.latestAttemptId);
  const waitingForNewId = request?.requestId && (request.status === 'awaiting_user' || previousId === attemptId);
  const currentId = attemptNumber(request?.attemptId) ?? (waitingForNewId ? undefined : attemptId);
  const evidence = currentId === attemptId && currentId ? receipt : undefined;
  const evaluated = platformReceivedBundle(evidence) || evidence?.bundleNotReceived === true;
  const complete = evaluated && (attemptScore(evidence).scoreIsFinal || evidence?.bundleNotReceived === true || attemptScore(evidence).failed)
    || Boolean(evidence && attemptScore(evidence).failed);
  const agentEvidence = session.running || request?.reportedBy === 'agent' || Boolean(receipt?.agentReport);
  const requesting = needsQuotaDecision(request) || ['dispatching', 'dispatched', 'unknown', 'not_created'].includes(request?.status);
  return [
    { reached: Boolean(state?.task), time: session.createdAt, source: 'host' },
    { reached: agentEvidence, time: receipt?.agentReport?.at, source: session.running ? 'host' : 'agent' },
    { reached: Boolean(request?.requestId), current: requesting, time: request?.requestedAt ?? request?.dispatchedAt, source: 'host' },
    { reached: Boolean(currentId), time: evidence?.createdAt ?? evidence?.trackedAt, source: evidence?.createdAt ? 'platform' : 'host' },
    { reached: evaluated, time: evidence?.scoringQueue?.workerReceivedAt, source: 'platform' },
    { reached: complete, time: evidence?.updatedAt, source: 'platform' },
  ];
}

export function compareFinalScores(first, second) {
  const a = attemptScore(first);
  const b = attemptScore(second);
  if (first?.challengeId !== second?.challengeId || !Number.isFinite(a.finalScore) || !Number.isFinite(b.finalScore)) return undefined;
  return a.finalScore - b.finalScore;
}

export function scoreDimensions(attempt) {
  if (attempt?.scorecardTruncated) return [];
  let dimensions;
  try { dimensions = JSON.parse(attempt?.scorecard ?? 'null')?.dimensions; } catch { return []; }
  if (!dimensions || typeof dimensions !== 'object' || Array.isArray(dimensions)) return [];
  return Object.entries(dimensions).filter(([label, score]) => label.trim() && Number.isFinite(score));
}

export const sortSubmissionRows = (a, b) => (parsePlatformTime(b.createdAt) || 0) - (parsePlatformTime(a.createdAt) || 0) || b.id - a.id;

export function attributedAttempt(state, attempt) {
  const scope = taskAttemptScope(state);
  return !scope.conflict && scope.challengeId === attempt.challengeId && taskAttemptIds(state).includes(attempt.id)
    && (!scope.baseUrl || !attempt.baseUrl || scope.baseUrl === attempt.baseUrl);
}
