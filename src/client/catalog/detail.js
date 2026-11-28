import { msg, currentLanguage } from '../shared/language.js';
import * as React from 'react';
import { useDrawerFocus } from '../shared/drawer.js';
import { locales } from '../shared/locale.js';
import { h } from '../shared/react.js';
import { openWebButton, statusTone } from '../shared/display.js';
import { challengeDetailCss } from './styles.js';
import { detectStatementLimit } from '../../../lib/submission/policy.js';

// Right-side drawer for one catalog challenge. It reads the detail once when it opens, through the
// session-free query service, so opening it writes nothing into any conversation. Closing aborts the read.
function DispatchChallengeButton({ challenge, handoff, beforeDispatch, primary = false }) {
  const busy = ['sending', 'initializing', 'opening'].includes(handoff.state?.phase);
  const gated = handoff.gatedIds?.has(String(challenge.id)) === true;
  return h('button', { type: 'button', className: primary ? 'pg-button pg-primary pg-detail-dispatch' : 'pg-button pg-list-action', disabled: gated, 'aria-disabled': busy || gated || undefined, onClick: (event) => {
    if (busy || handoff.gatedIds?.has(String(challenge.id))) return;
    event?.currentTarget?.focus();
    beforeDispatch?.();
    handoff.start({ id: String(challenge.id), title: msg(challenge.titleZh || challenge.title, challenge.title || challenge.titleZh) || String(challenge.id) });
  } }, gated ? msg('题面需要权限', 'Statement access required') : busy && handoff.state.challenge?.id === String(challenge.id) ? msg('正在交接…', 'Handing off…') : msg('交给主控', 'Hand off to controller'));
}

function overviewSection(title, children) {
  return h('section', { className: 'pg-detail-section', 'aria-label': title },
    h('h3', { className: 'pg-detail-rule' }, title), children);
}

function missingDetail(text) {
  return h('p', { className: 'pg-detail-note' }, h('span', { 'aria-hidden': true }, 'ⓘ'), text);
}

function challengeOverview(detail, progress) {
  const content = !detail.contentGated && typeof detail.content === 'string' ? detail.content : '';
  const firstParagraph = content.trim().split(/\r?\n\s*\r?\n/, 1)[0] || '';
  const excerpt = Array.from(firstParagraph);
  const summary = !detail.contentGated && excerpt.length
    ? (excerpt.length > 240 ? `${excerpt.slice(0, 240).join('')}…` : firstParagraph)
    : '';
  const { workspace, submissions, partial } = progress || {};
  const { controllers, running, unknown, participation } = workspace || {};
  const controllerLabel = running ? msg(`主控任务 · ${running} 个运行中`, `Controller tasks · ${running} running`)
    : unknown ? msg('主控任务 · 状态未知', 'Controller tasks · Status unknown') : msg('主控任务', 'Controller tasks');
  const limit = detectStatementLimit(content);
  const scope = limit?.period === 'day' ? msg('每天', ' per day') : limit?.period === 'total' ? msg('每人', ' per participant') : '';
  const submissionCount = partial && submissions !== undefined ? `≥ ${submissions}` : submissions ?? '—';
  const metric = (label, value) => h('div', null, h('dt', null, label), h('dd', null, value));
  return [
    summary ? h('p', { key: 'summary', className: 'pg-detail-summary', 'aria-label': msg('摘要', 'Summary') }, summary) : null,
    h('div', { key: 'scoring' }, overviewSection(msg('评分构成', 'Scoring breakdown'), missingDetail(
      msg('未查到评分构成。题面写明或平台返回后，这里会标出来源。', 'No scoring breakdown was found. Its source will be shown once available in the statement or from the platform.')))),
    h('div', { key: 'limits' }, overviewSection(msg('提交物限制', 'Artifact limits'), missingDetail(
      msg('未查到提交物限制。题面写明或平台返回后，这里会标出来源。', 'No artifact limits were found. Their source will be shown once available in the statement or from the platform.')))),
    h('div', { key: 'quota', 'aria-label': msg('提交次数上限', 'Submission limit') }, missingDetail(limit
      ? msg(`题面写明${scope}最多提交 ${limit.limit} 次。`, `The statement specifies a limit of ${limit.limit} submissions${scope}.`)
      : msg('未查到提交次数上限。题面写明或平台返回上限后，这里会标出来源。', 'No submission limit was found. Its source will be shown once available in the statement or from the platform.'))),
    h('div', { key: 'progress', className: 'pg-detail-progress-grid' },
      overviewSection(msg('我的进度 · 当前账号', 'My progress · Current account'),
        h('dl', { className: 'pg-detail-progress' }, metric(msg('累计提交', 'Lifetime submissions'), submissionCount))),
      overviewSection(msg('本地任务', 'Local tasks'), h('dl', { className: 'pg-detail-progress' },
        metric(controllerLabel, controllers || '—'), metric(msg('参赛任务', 'Participation tasks'), participation || '—')))),
  ];
}

