import { msg, currentLanguage } from '../shared/language.js';
import * as React from 'react';
import { useDrawerFocus } from '../shared/drawer.js';
import { locales } from '../shared/locale.js';
import { h } from '../shared/react.js';
import { openWebButton } from '../shared/display.js';

// Right-side drawer for one catalog challenge. It reads the detail once when it opens, through the
// session-free query service, so opening it writes nothing into any conversation. Closing aborts the read.
function DispatchChallengeButton({ challenge, handoff, beforeDispatch }) {
  const busy = ['sending', 'initializing', 'opening'].includes(handoff.state?.phase);
  const gated = handoff.gatedIds?.has(String(challenge.id)) === true;
  return h('button', { type: 'button', className: 'pg-button pg-primary', disabled: gated, 'aria-disabled': busy || gated || undefined, onClick: (event) => {
    if (busy || handoff.gatedIds?.has(String(challenge.id))) return;
    event?.currentTarget?.focus();
    beforeDispatch?.();
    handoff.start({ id: String(challenge.id), title: msg(challenge.titleZh || challenge.title, challenge.title || challenge.titleZh) || String(challenge.id) });
  } }, gated ? msg('题面需要权限', 'Statement access required') : busy && handoff.state.challenge.id === String(challenge.id) ? msg('正在交接…', 'Handing off…') : msg('交给主控', 'Hand off to controller'));
}

const challengeDetailCss = '.pg-detail-facts{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;margin:12px 0;font-size:13px}.pg-detail-facts dt{color:var(--dsw-alias-label-secondary)}.pg-detail-facts dd{margin:0;overflow-wrap:anywhere}.pg-detail-section{margin-top:16px}.pg-detail-section h3{margin:0 0 6px;font-size:14px}.pg-detail-tags{display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none}.pg-detail-resources{margin:0;padding:0;list-style:none;display:grid;gap:8px}.pg-detail-resources li{padding:8px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;font-size:13px;overflow-wrap:anywhere}.pg-statement{box-sizing:border-box;max-height:min(60vh,520px);overflow:auto;margin:8px 0 0;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;font-size:13px;line-height:1.7}';

