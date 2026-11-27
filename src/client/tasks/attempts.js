import { msg } from '../shared/language.js';
import { stateLabel, zhText } from '../shared/locale.js';
import { compareAttemptUpdates, parsePlatformTime, taskAttemptScope } from '../../../lib/task/evidence.js';

// Score rules shared by every attempt display. A failed or rejected attempt has no score, even if a
// final flag is set. Only a score the platform marks final is a score. A non-zero non-final score is
// a reference while evaluation is pending. Receipts saved by older versions may carry `scoringState`
// as a bare string (CLI output copied verbatim); it names the state only and never implies that the
// score is final. New receipts always carry the normalised object.
function attemptScore(item) {
  const raw = item?.scoringState;
  const scoring = typeof raw === 'string' ? { state: raw } : raw || {};
  const failed = [scoring.state, item?.status].some((value) => ['failed', 'rejected'].includes(value)) || item?.bundleStatus === 'failed';
  const scoreIsFinal = !failed && scoring.scoreIsFinal === true;
  const finalScore = scoreIsFinal ? scoring.displayScore ?? item?.score : undefined;
  const reference = scoreIsFinal || failed ? undefined : scoring.provisionalScore ?? scoring.displayScore ?? item?.score;
  return { scoring, failed, scoreIsFinal, finalScore, referenceScore: Number.isFinite(reference) && reference !== 0 ? reference : undefined };
}

const stageTones = { final: 'success', finalLate: 'success', failed: 'error', evaluating: 'warning', incomplete: 'error' };

// Mirrors platformReceivedBundle in lib/workflow.js: an evaluating, scoring or final state, or the
// time the Worker received the bundle, proves it arrived.
function platformReceivedBundle(attempt) {
  const state = typeof attempt?.scoringState === 'string' ? attempt.scoringState : attempt?.scoringState?.state;
  return ['evaluating', 'scoring', 'final', 'late_scored'].includes(state)
    || (typeof attempt?.scoringQueue?.workerReceivedAt === 'string' && attempt.scoringQueue.workerReceivedAt !== '');
}

// Mirrors receiptBundleMissing in lib/workflow.js: the plugin's receipt says the upload into this submission
// failed, and the platform shows no sign that the bundle arrived since.
const receiptBundleMissing = (receipt) => receipt?.ok === false && receipt?.error?.code === 'upload_failed'
  && Number.isSafeInteger(Number(receipt?.attemptId)) && Number(receipt.attemptId) > 0 && !platformReceivedBundle(receipt);

// Mirrors taskBundleMissingIds in lib/workflow.js; states without the field derive it from the latest receipt.
function taskBundleMissingIds(state) {
  const ids = Array.isArray(state?.bundleMissingIds) ? [...state.bundleMissingIds] : [];
  if (receiptBundleMissing(state?.receipt)) ids.push(state.receipt.attemptId);
  return ids.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0);
}

// The limits the task state records for one challenge (lib/workflow.js submissionLimits), or undefined.
function submissionLimitsOf(state, challengeId) {
  if (!Array.isArray(state?.submissionLimits) || challengeId === undefined || challengeId === null) return undefined;
  return state.submissionLimits.filter((item) => item?.challengeId === String(challengeId));
}

