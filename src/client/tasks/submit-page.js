import * as React from 'react';
import { attemptScore, compareAttemptRevisions, keepsWorkerProgress, parsePlatformTime, platformReceivedBundle } from '../../../lib/task/evidence.js';
import { msg } from '../shared/language.js';
import { h } from '../shared/react.js';
import { useRequestScope } from '../shared/request-scope.js';
import { css } from '../shared/styles.js';
import { safeMessage } from '../shared/errors.js';
import { attemptKey, clock, receiptAttemptId, taskAttemptScope, taskBundleMissingIds, withHistoryAttempt, withLatestAttempt } from './attempts.js';
import { ArchivedTaskRow, TaskArchiveControl } from './list.js';
import { SelectedTask } from './workflow.js';
import { attributedAttempt, compareFinalScores, lifecycle, needsAttention, scoreDimensions, sortSubmissionRows, submissionStatus, submissionTotals } from './submit-evidence.js';
import { submitCss } from './submit-styles.js';

const stages = () => [
  msg('任务创建', 'Task created'), msg('Agent 执行', 'Agent execution'), msg('请求提交', 'Request submission'),
  msg('取得编号', 'Submission ID'), msg('平台评测', 'Platform evaluation'), msg('最终结果', 'Final result'),
];
const sources = () => ({ agent: msg('Agent 报告', 'Agent report'), host: msg('宿主记录', 'Host record'), platform: msg('平台回执', 'Platform receipt') });
const briefTime = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', month: 'numeric', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const displayTime = (value) => {
  const time = parsePlatformTime(value);
  return Number.isFinite(time) ? briefTime.format(time).replace('/', '.').replace(', ', ' ') : '—';
};
const titleOf = (session, task) => task?.title || session?.displayTitle?.replace(/^Playground · /, '') || msg('Playground 任务', 'Playground task');
const scoreText = (score) => Number.isFinite(score) ? Number.isInteger(score) ? score.toFixed(1) : String(score) : '—';
const stateOf = (session) => session?.projectionValues?.playgroundTask;
const rowKey = ({ id, challengeId, baseUrl }) => JSON.stringify([challengeId, id, baseUrl]);
const button = (label, onClick, props) => h('button', { type: 'button', className: 'pg-button', onClick, ...props }, label);
const historyContext = () => msg('当前账号 · 包括在终端或其他工具中完成的提交', 'Current account · Includes submissions made in the terminal and other tools');
const description = () => msg('按时间从新到旧 · 包括在终端和其他工具中完成的提交', 'Newest first · Includes submissions made in the terminal and other tools');

function useHistory(query, active, context, limit) {
  const { account, challengeId, baseUrl, stamp, sessionId } = context;
  const scope = useRequestScope([query, active, account, sessionId, challengeId, baseUrl, stamp, limit]);
  const [data, setData] = React.useState({});
  const current = data.scope === scope ? data : {};
  const load = async (cursor) => {
    if (!query || !active) return;
    const read = scope.begin('history');
    if (!read) return;
    setData({ ...current, scope, busy: true, error: '' });
    try {
      const result = await query({ action: 'my_attempts', limit, ...(challengeId ? { challengeId } : { allChallenges: true }),
        ...(baseUrl ? { baseUrl } : {}), ...(cursor ? { cursor } : {}) }, read.signal);
      if (!read.isCurrent()) return;
      if (!Array.isArray(result?.items) || result?.ok === false) throw new Error(result?.error?.code === 'authentication_required'
        ? msg('登录后可查看提交历史。', 'Sign in to view submissions.') : safeMessage(result?.error?.message));
      const byKey = new Map((cursor ? current.items : []).map((item) => [rowKey(item), item]));
      for (const item of result.items) {
        if (!item || !Number.isSafeInteger(item.id)) continue;
        const attempt = { ...item, baseUrl: item.baseUrl ?? result.baseUrl ?? baseUrl };
        const previous = byKey.get(rowKey(attempt));
        if (!previous || !olderDetail(previous, attempt)) byKey.set(rowKey(attempt), attempt);
      }
      setData({ scope, items: [...byKey.values()].sort(sortSubmissionRows), nextCursor: result.nextCursor, busy: false,
        counts: result.submissionCounts, scoringTotals: result.scoringTotals, challenges: result.challenges, partial: result.partial });
    } catch (failure) {
      if (read.isCurrent()) setData({ ...current, scope, busy: false, error: failure?.message || msg('提交历史读取失败。', 'Could not load submission history.') });
    } finally { read.finish(); }
  };
  React.useEffect(() => {
    void load();
    return () => scope.abort('history');
  }, [scope]);
  return { ...current, reload: () => load(), loadMore: () => current.nextCursor && load(current.nextCursor), isCurrent: scope.isCurrent };
}