function ChallengeDetailDrawer({ challenge, query, handoff, requestTask, competition, group, progress, close, focusFallback }) {
  const [detail, setDetail] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);
  const [tab, setTab] = React.useState('overview');
  const [copyStatus, setCopyStatus] = React.useState('');
  const tabId = React.useId();
  const [status, setStatus] = React.useState(null);
  // Mutable holder (not render state): only the newest read may update the drawer, and none after closing.
  const [latest] = React.useState(() => ({ controller: null, closed: false }));
  const challengeId = String(challenge.id);
  const load = async () => {
    latest.controller?.abort();
    if (latest.closed) return;
    const controller = new AbortController();
    latest.controller = controller;
    setBusy(true); setFailed(false); setStatus(['正在读取赛题详情…', 'Loading challenge details…']);
    try {
      const result = await query({ action: 'challenge', challengeId }, controller.signal);
      if (latest.controller !== controller) return;
      if (!result || typeof result !== 'object' || result.ok === false) throw new Error('challenge detail unavailable');
      if (handoff?.gatedIds) {
        if (result.contentGated === true) handoff.gatedIds.add(challengeId);
        else if (result.contentGated === false && String(result.id) === challengeId) handoff.gatedIds.delete(challengeId);
      }
      setDetail(result); setStatus(['赛题详情已读取。', 'Challenge details loaded.']);
    } catch {
      if (latest.controller !== controller) return;
      // Fixed text: the thrown message may come from the platform and is never shown here.
      setFailed(true); setStatus(['赛题详情读取失败。', 'Could not load challenge details.']);
    } finally {
      if (latest.controller === controller) { latest.controller = null; setBusy(false); }
    }
  };
  const focus = useDrawerFocus(focusFallback);
  const dismiss = () => {
    latest.closed = true;
    latest.controller?.abort();
    latest.controller = null;
    focus.restore();
    close();
  };
  // The Escape listener calls through the holder, so it subscribes once even though `close` changes per render.
  focus.dismiss = dismiss;
  React.useEffect(() => {
    latest.closed = false;
    load();
    return () => { latest.closed = true; latest.controller?.abort(); latest.controller = null; };
  }, [query, challengeId]);
  const shown = detail || challenge;
  const title = msg(shown.titleZh || shown.title, shown.title || shown.titleZh) || challengeId;
  const statusLabel = shown.status && (locales[currentLanguage()].states[shown.status] || shown.status);
  const source = { benchmark: msg('基准', 'Benchmark'), community: msg('社区', 'Community'),
    hackathon: msg('黑客松', 'Hackathon'), arena: msg('竞技场', 'Arena') };
  const facts = [competition, group || shown.discipline, shown.origin && msg(`来源 · ${Object.hasOwn(source, shown.origin) ? source[shown.origin] : shown.origin}`,
    `Source · ${Object.hasOwn(source, shown.origin) ? source[shown.origin] : shown.origin}`),
    Number.isFinite(shown.difficulty) && msg(`难度 ${shown.difficulty} / 5`, `Difficulty ${shown.difficulty} / 5`),
    Number.isFinite(shown.attempts) && msg(`提交 ${shown.attempts}`, `Submissions ${shown.attempts}`)].filter(Boolean);
  const tags = Array.isArray(shown.tags) ? [...new Set(shown.tags.filter((tag) => typeof tag === 'string' && tag))] : [];
  const resources = Array.isArray(detail?.resources) ? detail.resources.filter((item) => item && typeof item === 'object') : [];
  const content = typeof detail?.content === 'string' ? detail.content : '';
  const tabs = [['overview', msg('概览', 'Overview')], ['statement', msg('题面全文', 'Full statement')],
    ['resources', detail ? msg(`资源 · ${resources.length}`, `Resources · ${resources.length}`) : msg('资源', 'Resources')]];
  const useTabKeys = (event, index) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
      : (index + (event.key === 'ArrowLeft' ? -1 : 1) + tabs.length) % tabs.length;
    event.preventDefault();
    setTab(tabs[next][0]);
    event.currentTarget.parentElement?.querySelectorAll('[role="tab"]')[next]?.focus();
  };
  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(challengeId);
      setCopyStatus(msg('已复制题目编号', 'Challenge ID copied'));
    } catch {
      setCopyStatus(msg('复制失败，请选中编号后复制。', 'Copy failed. Select the ID to copy it.'));
    }
  };
  const renderStatement = () => {
    if (detail.contentGated) return h('p', { className: 'pg-note' }, msg('题面需要权限，请在网页中查看', 'Access is required. Open the statement on the web.'));
    if (!content) return h('p', { className: 'pg-note' }, msg('这道题没有题面文字。', 'No statement text is available.'));
    return [h('button', { key: 'toggle', type: 'button', className: 'pg-button', 'aria-expanded': expanded, onClick: () => setExpanded(!expanded) },
      expanded ? msg('收起题面', 'Collapse statement') : msg('展开题面', 'Expand statement')),
    expanded ? h('pre', { key: 'statement', className: 'pg-statement', tabIndex: 0, 'aria-label': msg('题面全文', 'Full challenge statement') }, content) : null,
    expanded && detail.truncated ? h('p', { key: 'truncated', className: 'pg-detail-note' }, Number.isSafeInteger(detail.contentLimit) && detail.contentLimit > 0
      ? msg(`题面超过 ${detail.contentLimit} 字，这里只显示前 ${detail.contentLimit} 字；完整题面请在网页中查看。`, `Showing the first ${detail.contentLimit} characters. Open the challenge on the web to read the full statement.`)
      : msg('题面过长，这里只显示前一部分；完整题面请在网页中查看。', 'Only the beginning of the statement is shown. Open the challenge on the web to read the rest.')) : null];
  };
  const renderResources = () => resources.length
    ? h('ul', { className: 'pg-detail-resources' }, resources.map((item, index) => h('li', { key: `${index}:${item.name || ''}` },
      h('strong', null, item.name || msg('未命名资源', 'Unnamed resource')),
      [item.kind, item.role].filter(Boolean).length ? h('span', { className: 'pg-note' }, ` · ${[item.kind, item.role].filter(Boolean).join(' · ')}`) : null,
      item.description ? h('p', { className: 'pg-note' }, item.description) : null,
      item.source ? h('p', { className: 'pg-note pg-path' }, msg(`来源：${item.source}`, `Source: ${item.source}`)) : null)))
    : h('p', { className: 'pg-note' }, msg('这道题没有列出资源。', 'No resources are listed for this challenge.'));
  return h('div', { className: 'pg-drawer-backdrop', 'data-drawer': 'challenge', onMouseDown: dismiss },
    h('aside', { className: 'pg-drawer pg-challenge-drawer', role: 'dialog', 'aria-modal': true, 'aria-label': msg(`${title} 赛题详情`, `Challenge details: ${title}`), 'aria-busy': busy, onMouseDown: (event) => event.stopPropagation(), ref: (node) => { focus.dialog = node; } },
      h('style', null, challengeDetailCss),
      h('p', { className: 'pg-sr-only', role: 'status', 'aria-live': 'polite' }, status && msg(...status)),
      h('div', { className: 'pg-detail-top' },
        h('span', { className: 'pg-detail-id', 'aria-label': msg(`题目编号：${challengeId}`, `Challenge ID: ${challengeId}`) }, challengeId),
        h('button', { className: 'pg-button pg-detail-copy', type: 'button', 'aria-label': msg('复制题目编号', 'Copy challenge ID'), onClick: copyId },
          h('span', { className: 'pg-detail-copy-icon', 'aria-hidden': true })),
        h('span', { className: 'pg-detail-copy-status', role: 'status' }, copyStatus),
        h('button', { type: 'button', className: 'pg-button pg-drawer-close', onClick: dismiss, 'aria-label': msg('关闭赛题详情', 'Close challenge details') },
          h('span', { 'aria-hidden': true }, '× '), msg('关闭', 'Close'))),
      h('div', { className: 'pg-detail-heading' },
        h('h2', { className: 'pg-drawer-title', tabIndex: -1, ref: (node) => { focus.title = node; } }, title),
        h('div', { className: 'pg-detail-facts' },
          statusLabel ? h('span', { className: 'pg-badge', 'data-tone': statusTone(shown.status) }, statusLabel) : null,
          facts.map((fact, index) => h('span', { key: index, className: 'pg-badge' }, fact)))),
      h('div', { className: 'pg-detail-tabs', role: 'tablist', 'aria-label': msg('赛题详情分区', 'Challenge detail sections') },
        tabs.map(([id, label], index) => h('button', { type: 'button', className: 'pg-button', key: id, id: `${tabId}-${id}`,
          role: 'tab', 'aria-selected': tab === id, 'aria-controls': `${tabId}-panel-${id}`, tabIndex: tab === id ? 0 : -1,
          onClick: () => setTab(id), onKeyDown: (event) => useTabKeys(event, index) }, label))),
      h('div', { className: 'pg-detail-body', role: 'tabpanel', id: `${tabId}-panel-${tab}`, 'aria-labelledby': `${tabId}-${tab}`, tabIndex: 0 },
        failed ? h('div', { className: 'pg-detail-section' },
          h('p', { className: 'pg-error', role: 'alert' }, msg('赛题详情读取失败，请稍后重试，或在网页中查看。', 'Could not load challenge details. Try again later or open the challenge on the web.')),
          h('button', { type: 'button', className: 'pg-button', disabled: busy, onClick: load }, busy ? msg('正在读取…', 'Loading…') : msg('重试', 'Retry'))) : null,
        busy && !detail && !failed ? h('p', { className: 'pg-note' }, msg('正在读取赛题详情…', 'Loading challenge details…')) : null,
        detail && tab === 'overview' ? challengeOverview(detail, progress) : null,
        detail && tab === 'statement' ? renderStatement() : null,
        detail && tab === 'resources' ? renderResources() : null,
        tab === 'overview' && tags.length ? h('ul', { className: 'pg-detail-tags', 'aria-label': msg('标签', 'Tags') },
          tags.map((tag) => h('li', { key: tag, className: 'pg-badge' }, tag))) : null),
      h('footer', { className: 'pg-detail-footer' },
        handoff ? h(DispatchChallengeButton, { challenge: { id: challengeId, title }, handoff, beforeDispatch: dismiss, primary: true }) : null,
        requestTask ? h('button', { type: 'button', className: 'pg-button', disabled: detail?.contentGated === true || handoff?.gatedIds?.has(challengeId) || undefined,
          onClick: () => { dismiss(); requestTask({ id: challengeId, title, mode: 'participate' }); } }, msg('开始参赛任务', 'Start participation task')) : null,
        openWebButton(detail?.webUrl || challenge.webUrl, title, { label: msg('在网页中查看', 'View on the web'), className: 'pg-detail-web' }))));
}

export { ChallengeDetailDrawer, DispatchChallengeButton };