// Today's submission counts (lib/workflow.js countSubmissions) and the known limits, each with its source.
// `limits` overrides the counts' own list (the task state holds the latest). No remaining count is shown.
function submissionCountsLine(counts, limits) {
  if (!counts || typeof counts !== 'object' || !Number.isInteger(counts.total)) return undefined;
  const period = { day: msg('每天', ' per day'), total: msg('每人', ' per person') };
  const known = (Array.isArray(limits) ? limits : Array.isArray(counts.limits) ? counts.limits : [])
    .filter((item) => item && Number.isSafeInteger(item.limit) || item?.source === 'platform')
    .map((item) => item.source === 'statement'
      ? msg(`题面写明${period[item.period] || ''}最多 ${item.limit} 次${typeof item.excerpt === 'string' ? `（原文：${item.excerpt}）` : ''}`,
        `The statement allows up to ${item.limit} submissions${period[item.period] || ''}${typeof item.excerpt === 'string' ? ` (“${item.excerpt}”)` : ''}`)
      : Number.isSafeInteger(item.limit) ? msg(`平台曾返回上限 ${item.limit} 次`, `The platform reported a limit of ${item.limit}`)
        : msg('平台曾返回已达提交上限', 'The platform reported that the submission limit was reached'));
  const limitText = known.length ? `Submission limits: ${known.join('. ')}.` : 'No submission limit found.';
  if (counts.scope === 'current_account') {
    const history = counts.partialReasons?.includes('history_incomplete');
    const today = history || counts.partialReasons?.includes('time_unknown');
    return msg(`当前账号累计${history ? '已核实 ' : ' '}${counts.lifetime} 次；今天（北京时间 ${counts.date}）${today ? '已核实' : '已提交'} ${counts.total} 次，${counts.counted == null ? '占名额次数未知' : `其中占名额 ${counts.counted} 次`}${today ? '（数据不完整）' : ''}。${known.length ? `次数上限：${known.join('；')}。` : '未查到次数上限。'}`,
      `Current account, lifetime submissions${history ? ' verified' : ''}: ${counts.lifetime}. Today (Beijing time, ${counts.date}): ${counts.total}${today ? ' verified' : ' submitted'}. ${counts.counted == null ? 'Quota usage unknown' : `Counted against quota: ${counts.counted}`}.${today ? ' Data is incomplete.' : ''} ${limitText}`);
  }
  return msg(`今天（北京时间 ${counts.date}）已提交 ${counts.total} 次，其中占名额 ${counts.counted} 次，本人与名下 Agent 账号合计${counts.partial ? '（可能不完整）' : ''}。${Array.isArray(counts.partialReasons) && counts.partialReasons.includes('agent_private_hidden') ? 'Agent 账号未公开的提交看不到，没有计入。' : ''}${known.length ? `次数上限：${known.join('；')}。` : '未查到次数上限。'}`,
    `Today (Beijing time, ${counts.date}): ${counts.total} submitted, ${counts.counted} counted against quota across your account and its Agent accounts.${counts.partial ? ' Counts may be incomplete.' : ''}${counts.partialReasons?.includes('agent_private_hidden') ? ' Private Agent submissions are excluded.' : ''} ${limitText}`);
}

// Historical ZIP directory metadata, never evidence about the current material.
function bundleSummaryLine(summary) {
  if (!summary || typeof summary !== 'object' || !Number.isFinite(summary.files)) return undefined;
  const size = (bytes) => !Number.isFinite(bytes) ? '?' : bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB`
    : bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes} B`;
  const named = (item) => `${String(item?.name ?? '').split('/').pop()}${msg('（', ' (')}${size(item?.bytes)}${msg('）', ')')}`;
  const largest = Array.isArray(summary.largest) ? summary.largest.slice(0, 3).map(named).join(msg('、', ', ')) : '';
  const nonText = Array.isArray(summary.nonText) ? summary.nonText.slice(0, 3).map(named).join(msg('、', ', ')) : '';
  return [msg(`历史 ZIP 目录信息：${summary.files} 个文件，共 ${size(summary.totalBytes)}`, `Historical ZIP directory: ${summary.files} files, ${size(summary.totalBytes)} total`),
    largest ? msg(`最大：${largest}`, `Largest: ${largest}`) : '',
    summary.nonTextCount ? msg(`非文本文件（按扩展名）${summary.nonTextCount} 个：${nonText}${summary.nonTextCount > 3 ? ' 等' : ''}`, `Non-text files by extension: ${summary.nonTextCount} (${nonText}${summary.nonTextCount > 3 ? ', …' : ''})`) : msg('非文本文件（按扩展名）0 个', 'No non-text files by extension'),
    summary.symlinkCount ? msg(`符号链接 ${summary.symlinkCount} 个`, `Symbolic links: ${summary.symlinkCount}`) : '',
    summary.layout && typeof summary.layout === 'object'
      ? msg(`外层结构：outputs/ ${summary.layout.hasOutputs ? '有文件' : '无文件'}，arm_manifest.json ${summary.layout.hasManifest ? '有' : '缺失'}`, `Top level: outputs/ ${summary.layout.hasOutputs ? 'contains files' : 'has no files'}, arm_manifest.json ${summary.layout.hasManifest ? 'present' : 'missing'}`) : '',
    summary.complete === false ? msg('ZIP 目录未能读完', 'ZIP directory listing incomplete') : ''].filter(Boolean).join(msg('；', '. '));
}