function observationOf(attempt) {
  const { scoring, scoreIsFinal, finalScore, referenceScore } = attemptScore(attempt);
  return JSON.stringify([attempt.updatedAt, attempt.scoringQueue?.workerReceivedAt ?? attempt.lastWorkerReceivedAt,
    attempt.status, attempt.bundleStatus, attempt.bundleNotReceived, attempt.submissionState, scoring.state, scoring.workerStatus,
    scoreIsFinal, finalScore, referenceScore, attempt.scorecard, attempt.scorecardTruncated]);
}

function olderDetail(summary, detail) {
  const order = compareAttemptRevisions(summary, detail);
  if (order) return order < 0;
  const before = attemptScore(summary);
  const after = attemptScore(detail);
  if (before.scoreIsFinal || before.failed || summary.bundleNotReceived === true) {
    return !(after.scoreIsFinal || after.failed || detail.bundleNotReceived === true);
  }
  return !after.scoreIsFinal && !after.failed && detail.bundleNotReceived !== true && !keepsWorkerProgress(summary, detail);
}

function relatedRow(item, tasks, attempts) {
  const session = tasks.find((task) => attributedAttempt(stateOf(task), item));
  const state = stateOf(session);
  const receipt = withLatestAttempt(state, attempts, session?.id);
  const latest = receiptAttemptId(receipt) === item.id;
  const scope = state ? taskAttemptScope(state) : undefined;
  const observed = latest ? receipt : scope && attempts?.[attemptKey(scope, item.id)]?.attempt;
  const row = withHistoryAttempt(item, observed, { latest, closed: state?.bundleClosedIds?.includes(item.id) });
  const attempt = { ...row, submissionState: row.submissionState ?? observed?.submissionState,
    identity: row.identity ?? observed?.identity, scorecard: row.scorecard, scorecardTruncated: row.scorecardTruncated };
  if (observed && !olderDetail(attempt, observed)) {
    attempt.scorecard ??= observed.scorecard;
    attempt.scorecardTruncated ??= observed.scorecardTruncated;
  }
  return { attempt, observation: observationOf(attempt), session, bundleMissing: taskBundleMissingIds(state).includes(item.id) };
}

function relationOf(row) {
  const identity = row.attempt.identity === 'agent' || row.attempt.authorIsAgent ? msg('Agent 账号', 'Agent account')
    : row.attempt.identity === 'self' ? msg('本人', 'My account') : msg('身份未知', 'Identity unknown');
  return row.session ? `${identity} · ${msg('本对话', 'Task chat')}` : identity;
}

function statusBadge(row) {
  const { tone, shape, label } = submissionStatus(row.attempt, row.bundleMissing);
  return h('span', { className: 'pg-badge pg-submit-status', 'data-tone': tone, 'data-shape': shape }, label);
}

function Lifecycle({ session, state, request }) {
  const steps = lifecycle(session, state, request, state.receipt);
  const labels = stages();
  const evidence = sources();
  return h('section', { className: 'pg-submit-lifecycle', 'aria-label': msg('提交进度', 'Submission progress') },
    h('header', null, h('span', { className: 'pg-submit-kicker' }, 'LIFECYCLE'),
      h('div', null, ...Object.entries(evidence).map(([key, label]) => h('span', { key, 'data-source': key }, label)))),
    h('ol', null, ...steps.map((step, index) => h('li', { key: labels[index], 'data-stage': step.current ? 'current' : step.reached ? 'done' : 'pending' },
      h('div', { className: 'pg-submit-node', 'aria-hidden': true }, h('span', null, step.current ? '!' : step.reached ? '✓' : String(index + 1).padStart(2, '0'))),
      h('strong', null, labels[index]),
      h('time', null, step.reached ? displayTime(step.time) : '—'),
      h('small', { 'data-source': step.reached ? step.source : undefined }, step.current && request?.status === 'awaiting_user'
        ? msg('等待配额答复', 'Waiting for quota decision') : step.reached ? evidence[step.source] : index === 3 && steps[2].reached ? msg('尚未创建', 'Not created') : '—')))));
}

