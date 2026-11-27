import { msg } from '../shared/language.js';
import * as React from 'react';
import { attemptForReceipt, attemptKey, receiptAttemptId, receiptProgress, submissionCountsLine, submissionLimitsOf, taskAttemptScope, taskBundleMissingIds, withLatestAttempt, withSettledAttempt } from './attempts.js';
import { zhText } from '../shared/locale.js';
import { h } from '../shared/react.js';
import { safeMessage } from '../shared/errors.js';
import { useDrawerFocus } from '../shared/drawer.js';
import { openWebButton, taskWebUrl } from '../shared/display.js';
import { SelectedTask } from './workflow.js';

// Two sibling buttons, never nested: the main area selects the task and opens its drawer;
// "打开对话" switches to the task's DSH conversation without opening the drawer.
function TaskSummaryRow({ session, attempts, selected, onSelect, onOpen, selectRef }) {
  const state = session.projectionValues?.playgroundTask || {};
  const task = state.task;
  const receipt = withLatestAttempt(state, attempts);
  const progress = receiptProgress(receipt, zhText, { running: session.running });
  const title = task?.title || session.displayTitle?.replace(/^Playground · /, '') || msg('Playground 任务', 'Playground task');
  const challengeId = task?.challengeId || msg('赛题待读取', 'Challenge pending');
  const stage = receipt || task || session.running ? progress.stageText : msg('状态待读取', 'Status pending');
  const updatedAt = session.updatedAt || session.lastActivityAt || session.createdAt;
  const updated = updatedAt ? new Date(updatedAt).toLocaleString(msg('zh-CN', 'en-US'), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : msg('暂无时间', 'Time unavailable');
  return h('div', { className: `pg-task-row${selected ? ' is-selected' : ''}`, role: 'listitem' },
    h('button', { type: 'button', className: 'pg-task-row-select', onClick: onSelect, 'aria-pressed': selected, ref: selectRef },
      h('span', { className: 'pg-task-row-main' },
        h('strong', null, title),
        h('span', { className: 'pg-task-row-meta' }, challengeId, ' · ', stage)),
      h('span', { className: 'pg-task-row-side' },
        h('span', { className: 'pg-badge', 'data-tone': progress.badgeTone }, progress.badgeText),
        h('span', { className: 'pg-task-row-score' }, progress.scoreText),
        h('span', { className: 'pg-task-row-updated' }, updated))),
    h('button', { type: 'button', className: 'pg-task-row-open', onClick: onOpen, 'aria-label': msg(`打开对话：${title}`, `Open chat: ${title}`) }, msg('打开对话', 'Open chat')));
}

// Mirrors taskAttemptIds in lib/workflow.js: projections persisted without attemptIds derive it from the receipt.
function taskAttemptIds(state) {
  const ids = Array.isArray(state?.attemptIds) ? state.attemptIds : [state?.receipt?.attemptId];
  return ids.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0);
}