// Stage, badge and score display for one submission receipt. The task list row, the drawer summary
// and any submission history share it, so the stage, badge and score always follow the platform state.
// The plugin's own `ok: false` marks an unfinished submission only while the platform has reported no
// state: "查询结果" merges the platform attempt over the receipt and keeps a stale `ok: false`. A bundle
// the platform accepted as incomplete stays submitted; its "材料不完整" badge carries a warning tone.
// The platform keeps a submission whose bundle never arrived queued until it gives up on it (it reports
// no bundle state for any submission), so only the plugin's own receipt can tell it apart from a
// queued one: the confirmation created it and the upload into it failed (`upload_failed`). Such a
// submission shows "评测包未上传" until the platform reports a failure or a final score, or shows that the
// bundle arrived (an evaluating or scoring state, or the Worker's receipt time). `bundleMissing` passes the
// same evidence for a history row, which carries no receipt of its own. A submission the platform closed
// as "bundle missing" (`bundleNotReceived`, from lib/api.js) shows "未收到评测包，需重新提交" instead of a
// generic failure: only a new submission helps.
function receiptProgress(receipt, t = zhText, { running = false, bundleMissing = false } = {}) {
  const { scoring, failed, scoreIsFinal, finalScore, referenceScore } = attemptScore(receipt);
  const states = [scoring.state, receipt?.status];
  const known = (value) => (value && value !== 'unknown' ? value : undefined);
  const state = known(scoring.state) || known(receipt?.bundleStatus) || known(receipt?.status);
  const uploadFailed = receipt?.ok === false && !receipt.status && !scoring.state;
  const notReceived = Boolean(receipt) && receipt.bundleNotReceived === true && !scoreIsFinal;
  const notUploaded = Boolean(receipt) && !failed && !scoreIsFinal && !platformReceivedBundle(receipt)
    && (bundleMissing || receiptBundleMissing(receipt));
  const reported = !failed && !scoreIsFinal && !platformReceivedBundle(receipt)
    ? ({ created: ['已创建，上传未确认', 'Created; upload unconfirmed'], uploaded: ['Agent 报告已上传', 'Agent reports uploaded'], unknown: ['结果未知，先核对已有提交', 'Outcome unknown; reconcile existing attempts'] })[receipt?.submissionState] : undefined;
  const receiptStage = !receipt ? 'created'
    : notReceived ? 'incomplete'
    : failed ? 'failed'
      : scoreIsFinal ? (states.includes('late_scored') ? 'finalLate' : 'final')
        : notUploaded ? 'incomplete'
          : reported ? 'submitted' : states.some((value) => ['queued', 'evaluating', 'scoring', 'pending_review'].includes(value)) ? 'evaluating'
            : uploadFailed || states.includes('draft') ? 'incomplete'
              : 'submitted';
  const stage = running ? 'running' : receiptStage;
  const scoreText = Number.isFinite(finalScore) ? `${finalScore} ${t('progress.points')}`
    : referenceScore !== undefined ? `${t('progress.reference')} ${referenceScore}` : '—';
  const badgeText = !receipt ? t('progress.notSubmitted') : notReceived ? t('progress.notReceived')
    : notUploaded ? t('progress.notUploaded') : state ? stateLabel(state, t)
    : receipt.ok === false ? t('progress.notSubmitted') : t('unknown');
  const badgeTone = !receipt ? (running ? 'warning' : 'neutral')
    : receiptStage === 'submitted' && receipt.bundleStatus === 'incomplete' ? 'warning'
      : stageTones[receiptStage] || 'neutral';
  const reportText = reported?.[t('progress.points') === '分' ? 0 : 1];
  return { stage, stageText: !running && reportText ? reportText : t(`progress.${stage}`), state, badgeText: reportText || badgeText, badgeTone,
    scoreIsFinal, score: finalScore, referenceScore, scoreText };
}