function HistoryNotice({ history }) {
  return h(React.Fragment, null,
    history.error ? h('p', { className: 'pg-error', role: 'alert' }, history.error, ' ', button(msg('重试', 'Retry'), history.reload)) : null,
    history.partial ? h('p', { className: 'pg-note', role: 'status' }, msg('平台记录不完整，仅显示可核实的提交。', 'Platform history is incomplete. Showing verified submissions.')) : null,
    history.busy && !history.items ? h('p', { className: 'pg-note', role: 'status' }, msg('正在读取提交历史…', 'Loading submission history…')) : null,
    history.items?.length === 0 ? h('p', { className: 'pg-note' }, msg('暂无提交记录。', 'No submissions yet.')) : null);
}

function TaskHistory({ scope, attemptId, stamp, sessionId, account, query, active, tasks, attempts, openScore }) {
  const history = useHistory(query, active && Boolean(scope.challengeId) && !scope.conflict,
    { account, challengeId: scope.challengeId, baseUrl: scope.baseUrl, stamp, sessionId }, 20);
  const pick = (attempt) => { if (active && history.isCurrent()) openScore(attempt); };
  const rows = (history.items || []).map((item) => relatedRow(item, tasks, attempts));
  const recent = rows.find(({ attempt }) => attempt.id === attemptId) || rows[0];
  return h('section', { className: 'pg-submit-task-history', 'aria-label': msg('本题提交历史', 'Challenge submission history') },
    h('header', null, h('h2', null, msg('本题提交历史', 'Challenge submission history')), h('small', null, historyContext()),
      recent ? button(msg('查看评分详情', 'View score details'), () => pick(recent.attempt), { className: 'pg-submit-link' }) : null),
    h(HistoryNotice, { history }),
    ...rows.map((row) => h('div', { key: rowKey(row.attempt), className: 'pg-submit-history-row' },
      button(`#${row.attempt.id}`, () => pick(row.attempt), { className: 'pg-submit-link' }),
      statusBadge(row), h('span', null, relationOf(row)), h('time', null, displayTime(row.attempt.createdAt)),
      h('strong', null, scoreText(attemptScore(row.attempt).finalScore)))),
    history.nextCursor ? button(msg('加载更多', 'Load more'), history.loadMore, { disabled: history.busy }) : null);
}

function TaskRail({ taskSessions, archivedTasks, showArchived, setShowArchived, archive, selected, select, attempts, workspaceOf, nav, refInto }) {
  return h('nav', { className: 'pg-submit-rail', 'aria-label': msg('参赛任务', 'Participation tasks') },
    ...taskSessions.map((session) => {
      const state = stateOf(session);
      const receipt = withLatestAttempt(state, attempts, session.id);
      const steps = lifecycle(session, state, state?.submission, receipt);
      const status = submissionStatus(receipt);
      const [label, tone] = steps[2].current && state.submission?.status === 'awaiting_user' ? [msg('等待配额答复', 'Waiting for quota decision'), 'warning']
        : session.running ? [msg('Agent 执行中', 'Agent running'), 'active']
          : state?.submission?.status === 'unknown' ? [msg('状态未知 · 先核对已有提交', 'Unknown · Reconcile existing attempts'), 'neutral']
            : status.key === 'evaluating' && platformReceivedBundle(receipt) ? [msg('评测中 · 平台已接收', 'Evaluating · Received'), status.tone] : [status.label, status.tone];
      return button(h(React.Fragment, null, h('strong', null, titleOf(session, state?.task)),
        h('span', { className: 'pg-submit-ticks', 'aria-hidden': true },
          steps.map((step, index) => h('i', { key: index, 'data-stage': step.current ? 'current' : step.reached ? 'done' : 'pending' }))),
        h('span', { className: 'pg-submit-rail-meta' }, h('span', { 'data-tone': tone }, label), h('small', null, workspaceOf(session, state?.task)?.title))),
      () => select(session.id), { key: session.id, className: 'pg-submit-task', 'aria-pressed': session.id === selected, ref: refInto(nav.rows, session.id) });
    }),
    archive && archivedTasks.length ? h(React.Fragment, null,
      button(msg(`已归档 ${archivedTasks.length} 个`, `Archived (${archivedTasks.length})`), () => setShowArchived(!showArchived), {
        className: 'pg-archived-toggle', 'aria-expanded': showArchived, 'aria-controls': 'pg-submit-archived', ref: (node) => { nav.toggle = node; } }),
      showArchived ? h('div', { id: 'pg-submit-archived', role: 'list' }, archivedTasks.map((session) =>
        h(ArchivedTaskRow, { key: session.id, session, archive, buttonRef: refInto(nav.archived, session.id) }))) : null) : null);
}

