import { cleanDetail } from '../redaction.js';

import { compact, controllerTaskError, fail, rethrowCancel, withToken } from '../workflow-result.js';
import { platformReceivedBundle, submissionStateOf, taskAttemptIds, taskBundleMissingIds } from '../task/evidence.js';
import { submissionLimitsFor } from './policy.js';

export function createSubmissionReceipts({ client, current, requireAuth, isController, sessionToken,
  countsFor, forgetOverview, presentationMeta }) {
  async function reportSubmission(args, exec) {
    const state = current(exec);
    if (!state?.task) return fail('当前对话没有 Playground 任务。', 'task_required');
    if (args.attempt_id !== undefined) {
      if (!['created', 'uploaded', 'upload_failed', 'unknown'].includes(args.submission_state)) return fail('已取得编号时请先用 track 记录真实编号。');
      return track(args, exec, { update: true });
    }
    if (!['not_created', 'unknown'].includes(args.submission_state)) return fail('已取得编号时请先用 track 记录真实编号。');
    const submission = { ...state.submission, challengeId: state.task.challengeId, status: args.submission_state,
      message: cleanDetail(args.message || 'Agent 未提供进一步详情。'), reportedBy: 'agent' };
    return { ok: true, workflow: { kind: 'submission', submission,
      ...(args.http_status === 429 ? { limit: { challengeId: String(state.task.challengeId), source: 'platform' } } : {}) }, submission };
  }

  async function results(args, exec) {
    const auth = await requireAuth(exec);
    if (!auth.authenticated) return auth;
    const receipt = current(exec)?.receipt;
    const id = args.attempt_id || receipt?.attemptId;
    if (!id) return fail('本任务还没有提交回执，请提供要查询的提交编号。');
    const attempt = await client.getAttempt(id, { signal: exec.signal });
    // The platform keeps such a submission queued until it gives up on the bundle, so the receipt's
    // evidence is stated next to the platform state, unless the platform shows the bundle arrived. A
    // submission the platform already closed as "bundle missing" (bundleNotReceived, lib/api.js) can
    // only be replaced by a new one.
    const missing = taskBundleMissingIds(current(exec)).includes(Number(id)) && !platformReceivedBundle(attempt);
    const note = attempt.bundleNotReceived
      ? `平台已把提交 #${id} 关闭为“未收到评测包”：它不会被评分，也不会自动重评。不要再往这条提交里重传；需要新建一次提交：请向用户说明原因，按官方要求核对材料，得到用户明确的新建提交请求后再执行。`
      : missing ? `插件的回执显示提交 #${id} 的评测包没有上传成功，平台上没有它的评测包；平台显示的排队状态不代表正在评测。处理方法见 playground_task 的 status 结果中的 lastFailure.nextSteps。` : undefined;
    const challengeId = attempt.challengeId ?? current(exec)?.task?.challengeId;
    const submissionCounts = challengeId === undefined ? undefined
      // Results may be polled: a count younger than SUBMISSION_OVERVIEW_TTL_MS is reused without new reads.
      : await countsFor(String(challengeId), exec, { limits: submissionLimitsFor(current(exec), challengeId), fresh: true });
    return { ok: true, baseUrl: client.baseUrl, ...attempt,
      ...(note ? { bundleMissing: true, note } : {}),
      ...(submissionCounts ? { submissionCounts } : {}),
      ...(receipt?.attemptId === id && !isController?.(exec.agent) ? { workflow: { kind: 'receipt', ...(submissionCounts ? { submissionCounts } : {}), receipt: { ...receipt, ...attempt, submissionState: submissionStateOf(attempt, receipt.submissionState), ...presentationMeta({}, attempt).playground, attemptId: id } } } : {}) };
  }

  /**
   * #63 playground_task track: records a submission made outside the plugin (the official CLI or API)
   * as this task's submission, so results read its state, changelog and execLog. The submission must belong
   * to the task's challenge and be authored by the signed-in account or one of its confirmed Agent accounts.
   * Tracking an id the task already holds changes nothing. Reads only; writes nothing to the platform.
   */
  async function track(args, exec, { update = false } = {}) {
    if (isController?.(exec.agent)) return controllerTaskError();
    const task = current(exec)?.task;
    if (!task) return fail('当前对话没有 Playground 任务，无法记录提交。请先用 playground_bind_task 绑定赛题。', 'task_required');
    const id = Number(typeof args?.attempt_id === 'string' ? args.attempt_id.trim().replace(/^#/, '') : args?.attempt_id);
    if (!Number.isSafeInteger(id) || id <= 0) return fail('attempt_id 必须是正整数提交编号（官方 CLI 或 API 返回的 attempt ID）。');
    const token = await sessionToken();
    const auth = await requireAuth(exec, token);
    if (!auth.authenticated) return auth;
    let attempt;
    try {
      attempt = await client.getAttempt(id, withToken({ signal: exec.signal }, token));
    } catch (error) {
      if (error?.code === 'not_found') return fail(`找不到提交 #${id}，没有记录。请核对 attempt_id。`, 'not_found');
      throw error;
    }
    if (attempt?.challengeId === undefined || String(attempt.challengeId) !== String(task.challengeId)) {
      return fail(`提交 #${id} 属于赛题 ${attempt?.challengeId ?? '（未知）'}，不是本任务的赛题 ${task.challengeId}，没有记录。`, 'challenge_mismatch');
    }
    const authorId = attempt.authorId;
    if (authorId === undefined || authorId === null || authorId === '') {
      return fail(`平台没有返回提交 #${id} 的作者，无法确认它是本人或名下 Agent 账号的提交，没有记录。`, 'author_unknown');
    }
    let identity;
    let agentName;
    if (auth.user?.id !== undefined && auth.user?.id !== null && String(auth.user.id) === String(authorId)) identity = 'self';
    else {
      let agents;
      try {
        agents = typeof client.listMyAgents === 'function' ? (await client.listMyAgents(withToken({ signal: exec.signal }, token))).items : undefined;
      } catch (error) { rethrowCancel(error, exec); agents = undefined; }
      if (!agents) return fail(`提交 #${id} 不是本人账号的提交，且无法读取名下 Agent 账号列表，没有记录。请稍后重试。`, 'agents_unavailable');
      const agent = agents.find((item) => item?.confirmed && String(item.id) === String(authorId));
      if (!agent) return fail(`提交 #${id} 的作者不是当前登录账号，也不是它名下已确认的 Agent 账号，没有记录。请提醒用户核对这条提交是谁提交的。`, 'author_mismatch');
      identity = 'agent';
      agentName = agent.name || agent.id;
    }
    if (!update && taskAttemptIds(current(exec)).includes(id)) {
      return compact({ ok: true, alreadyTracked: true, attemptId: id, identity, note: `提交 #${id} 已经记在本任务里，没有重复记录。用 playground_task 的 results 读取它的状态。` });
    }
    // A new submission changes today's counts: read them again next time.
    forgetOverview(task.challengeId);
    const meta = typeof presentationMeta === 'function' ? presentationMeta({}, attempt)?.playground : undefined;
    const reported = ['created', 'uploaded', 'upload_failed', 'unknown'].includes(args.submission_state) ? args.submission_state : undefined;
    const submissionState = submissionStateOf(attempt, reported || 'created');
    const receipt = compact({ ...attempt, ...meta, ok: submissionState !== 'upload_failed', baseUrl: client.baseUrl, attemptId: id, challengeId: task.challengeId, challengeTitle: task.title,
      submissionState, ...(reported ? { agentReport: { state: reported, message: cleanDetail(args.message || '') } } : {}),
      ...(submissionState === 'upload_failed' ? { error: { code: 'upload_failed', message: cleanDetail(args.message || 'Agent 报告上传失败，提交编号已保留。') } } : {}),
      ...(args.http_status === 429 ? { diagnosis: { challengeId: String(task.challengeId), reason: 'submission_limit', httpStatus: 429 } } : {}),
      tracked: true, identity, agentName, trackedAt: new Date().toISOString() });
    return compact({ ok: true, tracked: true, attemptId: id, identity, agentName, status: attempt.status, scoringState: attempt.scoringState,
      note: `已把提交 #${id}（${identity === 'agent' ? `Agent 账号 ${agentName}` : '本人账号'}）记到本任务。用 playground_task 的 results 读取它的平台状态和错误详情。`,
      workflow: { kind: 'receipt', receipt } });
  }

  return { reportSubmission, results, track };
}