// Every submission of the current account for this challenge, including CLI or other-tool submissions.
// Read through the session-free query service, so opening the drawer writes nothing into a conversation.
// `attempts` is the workbench store of refreshed submissions; it is only read here, never polled.
// `bundleMissingIds` are the submissions whose bundle this task's receipts say never arrived.
// `closedIds` are the task's submissions its receipts or the store show closed as "bundle missing".
function AttemptHistory({ baseUrl, challengeId, receipt, attemptIds, bundleMissingIds = [], closedIds = [], limits, attempts, query, t }) {
  const [history, setHistory] = React.useState({ items: [], nextCursor: null, loaded: false });
  // The first page's counts and partial reason (lib/workflow.js myAttempts).
  const [overview, setOverview] = React.useState({ counts: undefined, partial: '' });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [signedOut, setSignedOut] = React.useState(false);
  const [status, setStatus] = React.useState(null);
  // Mutable holder (not render state): only the newest request may update the list; `list` and `heading` are focus targets.
  // `refocus` is set by "重试": its button disappears once a read succeeds, so focus must move into the section.
  const [latest] = React.useState(() => ({ controller: null, list: null, heading: null, refocus: false }));
  // An empty or signed-out result renders no list, so focus goes to the always-present heading.
  const refocusHeading = () => { if (latest.refocus) { latest.refocus = false; latest.heading?.focus?.(); } };
  // The error stays visible until the next read settles, so "重试" keeps its place (and focus) while it runs.
  const load = async (cursor) => {
    latest.controller?.abort();
    const controller = new AbortController();
    latest.controller = controller;
    setBusy(true); setStatus(['正在读取提交历史…', 'Loading submission history…']);
    try {
      const result = await query({ action: 'my_attempts', challengeId, ...(baseUrl ? { baseUrl } : {}), limit: 50, ...(cursor ? { cursor } : {}) }, controller.signal);
      if (latest.controller !== controller) return;
      if (result?.ok === false) {
        if (result.error?.code === 'authentication_required') {
          setSignedOut(true); setError(''); setOverview({ counts: undefined, partial: '' }); setHistory({ items: [], nextCursor: null, loaded: true }); setStatus(['登录后可查看提交历史。', 'Sign in to view submission history.']);
          refocusHeading();
        } else {
          // "重试" stays rendered and keeps focus; the status changes so a repeated failure is still announced.
          latest.refocus = false;
          setError(safeMessage(result.error?.message) || msg('提交历史读取失败，请重试。', 'Could not load submission history. Try again.')); setStatus(['提交历史读取失败。', 'Could not load submission history.']);
        }
        return;
      }
      // One row per attempt id, across pages and within a page; the first occurrence wins.
      const items = cursor ? [...history.items] : [];
      const seen = new Set(items.map((item) => item.id));
      for (const item of Array.isArray(result?.items) ? result.items : []) {
        if (!item || typeof item !== 'object' || seen.has(item.id)) continue;
        seen.add(item.id);
        items.push(item);
      }
      const nextCursor = typeof result?.nextCursor === 'string' && result.nextCursor ? result.nextCursor : null;
      setSignedOut(false); setError('');
      setHistory({ items, nextCursor, loaded: true });
      if (!cursor) setOverview({ counts: result?.submissionCounts, partial: typeof result?.partial?.note === 'string' ? result.partial.note : '' });
      setStatus(items.length ? [`已加载 ${items.length} 条提交`, `Submissions loaded: ${items.length}`] : result?.partial ? ['提交历史不完整。', 'Submission history is incomplete.'] : ['这道题还没有提交记录。', 'No submissions yet for this challenge.']);
      // The last page removes "加载更多"; move focus to the list instead of letting it fall back to the page.
      if (cursor && !nextCursor) latest.list?.focus?.();
      // After "重试" a non-empty list takes focus when it attaches (see the `ul` ref).
      if (!items.length) refocusHeading();
    } catch (failure) {
      if (latest.controller !== controller) return;
      latest.refocus = false;
      setError(failure.message); setStatus(['提交历史读取失败。', 'Could not load submission history.']);
    } finally {
      if (latest.controller === controller) { latest.controller = null; setBusy(false); }
    }
  };
  React.useEffect(() => {
    load();
    return () => { latest.controller?.abort(); latest.controller = null; };
  }, [query, challengeId]);
  const time = (value) => Number.isFinite(Date.parse(value)) ? Date.parse(value) : -Infinity;
  const items = [...history.items].sort((a, b) => (time(b.createdAt) - time(a.createdAt)) || ((Number(b.id) || 0) - (Number(a.id) || 0)));
  const linked = new Set(attemptIds);
  const missing = new Set(bundleMissingIds);
  const latestId = receiptAttemptId(receipt);
  return h('section', { className: 'pg-guide pg-history', 'aria-label': msg('提交历史', 'Submission history'), 'aria-busy': busy },
    h('p', { className: 'pg-sr-only', role: 'status', 'aria-live': 'polite' }, status && msg(...status)),
    h('h3', { className: 'pg-brand', tabIndex: -1, ref: (node) => { latest.heading = node; } }, msg('提交历史', 'Submission history')),
    h('p', { className: 'pg-note' }, msg('当前账号在这道题上的提交，按时间从新到旧排列，包括在终端或其他工具中完成的提交。', 'Submissions by this account for this challenge, newest first, including submissions made from the terminal or other tools.')),
    submissionCountsLine(overview.counts, limits) ? h('p', { className: 'pg-note pg-submission-counts' }, submissionCountsLine(overview.counts, limits)) : null,
    overview.partial ? h('p', { className: 'pg-note pg-history-partial', role: 'status' }, overview.partial) : null,
    signedOut ? h('p', { className: 'pg-note' }, msg('登录后可查看提交历史。关闭任务详情后，在“Playground 连接状态”中登录。', 'Close task details and sign in under Playground connection status to view submission history.')) : null,
    error ? h('p', { className: 'pg-error', role: 'alert' }, error) : null,
    error && !items.length ? h('div', { className: 'pg-actions' },
      h('button', { type: 'button', className: 'pg-button', disabled: busy, onClick: () => { latest.refocus = true; return load(); } }, busy ? msg('正在读取…', 'Loading…') : msg('重试', 'Retry'))) : null,
    busy && !history.loaded ? h('p', { className: 'pg-note' }, msg('正在读取提交历史…', 'Loading submission history…')) : null,
    history.loaded && !signedOut && !items.length && !error && !overview.partial ? h('p', { className: 'pg-note' }, msg('这道题还没有提交记录。', 'No submissions yet for this challenge.')) : null,
    items.length ? h('ul', { className: 'pg-list', 'aria-label': msg('提交历史列表', 'Submission history list'), tabIndex: -1, ref: (node) => {
      latest.list = node;
      if (node && latest.refocus) { latest.refocus = false; node.focus?.(); }
    } }, items.map((item) => {
      // Same stage, badge and score rules as the task row and the drawer summary; `running` describes
      // the conversation, not this attempt, so it is not passed.
      const id = Number(item.id);
      const entry = attemptForReceipt(attempts?.[attemptKey({ baseUrl, challengeId }, id)], id === latestId ? receipt : undefined);
      const progress = receiptProgress(withSettledAttempt(item, entry, { closed: closedIds.includes(id) }), t, { bundleMissing: missing.has(id) });
      const created = Number.isFinite(Date.parse(item.createdAt))
        ? new Date(item.createdAt).toLocaleString(msg('zh-CN', 'en-US'), { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : msg('提交时间未知', 'Submission time unknown');
      const own = linked.has(id);
      return h('li', { key: item.id, className: 'pg-row' },
        h('div', { className: 'pg-row-main' }, msg(`提交 #${item.id ?? '—'}`, `Submission #${item.id ?? '—'}`),
          h('div', { className: 'pg-row-sub' }, created, ' · ', progress.stageText, ' · ', progress.scoreText)),
        h('div', { className: 'pg-history-side' },
          h('span', { className: 'pg-badge', 'data-tone': progress.badgeTone }, progress.badgeText),
          h('span', { className: 'pg-badge', 'data-tone': own ? 'success' : 'neutral' }, own ? msg('本对话', 'This chat') : msg('未关联到对话', 'Unlinked to this chat')),
          h('span', { className: 'pg-badge pg-identity', 'data-tone': 'neutral' }, item.identity === 'agent' ? msg('Agent 账号 · ', 'Agent account · ') + (item.agentName || item.authorName || msg('未命名', 'Unnamed')) : msg('本人', 'My account'))));
    })) : null,
    history.nextCursor && !signedOut ? h('div', { className: 'pg-actions' },
      h('button', { type: 'button', className: 'pg-button', disabled: busy, onClick: () => load(history.nextCursor) }, busy ? msg('正在读取…', 'Loading…') : msg('加载更多', 'Load more'))) : null);
}

// DSH's own conversation archive: hidden from the sidebar and the task overview, restorable, content kept.
// `archive` is undefined when this DSH does not report its archive set; the control is then not shown.
function TaskArchiveControl({ session, archive }) {
  if (!archive) return null;
  const busy = archive.busy === session.id;
  const archived = Boolean(archive.archived);
  // Why "归档任务" is unavailable. Archiving the conversation in DSH's main view makes DSH clear that view
  // and leave this panel, which would close the workbench before "撤销" could be seen.
  const notes = archived ? [] : [
    session.running ? ['pg-archive-running', msg('对话正在运行，停止后再归档。', 'Stop this running chat before archiving it.')] : null,
    (session.retainedBy?.mainView ?? 0) > 0 ? ['pg-archive-main-view', msg('这是 DSH 当前打开的对话，请先在侧边栏切换到其他对话再归档。', 'This chat is open in DSH. Switch to another chat in the sidebar before archiving it.')] : null,
  ].filter(Boolean);
  return h('div', { className: 'pg-actions pg-archive' },
    archived ? h('span', { className: 'pg-badge', 'data-tone': 'neutral' }, msg('已归档', 'Archived')) : null,
    // One button for both directions, so it stays mounted and keeps keyboard focus when its label changes.
    // While a change is in flight it is aria-disabled instead of disabled, which would drop focus.
    h('button', { type: 'button', className: `pg-button ${archived ? 'pg-unarchive' : 'pg-archive-button'}`, disabled: notes.length > 0,
      'aria-disabled': archive.busy ? true : undefined, 'aria-describedby': notes.length ? notes.map(([id]) => id).join(' ') : undefined,
      onClick: () => { if (!archive.busy) archive.change(session.id, !archived); } },
    busy ? (archived ? msg('正在撤销…', 'Restoring…') : msg('正在归档…', 'Archiving…')) : archived ? msg('撤销', 'Undo') : msg('归档任务', 'Archive task')),
    ...notes.map(([id, note]) => h('span', { key: id, id, className: 'pg-note' }, note)),
    archive.error ? h('p', { className: 'pg-note pg-error pg-archive-error', role: 'alert' }, archive.error) : null);
}

function ArchivedTaskRow({ session, archive, buttonRef }) {
  const title = session.projectionValues?.playgroundTask?.task?.title || session.displayTitle?.replace(/^Playground · /, '') || msg('Playground 任务', 'Playground task');
  // aria-disabled while a change is in flight, as in the drawer: the pressed button keeps focus, and after a
  // failure it is still there with focus. The workbench moves focus on after a success removes the row.
  return h('div', { className: 'pg-task-row pg-archived-row', role: 'listitem' },
    h('span', { className: 'pg-archived-title' }, title),
    h('button', { type: 'button', className: 'pg-task-row-open pg-unarchive', 'aria-disabled': archive.busy ? true : undefined, 'aria-label': msg(`取消归档：${title}`, `Unarchive: ${title}`), ref: buttonRef,
      onClick: () => { if (!archive.busy) archive.change(session.id, false, { fromList: true }); } }, archive.busy === session.id ? msg('正在取消…', 'Restoring…') : msg('取消归档', 'Unarchive')));
}

function TaskDetailDrawer({ session, projection, close, query, webBase, archive, focusFallback, ...props }) {
  const focus = useDrawerFocus(focusFallback);
  // Every way out of the drawer gives focus back first; Escape calls through the holder.
  const dismiss = () => { focus.restore(); close(); };
  focus.dismiss = dismiss;
  const state = session?.projectionValues?.playgroundTask || {};
  const title = state.task?.title || session.displayTitle?.replace(/^Playground · /, '') || msg('Playground 任务', 'Playground task');
  // Prefer the freshly refreshed projection for attribution; the catalog value may lag behind.
  const current = (projection?.state === 'ready' && projection.values?.playgroundTask) || state;
  const scope = taskAttemptScope({ task: current.task || state.task, receipt: current.receipt });
  const historyChallenge = !scope.conflict && (current.task?.challengeId || state.task?.challengeId);
  const attemptIds = taskAttemptIds(current);
  // The task's receipt with its refreshed platform state, as the task row and the drawer summary show it.
  const latestReceipt = withLatestAttempt(current, props.attempts);
  // Every submission of the task shown closed as "bundle missing": by a receipt the task recorded
  // (bundleClosedIds, kept after newer receipts), by its latest receipt with the refreshed state laid
  // over it, or by a refreshed entry in the workbench store.
  const closedIds = [...new Set([
    ...(Array.isArray(current.bundleClosedIds) ? current.bundleClosedIds.map(Number) : []),
    ...(latestReceipt?.bundleNotReceived === true ? [receiptAttemptId(latestReceipt)] : []),
    ...attemptIds.filter((id) => id !== receiptAttemptId(current.receipt) && props.attempts?.[attemptKey(scope, id)]?.attempt?.bundleNotReceived === true),
  ])].filter((id) => Number.isSafeInteger(id) && id > 0);
  const openWeb = openWebButton(taskWebUrl(current.task?.challengeId ? current.task : state.task, webBase), title);
  const archived = Boolean(archive?.archived);
  return h('div', { className: 'pg-drawer-backdrop', onMouseDown: dismiss },
    h('aside', { className: 'pg-drawer', role: 'dialog', 'aria-modal': true, 'aria-label': msg(`${title} 任务详情`, `Task details: ${title}`), onMouseDown: (event) => event.stopPropagation(), ref: (node) => { focus.dialog = node; } },
      h('div', { className: 'pg-drawer-header' },
        h('div', { className: 'pg-drawer-heading' }, h('h2', { className: 'pg-drawer-title', tabIndex: -1, ref: (node) => { focus.title = node; } }, title)),
        h('div', { className: 'pg-drawer-actions' },
          // Close after starting navigation so a workbench the host keeps mounted does not come back
          // to an open modal drawer whose Escape listener is still attached. Navigation is deferred, so
          // focus is back on the task row before the conversation opens.
          // DSH does not open an archived conversation, so its drawer offers no way there.
          archived ? null : h('button', { type: 'button', className: 'pg-button pg-primary pg-drawer-open', onClick: () => { props.openConversation(session.id); dismiss(); }, 'aria-label': msg(`打开任务对话：${title}`, `Open task chat: ${title}`) }, msg('打开任务对话', 'Open task chat')),
          h('button', { type: 'button', className: 'pg-button pg-drawer-close', onClick: dismiss, 'aria-label': msg('关闭任务详情', 'Close task details') }, msg('关闭', 'Close')))),
      h('p', { className: 'pg-note pg-path' }, state.task?.challengeId ? msg(`赛题 ${state.task.challengeId}`, `Challenge ${state.task.challengeId}`) : msg('赛题信息待读取', 'Challenge details pending')),
      openWeb ? h('div', { className: 'pg-actions' }, openWeb) : null,
      h(TaskArchiveControl, { session, archive }),
      // An archived task is read-only here: its state and history, without the check and confirm controls,
      // which would act on a conversation DSH has archived.
      archived ? h('p', { className: 'pg-note pg-archived-note' }, msg('此任务已归档。DSH 不会打开已归档的对话；撤销后才能向任务 Agent 请求提交。', 'This task is archived. Unarchive it to open the chat in DSH and ask its Agent to submit.'))
        : h(SelectedTask, { key: session.id, session, projection, ...props }),
      // The newest attributed id and the receipt's confirmation stamp are part of the key: a submission
      // confirmed in this drawer, including a re-upload under the same id, remounts the list and reloads
      // page one. "查询结果" keeps the stamp, so a results query does not remount it or drop loaded pages.
      historyChallenge && query ? h(AttemptHistory, {
        key: JSON.stringify([session.id, scope.baseUrl, historyChallenge, attemptIds.at(-1), current.receipt?.confirmedAt ?? current.receipt?.trackedAt]),
        baseUrl: scope.baseUrl, challengeId: historyChallenge, receipt: current.receipt, attemptIds, bundleMissingIds: taskBundleMissingIds(current), closedIds,
        limits: submissionLimitsOf(current, historyChallenge), attempts: props.attempts, query, t: props.t,
      }) : null));
}

export { ArchivedTaskRow, TaskDetailDrawer, TaskSummaryRow };