function TaskPane({ session, archive, archiveError, openConversation, openError, workspaceOf, state, request, controls, permissions, error, allowed, history, nav, archived }) {
  const task = state.task;
  const context = [task?.competitionName, task?.periodName, task?.categoryName].filter(Boolean);
  const meta = [session.modelName || session.modelId, task?.cwd || session.cwd || workspaceOf(session, task)?.path].filter(Boolean);
  return h(React.Fragment, null,
    h('article', { className: 'pg-submit-task-detail' },
      h('div', { className: 'pg-submit-task-inner' },
        h('header', { className: 'pg-submit-task-header' },
          h('div', null, h('small', { className: 'pg-submit-kicker' }, [msg('参赛任务', 'Participation tasks'), ...context].join(' · ')),
            h('h1', { tabIndex: -1, ref: (node) => { nav.heading = node; } }, titleOf(session, task)),
            h('p', null, [msg('任务 Agent', 'Task Agent'), ...meta].join(' · '))),
          h('div', { className: 'pg-submit-task-actions' }, archived ? null : button(msg('打开任务对话', 'Open task chat'), () => openConversation(session.id)),
            h(TaskArchiveControl, { session, archive: archive && { ...archive, archived, error: archiveError.id === session.id ? archiveError.message : '' } }))),
        openError || error ? h('p', { className: 'pg-error', role: 'alert' }, openError || error) : null,
        h(Lifecycle, { session, state, request }),
        controls,
        allowed === false ? h('p', { className: 'pg-note' }, msg('当前连接没有此会话的操作权限。', 'This connection cannot perform actions in this chat.')) : null,
        h(TaskHistory, { ...history, sessionId: session.id, scope: taskAttemptScope(state), stamp: state.receipt?.trackedAt ?? state.receipt?.confirmedAt, attemptId: receiptAttemptId(state.receipt) }))),
    permissions || h('aside', { className: 'pg-submit-access', 'aria-label': msg('外部材料权限', 'External material permissions') },
      h('h2', null, msg('外部材料权限', 'External material permissions')),
      h('p', null, msg('暂无可显示的材料权限。', 'No material permissions available.'))));
}