// Score line for attempt cards and lists; follows the same rules as `receiptProgress`. A failed or
// rejected attempt gets no score line, and neither does a draft, which has nothing to score.
function scoreLabel(item, t) {
  const { scoring, failed, scoreIsFinal, finalScore, referenceScore } = attemptScore(item);
  if ([scoring.state, item?.status].includes('draft')) return undefined;
  if (scoreIsFinal) return `${t('finalScore')}: ${finalScore ?? '—'}`;
  if (failed) return undefined;
  if (referenceScore !== undefined) return `${t('referenceScore')}: ${referenceScore}`;
  return t('awaitingScore');
}

// The workbench refreshes unscored submissions every two minutes while it is open.
const attemptRefreshMs = 120000;

// How long after a successful 取消归档 in the archived list focus may still move to the restored task's row.
const unarchiveFocusMs = 2000;

// No archive failure to show (the workbench keeps the failed conversation id with the message).
const noArchiveError = Object.freeze({ id: '', message: '' });

// A receipt whose evaluation has ended: a final score, or a failed or rejected attempt.
// A submission the platform closed as "bundle missing" is settled too.
const receiptSettled = (receipt) => receipt?.bundleNotReceived === true
  || ['final', 'finalLate', 'failed'].includes(receiptProgress(receipt, zhText).stage);

// The submission id of a receipt, or undefined when it is not a positive integer.
const receiptAttemptId = (receipt) => {
  const id = Number(receipt?.attemptId);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
};

// A refresh round never has more than this many requests in flight.
const refreshConcurrency = 4;

// A visibility change starts a round only when the previous one began at least this long ago.
const visibleRefreshGapMs = 30000;

// A submission still waiting for a platform result. A scored or incomplete bundle, a draft and a
// failed upload never change on their own, so they are not polled. `awaiting_review` is polled like
// `pending_review`, although the stage display still shows it as submitted.
// A submission whose upload failed by this task's receipt is polled too: the platform later closes it
// ("bundle missing") or, after a re-upload from elsewhere, starts evaluating it.
function receiptPending(receipt) {
  if (receiptAttemptId(receipt) === undefined || receipt.bundleStatus === 'incomplete') return false;
  const { stage } = receiptProgress({ ...receipt, submissionState: undefined }, zhText);
  if (stage === 'evaluating') return true;
  if (stage === 'incomplete' && receiptBundleMissing(receipt) && receipt.bundleNotReceived !== true) return true;
  const awaitingReview = [attemptScore(receipt).scoring.state, receipt.status].includes('awaiting_review');
  return stage === 'submitted' && ([undefined, 'submitted'].includes(receipt.status) || awaitingReview);
}

// The platform fields a refreshed submission lays over a receipt or a history row.
const ATTEMPT_STATE_FIELDS = ['status', 'bundleStatus', 'score', 'scoringState', 'scoringQueue', 'bundleNotReceived'];

const attemptKey = (scope, id) => scope.conflict || id === undefined ? undefined : JSON.stringify([scope.baseUrl, scope.challengeId, id]);

// Identity of the receipt a stored result was fetched for. A receipt that has changed since, by a
// resubmission under the same id or by "查询结果", no longer matches the stored result.
const receiptKey = (receipt) => JSON.stringify([receipt.attemptId, receipt.updatedAt, receipt.trackedAt, receipt.confirmedAt,
  receipt.ok, receipt.submissionState, ...ATTEMPT_STATE_FIELDS.map((field) => receipt[field])]);

function withLatestAttempt(state, attempts) {
  const receipt = state?.receipt;
  if (!receipt) return receipt;
  const entry = attempts?.[attemptKey(taskAttemptScope(state), receiptAttemptId(receipt))];
  const overlay = entry?.overlays?.get(receiptKey(receipt));
  return overlay ? { ...receipt, ...overlay } : receipt;
}

// Worker evidence can advance while the attempt's platform timestamp stays the same.
function attemptProgressEvidence(attempt) {
  if (receiptSettled(attempt)) return 3;
  if (['evaluating', 'scoring'].includes(attemptScore(attempt).scoring.state)) return 2;
  return platformReceivedBundle(attempt) ? 1 : 0;
}