function ChallengeDetailDrawer({ challenge, query, handoff, close, focusFallback }) {
  const [detail, setDetail] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);
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
  const facts = [[msg('方向', 'Discipline'), shown.discipline], [msg('来源', 'Source'), shown.origin], [msg('难度', 'Difficulty'), shown.difficulty],
    [msg('状态', 'Status'), shown.status ? locales[currentLanguage()].states[shown.status] || shown.status : undefined], [msg('提交次数', 'Submissions'), shown.attempts]]
    .filter(([, value]) => value !== undefined && value !== null && value !== '');
  // Deduplicated here too: before the read settles the tags come from the catalog card, and each tag is a key.
  const tags = Array.isArray(shown.tags) ? [...new Set(shown.tags.filter((tag) => typeof tag === 'string' && tag))] : [];
  const resources = Array.isArray(detail?.resources) ? detail.resources.filter((item) => item && typeof item === 'object') : [];
  const content = typeof detail?.content === 'string' ? detail.content : '';
  return h('div', { className: 'pg-drawer-backdrop', onMouseDown: dismiss },
    h('aside', { className: 'pg-drawer', role: 'dialog', 'aria-modal': true, 'aria-label': msg(`${title} 赛题详情`, `Challenge details: ${title}`), 'aria-busy': busy, onMouseDown: (event) => event.stopPropagation(), ref: (node) => { focus.dialog = node; } },
      h('style', null, challengeDetailCss),
      h('p', { className: 'pg-sr-only', role: 'status', 'aria-live': 'polite' }, status && msg(...status)),
      h('div', { className: 'pg-drawer-header' },
        h('div', { className: 'pg-drawer-heading' }, h('h2', { className: 'pg-drawer-title', tabIndex: -1, ref: (node) => { focus.title = node; } }, title)),
        h('div', { className: 'pg-drawer-actions' },
          h('button', { type: 'button', className: 'pg-button pg-drawer-close', onClick: dismiss, 'aria-label': msg('关闭赛题详情', 'Close challenge details') }, msg('关闭', 'Close')))),
      h('p', { className: 'pg-note pg-path' }, msg(`题目编号：${challengeId}`, `Challenge ID: ${challengeId}`)),
      facts.length ? h('dl', { className: 'pg-detail-facts' }, facts.flatMap(([label, value]) => [h('dt', { key: `${label}-t` }, label), h('dd', { key: `${label}-d` }, String(value))])) : null,
      tags.length ? h('ul', { className: 'pg-detail-tags', 'aria-label': msg('标签', 'Tags') }, tags.map((tag) => h('li', { key: tag, className: 'pg-badge' }, tag))) : null,
      h('div', { className: 'pg-actions' },
        handoff ? h(DispatchChallengeButton, { challenge: { id: challengeId, title }, handoff, beforeDispatch: dismiss }) : null,
        openWebButton(detail?.webUrl || challenge.webUrl, title)),
      failed ? h('div', { className: 'pg-detail-section' },
        h('p', { className: 'pg-error', role: 'alert' }, msg('赛题详情读取失败，请稍后重试，或在网页中查看。', 'Could not load challenge details. Try again later or open the challenge on the web.')),
        h('div', { className: 'pg-actions' }, h('button', { type: 'button', className: 'pg-button', disabled: busy, onClick: () => load() }, busy ? msg('正在读取…', 'Loading…') : msg('重试', 'Retry')))) : null,
      busy && !detail && !failed ? h('p', { className: 'pg-note' }, msg('正在读取赛题详情…', 'Loading challenge details…')) : null,
      detail ? h('section', { className: 'pg-detail-section', 'aria-label': msg('资源', 'Resources') },
        h('h3', null, msg('资源', 'Resources')),
        resources.length ? h('ul', { className: 'pg-detail-resources' }, resources.map((item, index) => h('li', { key: `${index}:${item.name || ''}` },
          h('strong', null, item.name || msg('未命名资源', 'Unnamed resource')),
          [item.kind, item.role].filter(Boolean).length ? h('span', { className: 'pg-note' }, ` · ${[item.kind, item.role].filter(Boolean).join(' · ')}`) : null,
          item.description ? h('p', { className: 'pg-note' }, item.description) : null,
          // Platform text, shown as text only: never a link.
          item.source ? h('p', { className: 'pg-note pg-path' }, msg(`来源：${item.source}`, `Source: ${item.source}`)) : null)))
          : h('p', { className: 'pg-note' }, msg('这道题没有列出资源。', 'No resources are listed for this challenge.'))) : null,
      detail ? h('section', { className: 'pg-detail-section', 'aria-label': msg('题面', 'Challenge statement') },
        h('h3', null, msg('题面', 'Challenge statement')),
        detail.contentGated ? h('p', { className: 'pg-note' }, msg('题面需要权限，请在网页中查看', 'Access is required. Open the statement on the web.'))
          : !content ? h('p', { className: 'pg-note' }, msg('这道题没有题面文字。', 'No statement text is available.'))
          : [h('button', { key: 'toggle', type: 'button', className: 'pg-button', 'aria-expanded': expanded, onClick: () => setExpanded(!expanded) }, expanded ? msg('收起题面', 'Collapse statement') : msg('展开题面', 'Expand statement')),
            // Plain text with its line breaks kept; the plugin has no markdown renderer.
            expanded ? h('pre', { key: 'statement', className: 'pg-statement', tabIndex: 0, 'aria-label': msg('题面全文', 'Full challenge statement') }, content) : null,
            // The number comes from the Host's cap (`contentLimit`); without it the note names no number.
            expanded && detail.truncated ? h('p', { key: 'truncated', className: 'pg-note' }, Number.isSafeInteger(detail.contentLimit) && detail.contentLimit > 0
              ? msg(`题面超过 ${detail.contentLimit} 字，这里只显示前 ${detail.contentLimit} 字；完整题面请在网页中查看。`, `Showing the first ${detail.contentLimit} characters. Open the challenge on the web to read the full statement.`)
              : msg('题面过长，这里只显示前一部分；完整题面请在网页中查看。', 'Only the beginning of the statement is shown. Open the challenge on the web to read the rest.')) : null]) : null));
}

export { ChallengeDetailDrawer, DispatchChallengeButton };