function Scorecard({ row, compared, query, active, openTask, onRefresh }) {
  const attempt = row.attempt;
  const scope = useRequestScope([rowKey(attempt), row.observation, active, query, row.session?.id]);
  const [detail, setDetail] = React.useState({});
  const load = async (refresh = false) => {
    if (!query || !active) return;
    const read = scope.begin('detail');
    if (!read) return;
    setDetail((previous) => ({ scope, attempt: previous.scope === scope ? previous.attempt : undefined, busy: true }));
    try {
      const value = await query({ action: 'attempt', attemptId: attempt.id, challengeId: attempt.challengeId,
        ...(attempt.baseUrl ? { baseUrl: attempt.baseUrl } : {}) }, read.signal);
      if (!read.isCurrent()) return;
      if (value?.ok === false || Number(value?.id) !== attempt.id || String(value.challengeId) !== attempt.challengeId
        || (attempt.baseUrl && value.baseUrl && value.baseUrl !== attempt.baseUrl)) throw new Error();
      if (olderDetail(attempt, value)) {
        setDetail({ scope });
        return;
      }
      setDetail({ scope, attempt: value });
      if (refresh) onRefresh({ ...attempt, ...value, baseUrl: attempt.baseUrl });
    } catch {
      if (read.isCurrent()) setDetail({ scope, error: msg('评分详情读取失败。', 'Could not load score details.') });
    } finally { read.finish(); }
  };
  React.useEffect(() => {
    void load();
    return () => scope.abort('detail');
  }, [scope]);
  const value = detail.scope === scope && detail.attempt && !olderDetail(attempt, detail.attempt) ? { ...attempt, ...detail.attempt } : attempt;
  const delta = compareFinalScores(value, compared?.attempt);
  const dimensions = scoreDimensions(value);
  const source = submissionStatus(value, row.bundleMissing);
  const missing = value.bundleNotReceived === true;
  const received = platformReceivedBundle(value);
  const status = value.status || value.scoringState ? source.label : '—';
  return h('aside', { className: 'pg-submit-scorecard', 'aria-label': msg('评分详情', 'Scorecard') },
    h('header', null, h('div', null,
      h('span', { className: 'pg-submit-kicker' }, 'SCORECARD', compared ? msg(' · 对比 2 次提交', ' · Comparing 2 submissions') : ''),
      h('h2', null, value.challengeTitle || attempt.challengeTitle || attempt.challengeId)),
      h('div', null, h('strong', null, scoreText(attemptScore(value).finalScore)), h('small', null, msg('最终分数', 'Final score')))),
    compared ? h('div', { className: 'pg-submit-compared' }, h('span', null, `# ${attempt.id}`), h('span', null, `# ${compared.attempt.id}`),
      h('strong', null, msg('总分', 'Total'), ' ', delta === undefined ? '—' : `${delta >= 0 ? '+' : ''}${Number(delta.toFixed(3))}`)) : null,
    dimensions.length ? h('ul', { className: 'pg-submit-dimensions', 'aria-label': msg('分维度评分', 'Score dimensions') },
      dimensions.map(([label, score]) => h('li', { key: label }, h('span', null, label),
        score >= 0 && score <= 1 ? h('meter', { min: 0, max: 1, value: score, 'aria-label': label }) : null, h('strong', null, score)))) : null,
    h('dl', null, ...[
      [msg('平台状态', 'Platform status'), status],
      [msg('评测包', 'Evaluation bundle'), missing ? msg('未收到', 'Missing') : received ? msg('已接收', 'Received') : '—'],
      [msg('提交者', 'Submitter'), value.authorName || relationOf(row)],
    ].map(([name, fact]) => h('div', { key: name }, h('dt', null, name), h('dd', null, fact)))),
    detail.scope === scope && detail.error ? h('p', { className: 'pg-error', role: 'alert' }, detail.error) : null,
    h('div', { className: 'pg-actions' },
      button(msg('刷新结果', 'Refresh result'), () => load(true), { disabled: detail.scope === scope && detail.busy }),
      row.session ? button(msg('打开参赛任务', 'Open participation task'), () => { if (active && scope.isCurrent()) openTask(row.session.id); }) : null));
}