function updateAttemptOverlay(receipt, overlay, attempt) {
  const previous = { ...receipt, ...overlay };
  const order = compareAttemptUpdates(previous.updatedAt, attempt.updatedAt);
  const settled = receiptSettled(previous);
  if (order === -1 || (order === 0 && settled)) return overlay;
  if (overlay?.updatedAt !== undefined && (order === undefined ||
    (order === 0 && attemptProgressEvidence(attempt) <= attemptProgressEvidence(previous)))) return overlay;
  const updated = {};
  for (const field of ATTEMPT_STATE_FIELDS) if (attempt[field] != null) updated[field] = attempt[field];
  if (Number.isFinite(parsePlatformTime(attempt.updatedAt))) updated.updatedAt = attempt.updatedAt;
  return order === undefined && settled && !receiptSettled({ ...receipt, ...updated }) ? overlay : updated;
}

// A submission-history row with the workbench refresh's result for the same id laid over it, but
// only when that result settles a row that was still unsettled. The refresh and the history read
// happen at different times, so the store never moves a row backwards or between unsettled states.
// A row updated after the stored result (a re-upload under the same id) keeps its own state.
// `/me/attempts` rows carry no closure marker, so the platform's "bundle missing" closure of the same id,
// from the refreshed result or the task's merged receipt (`closed`), is laid over every row that shows no
// received bundle or final score, settled ones included: the row then agrees with the task row.
function withSettledAttempt(item, entry, { closed = false } = {}) {
  const row = (closed || entry?.attempt?.bundleNotReceived === true) && item.bundleNotReceived !== true
    && !platformReceivedBundle(item) && !attemptScore(item).scoreIsFinal ? { ...item, bundleNotReceived: true } : item;
  if (!entry?.attempt || receiptSettled(row)) return row;
  if (Date.parse(row.updatedAt) > Date.parse(entry.attempt.updatedAt)) return row;
  const merged = { ...row };
  for (const field of ATTEMPT_STATE_FIELDS) if (entry.attempt[field] != null) merged[field] = entry.attempt[field];
  return receiptSettled(merged) ? merged : row;
}

const clock = (time) => `${String(new Date(time).getHours()).padStart(2, '0')}:${String(new Date(time).getMinutes()).padStart(2, '0')}`;

async function refreshAttempts(store, keys) {
  if (!keys.length || store.controller || store.disposed) return;
  const wanted = keys.map((key) => {
    const { scope, attemptId, snapshots } = store.receipts.get(key);
    return { key, input: { action: 'attempt', attemptId, ...scope }, snapshots };
  });
  const controller = new AbortController();
  store.controller = controller;
  store.startedAt = Date.now();
  store.publish();
  const fresh = [];
  let next = 0;
  const worker = async () => {
    while (next < wanted.length && !controller.signal.aborted) {
      const { key, input, snapshots } = wanted[next++];
      try {
        const attempt = await store.query(input, controller.signal);
        if (attempt?.ok !== false && attempt?.id === input.attemptId && (!input.baseUrl || attempt.baseUrl === input.baseUrl)
          && (!input.challengeId || String(attempt.challengeId) === input.challengeId)) {
          const previous = store.attempts[key];
          const overlays = new Map([...snapshots].map(([snapshot, receipt]) =>
            [snapshot, updateAttemptOverlay(receipt, previous?.overlays?.get(snapshot), attempt)]));
          fresh.push([key, { attempt: updateAttemptOverlay({}, previous?.attempt, attempt), overlays }]);
        }
      } catch { /* counted as failed */ }
    }
  };
  await Promise.all(Array.from({ length: Math.min(refreshConcurrency, wanted.length) }, worker));
  if (store.controller !== controller) return;
  store.controller = null;
  store.attempts = { ...store.attempts, ...Object.fromEntries(fresh) };
  store.failed = fresh.length < wanted.length;
  if (!store.failed) { store.refreshedAt = Date.now(); store.partial = false; } else if (fresh.length) store.partial = true;
  store.publish();
}

export { attemptKey, attemptRefreshMs, bundleSummaryLine, clock, noArchiveError, receiptAttemptId, receiptKey, receiptPending, receiptProgress, refreshAttempts, scoreLabel, submissionCountsLine, submissionLimitsOf, taskAttemptScope, taskBundleMissingIds, unarchiveFocusMs, visibleRefreshGapMs, withLatestAttempt, withSettledAttempt };