function ScoringPane({ history, account, challenge, status, query, attempts, tasks, openTask, active, picked, setPicked, compare, setCompare }) {
  const scope = useRequestScope([account, query, active]);
  const [updates, setUpdates] = React.useState({});
  const observedRow = (item) => {
    const row = relatedRow(item, tasks, attempts);
    const update = updates.scope === scope ? updates.items[rowKey(item)] : undefined;
    return update?.observation === row.observation ? { ...row, attempt: update.attempt } : row;
  };
  const loaded = history.items?.map(observedRow);
  const scoringTotals = history.scoringTotals && { ...history.scoringTotals };
  if (scoringTotals && loaded) {
    for (const [index, row] of loaded.entries()) {
      const before = submissionStatus(history.items[index]).key;
      const after = submissionStatus(row.attempt, row.bundleMissing).key;
      scoringTotals.final += Number(after === 'final') - Number(before === 'final');
      scoringTotals.attention += Number(needsAttention(after)) - Number(needsAttention(before));
    }
  }
  const totals = submissionTotals(loaded, { ...history, scoringTotals });
  const filtered = (loaded || []).filter((row) => (!challenge || row.attempt.challengeId === challenge)
    && (!status || submissionStatus(row.attempt, row.bundleMissing).key === status));
  const available = new Map((loaded || []).map((row) => [rowKey(row.attempt), row]));
  const selectedRows = compare.map((key) => available.get(key)).filter(Boolean);
  const requested = picked && (available.get(rowKey(picked)) || observedRow(picked));
  const focused = selectedRows.length === 2 ? selectedRows[0] : requested || selectedRows[0] || filtered[0];
  const compared = selectedRows.length === 2 ? selectedRows[1] : undefined;
  const table = useRequestScope([scope, challenge, status, JSON.stringify(filtered.map(({ attempt }) => rowKey(attempt)))]);
  const toggle = (key) => {
    if (active && table.isCurrent()) setCompare((previous) => previous.includes(key) ? previous.filter((item) => item !== key) : [...previous.slice(-1), key]);
  };
  const pick = (attempt) => {
    if (active && table.isCurrent()) { setCompare([]); setPicked(attempt); }
  };
  return h('div', { className: 'pg-submit-scoring' },
    h('dl', { className: 'pg-submit-totals' }, ...[
      [msg('累计提交', 'Total submissions'), totals.total, msg('当前账号 · 所有赛题', 'Current account · All challenges')],
      [msg('今天', 'Today'), totals.today, `${msg('北京时间', 'Beijing time')} ${totals.date ?? '—'}`],
      [msg('已出最终分', 'Final scores'), totals.final, msg('平台已确认的最终结果', 'Final results confirmed by the platform')],
      [msg('需处理', 'Needs attention'), totals.attention, msg('评测包未收到 · 上传未确认', 'Bundle missing · Upload unconfirmed')],
    ].map(([label, value, hint]) => h('div', { key: label }, h('dt', null, label), h('dd', null, value ?? '—'), h('small', null, hint)))),
    h('div', { className: 'pg-submit-scoring-grid' },
      h('section', { className: 'pg-submit-table-card', 'aria-label': msg('提交历史', 'Submission history') },
        h('header', null, h('h2', null, msg('提交历史', 'Submission history')), h('small', null, description()),
          loaded ? h('span', { className: 'pg-submit-kicker' }, msg(`已加载 ${loaded.length}`, `Loaded ${loaded.length}`), totals.total == null ? '' : ` / ${totals.total}`) : null),
        h(HistoryNotice, { history }),
        h('div', { className: 'pg-submit-table-scroll' }, h('table', null,
          h('thead', null, h('tr', null, ...[msg('对比', 'Compare'), msg('编号', 'ID'), msg('赛题', 'Challenge'), msg('状态', 'Status'),
            msg('关联', 'Link'), msg('时间', 'Time'), msg('分数', 'Score')].map((label) => h('th', { key: label, scope: 'col' }, label)))),
          h('tbody', null, ...filtered.map((row) => {
            const attempt = row.attempt;
            const key = rowKey(attempt);
            const scoring = attemptScore(attempt);
            const selected = focused && rowKey(focused.attempt) === key;
            return h('tr', { key, 'data-selected': selected },
              h('td', null, h('input', { type: 'checkbox', checked: compare.includes(key), onChange: () => toggle(key),
                'aria-label': msg(`对比提交 #${attempt.id}`, `Compare submission #${attempt.id}`) })),
              h('td', null, button(`#${attempt.id}`, () => pick(attempt), { className: 'pg-submit-link', 'aria-pressed': selected })),
              h('td', null, attempt.challengeTitle || attempt.challengeId), h('td', null, statusBadge(row)),
              h('td', null, relationOf(row)), h('td', null, h('time', null, displayTime(attempt.createdAt))),
              h('td', { className: scoring.referenceScore !== undefined ? 'pg-submit-reference-score' : undefined },
                scoreText(scoring.finalScore ?? scoring.referenceScore)));
          })))),
        loaded?.length && !filtered.length ? h('p', { className: 'pg-note' }, msg('已加载记录中没有匹配的提交。', 'No matching submissions in the loaded history.')) : null,
        history.nextCursor ? h('footer', null, button(msg('加载更多', 'Load more'), history.loadMore, { disabled: history.busy })) : null),
      focused ? h(Scorecard, { row: focused, compared, query, active, openTask,
        onRefresh: (value) => {
          if (!scope.isCurrent()) return;
          setUpdates((previous) => ({ scope, items: { ...(previous.scope === scope ? previous.items : {}),
            [rowKey(value)]: { observation: focused.observation, attempt: value } } }));
        } }) : null));
}

export function SubmitPage({ active, account, accountName, taskSessions, archivedTasks, workspaces, archive, byId, projections, selected, select,
  showArchived, setShowArchived, nav, refInto, announcement, openError, openConversation, archiveError, store, useSessionAccess,
  refreshProjections, query, run, submission, materials, t, taskFeedback }) {
  const [view, setView] = React.useState('tasks');
  const [picked, setPicked] = React.useState(null);
  const [comparison, setComparison] = React.useState({});
  const [filtersByAccount, setFilters] = React.useState({});
  const accountScope = useRequestScope([account, query]);
  const scoreActive = active && view === 'scores';
  const taskActive = active && view === 'tasks';
  const viewScope = useRequestScope([active, account, view, selected]);
  const feedback = taskFeedback?.(viewScope) ?? { announcement, openError, archiveError, archiveBusy: archive?.busy };
  const history = useHistory(query, scoreActive, { account }, 6);
  const session = byId[selected];
  const projection = projections?.[selected];
  const state = projection?.state === 'ready' ? projection.values?.playgroundTask || {} : stateOf(session) || {};
  const archived = archivedTasks.some(({ id }) => id === selected);
  const { challenge: activeChallenge = '', status: activeStatus = '' } = filtersByAccount.scope === accountScope ? filtersByAccount : {};
  const tasks = [...taskSessions, ...archivedTasks];
  const workspaceOf = (item, task) => workspaces?.find((workspace) => (item.workspaceId && workspace.workspaceId === item.workspaceId)
    || workspace.sessionIds?.includes(item.id) || ((item.cwd || task?.cwd) && workspace.path === (item.cwd || task?.cwd)));
  const openScore = (attempt) => {
    if (!taskActive || !viewScope.isCurrent()) return;
    setPicked({ scope: accountScope, attempt }); setComparison({ scope: accountScope, keys: [] }); setFilters({}); setView('scores');
  };
  const openTask = (id) => {
    if (scoreActive && viewScope.isCurrent()) { select(id); setView('tasks'); }
  };
  const selectTask = (id) => { if (taskActive && viewScope.isCurrent()) select(id); };
  const toggleArchiveList = (next) => { if (taskActive && viewScope.isCurrent()) setShowArchived(next); };
  const taskArchive = archive && { ...archive, busy: feedback.archiveBusy, change: (id, next, options) => {
    if (taskActive && viewScope.isCurrent()) return archive.change(id, next, { ...options, owner: viewScope });
  } };
  const openTaskConversation = (id) => {
    if (taskActive && viewScope.isCurrent()) return openConversation(id, viewScope);
  };
  const pane = (data) => h(TaskPane, { ...data, session, archived, archive: taskArchive, archiveError: feedback.archiveError, openConversation: openTaskConversation, openError: feedback.openError, workspaceOf, nav,
    history: { query, account, active: taskActive, tasks, attempts: store.attempts, openScore } });
  const taskPane = session ? h('div', { className: 'pg-submit-task-grid' },
    h(TaskRail, { taskSessions, archivedTasks, showArchived, setShowArchived: toggleArchiveList, archive: taskArchive, selected, select: selectTask, attempts: store.attempts, workspaceOf, nav, refInto }),
    archived || projection?.state !== 'ready'
      ? h(React.Fragment, null, pane({ state, request: state.submission }),
        !archived ? h(SelectedTask, { key: session.id, session, projection, useSessionAccess, refreshProjections, attempts: store.attempts, run, submission, materials, t, account, activeView: taskActive }) : null)
      : h(SelectedTask, { key: session.id, session, projection, useSessionAccess, refreshProjections, attempts: store.attempts, run, submission, materials, t, account, activeView: taskActive,
        inline: true, renderInline: pane }))
    : h('div', { className: 'pg-submit-task-grid' },
      h(TaskRail, { taskSessions, archivedTasks, showArchived, setShowArchived: toggleArchiveList, archive: taskArchive, selected, select: selectTask, attempts: store.attempts, workspaceOf, nav, refInto }),
      h('p', { className: 'pg-note pg-submit-empty', tabIndex: -1, ref: (node) => { nav.heading = node; } }, msg('暂无参赛任务。', 'No participation tasks yet.')));
  const challengeOptions = history.challenges || [...new Map((history.items || []).map(({ challengeId, challengeTitle }) => [challengeId, challengeTitle])).entries()];
  const filters = view === 'scores' ? h('div', { className: 'pg-submit-filters' },
    h('label', null, msg('赛题', 'Challenge'), h('select', { value: activeChallenge, onChange: (event) => { if (scoreActive && viewScope.isCurrent()) setFilters({ scope: accountScope, challenge: event.target.value, status: activeStatus }); } },
      h('option', { value: '' }, msg('全部赛题', 'All challenges')),
      ...challengeOptions.map(([id, title]) => h('option', { key: id, value: id }, title || id)))),
    h('label', null, msg('状态', 'Status'), h('select', { value: activeStatus, onChange: (event) => { if (scoreActive && viewScope.isCurrent()) setFilters({ scope: accountScope, challenge: activeChallenge, status: event.target.value }); } },
      ...[['', msg('全部', 'All')], ['final', msg('评分完成', 'Scored')], ['evaluating', msg('评测中', 'Evaluating')], ['missing', msg('未收到评测包', 'Bundle missing')],
        ['failed', msg('未通过', 'Failed')], ['created', msg('上传未确认', 'Upload unconfirmed')], ['attention', msg('待处理', 'Needs attention')],
        ['other', msg('其他', 'Other')]].map(([value, label]) => h('option', { key: value, value }, label))))) : null;
  return h('main', { className: 'pg-workbench pg-submit-page', 'aria-label': msg('Playground 提交', 'Playground submissions') },
    h('style', null, css + submitCss),
    h('p', { className: 'pg-sr-only', role: 'status', 'aria-live': 'polite' }, feedback.announcement),
    h('header', { className: 'pg-submit-bar' },
      h('div', { role: 'group', 'aria-label': msg('提交视图', 'Submission view'), className: 'pg-submit-tabs' },
        button(h(React.Fragment, null, msg('参赛任务', 'Participation tasks'), h('small', null, taskSessions.length)), () => { if (active && viewScope.isCurrent()) setView('tasks'); }, { 'aria-pressed': view === 'tasks' }),
        button(msg('提交记录与评分', 'Submissions and scores'), () => { if (active && viewScope.isCurrent()) setView('scores'); }, { 'aria-pressed': view === 'scores' })),
      accountName || store.refreshedAt ? h('span', { className: 'pg-submit-kicker pg-submit-account' },
        [accountName ? msg(`当前账号 ${accountName}`, `Account ${accountName}`) : '', store.refreshedAt ? msg(`状态更新于 ${clock(store.refreshedAt)}`, `Updated at ${clock(store.refreshedAt)}`) : ''].filter(Boolean).join(' · ')) : null,
      filters),
    view === 'tasks' ? taskPane : h(ScoringPane, { key: account ?? '', account, history, challenge: activeChallenge, status: activeStatus, query, attempts: store.attempts, tasks, active: scoreActive,
      openTask, picked: picked?.scope === accountScope ? picked.attempt : undefined, setPicked: (attempt) => setPicked({ scope: accountScope, attempt }),
      compare: comparison.scope === accountScope ? comparison.keys : [], setCompare: (change) =>
        setComparison((previous) => ({ scope: accountScope, keys: typeof change === 'function' ? change(previous.scope === accountScope ? previous.keys : []) : change })) }));
}
