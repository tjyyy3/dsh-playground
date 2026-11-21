import * as React from 'react';
import { useDrawerFocus } from '../shared/drawer.js';
import { locales } from '../shared/locale.js';
import { h } from '../shared/react.js';
import { openWebButton } from '../shared/display.js';

// Right-side drawer for one catalog challenge. It reads the detail once when it opens, through the
// session-free query service, so opening it writes nothing into any conversation. Closing aborts the read.
function DispatchChallengeButton({ challenge, handoff, beforeDispatch }) {
  const busy = handoff.state?.phase === 'sending' || handoff.state?.phase === 'opening';
  return h('button', { type: 'button', className: 'pg-button pg-primary', 'aria-disabled': busy || undefined, onClick: (event) => {
    if (busy) return;
    event?.currentTarget?.focus();
    beforeDispatch?.();
    handoff.start({ id: String(challenge.id), title: challenge.titleZh || challenge.title || String(challenge.id) });
  } }, busy && handoff.state.challenge.id === String(challenge.id) ? '正在交接…' : '交给主控');
}

const challengeDetailCss = '.pg-detail-facts{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;margin:12px 0;font-size:13px}.pg-detail-facts dt{color:var(--dsw-alias-label-secondary)}.pg-detail-facts dd{margin:0;overflow-wrap:anywhere}.pg-detail-section{margin-top:16px}.pg-detail-section h3{margin:0 0 6px;font-size:14px}.pg-detail-tags{display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none}.pg-detail-resources{margin:0;padding:0;list-style:none;display:grid;gap:8px}.pg-detail-resources li{padding:8px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;font-size:13px;overflow-wrap:anywhere}.pg-statement{box-sizing:border-box;max-height:min(60vh,520px);overflow:auto;margin:8px 0 0;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;font-size:13px;line-height:1.7}';

function ChallengeDetailDrawer({ challenge, query, handoff, close, focusFallback }) {
  const [detail, setDetail] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);
  const [status, setStatus] = React.useState('');
  // Mutable holder (not render state): only the newest read may update the drawer, and none after closing.
  const [latest] = React.useState(() => ({ controller: null, closed: false }));
  const challengeId = String(challenge.id);
  const load = async () => {
    latest.controller?.abort();
    if (latest.closed) return;
    const controller = new AbortController();
    latest.controller = controller;
    setBusy(true); setFailed(false); setStatus('正在读取赛题详情…');
    try {
      const result = await query({ action: 'challenge', challengeId }, controller.signal);
      if (latest.controller !== controller) return;
      if (!result || typeof result !== 'object' || result.ok === false) throw new Error('challenge detail unavailable');
      setDetail(result); setStatus('赛题详情已读取。');
    } catch {
      if (latest.controller !== controller) return;
      // Fixed text: the thrown message may come from the platform and is never shown here.
      setFailed(true); setStatus('赛题详情读取失败。');
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
  const title = shown.titleZh || shown.title || challengeId;
  const facts = [['方向', shown.discipline], ['来源', shown.origin], ['难度', shown.difficulty],
    ['状态', shown.status ? locales.zh.states[shown.status] || shown.status : undefined], ['提交次数', shown.attempts]]
    .filter(([, value]) => value !== undefined && value !== null && value !== '');
  // Deduplicated here too: before the read settles the tags come from the catalog card, and each tag is a key.
  const tags = Array.isArray(shown.tags) ? [...new Set(shown.tags.filter((tag) => typeof tag === 'string' && tag))] : [];
  const resources = Array.isArray(detail?.resources) ? detail.resources.filter((item) => item && typeof item === 'object') : [];
  const content = typeof detail?.content === 'string' ? detail.content : '';
  return h('div', { className: 'pg-drawer-backdrop', onMouseDown: dismiss },
    h('aside', { className: 'pg-drawer', role: 'dialog', 'aria-modal': true, 'aria-label': `${title} 赛题详情`, 'aria-busy': busy, onMouseDown: (event) => event.stopPropagation(), ref: (node) => { focus.dialog = node; } },
      h('style', null, challengeDetailCss),
      h('p', { className: 'pg-sr-only', role: 'status', 'aria-live': 'polite' }, status),
      h('div', { className: 'pg-drawer-header' },
        h('div', { className: 'pg-drawer-heading' }, h('h2', { className: 'pg-drawer-title', tabIndex: -1, ref: (node) => { focus.title = node; } }, title)),
        h('div', { className: 'pg-drawer-actions' },
          h('button', { type: 'button', className: 'pg-button pg-drawer-close', onClick: dismiss, 'aria-label': '关闭赛题详情' }, '关闭'))),
      h('p', { className: 'pg-note pg-path' }, `题目编号：${challengeId}`),
      facts.length ? h('dl', { className: 'pg-detail-facts' }, facts.flatMap(([label, value]) => [h('dt', { key: `${label}-t` }, label), h('dd', { key: `${label}-d` }, String(value))])) : null,
      tags.length ? h('ul', { className: 'pg-detail-tags', 'aria-label': '标签' }, tags.map((tag) => h('li', { key: tag, className: 'pg-badge' }, tag))) : null,
      h('div', { className: 'pg-actions' },
        handoff ? h(DispatchChallengeButton, { challenge: { id: challengeId, title }, handoff, beforeDispatch: dismiss }) : null,
        openWebButton(detail?.webUrl || challenge.webUrl, title)),
      failed ? h('div', { className: 'pg-detail-section' },
        h('p', { className: 'pg-error', role: 'alert' }, '赛题详情读取失败，请稍后重试，或在网页中查看。'),
        h('div', { className: 'pg-actions' }, h('button', { type: 'button', className: 'pg-button', disabled: busy, onClick: () => load() }, busy ? '正在读取…' : '重试'))) : null,
      busy && !detail && !failed ? h('p', { className: 'pg-note' }, '正在读取赛题详情…') : null,
      detail ? h('section', { className: 'pg-detail-section', 'aria-label': '资源' },
        h('h3', null, '资源'),
        resources.length ? h('ul', { className: 'pg-detail-resources' }, resources.map((item, index) => h('li', { key: `${index}:${item.name || ''}` },
          h('strong', null, item.name || '未命名资源'),
          [item.kind, item.role].filter(Boolean).length ? h('span', { className: 'pg-note' }, ` · ${[item.kind, item.role].filter(Boolean).join(' · ')}`) : null,
          item.description ? h('p', { className: 'pg-note' }, item.description) : null,
          // Platform text, shown as text only: never a link.
          item.source ? h('p', { className: 'pg-note pg-path' }, `来源：${item.source}`) : null)))
          : h('p', { className: 'pg-note' }, '这道题没有列出资源。')) : null,
      detail ? h('section', { className: 'pg-detail-section', 'aria-label': '题面' },
        h('h3', null, '题面'),
        detail.contentGated ? h('p', { className: 'pg-note' }, '题面需要权限，请在网页中查看')
          : !content ? h('p', { className: 'pg-note' }, '这道题没有题面文字。')
          : [h('button', { key: 'toggle', type: 'button', className: 'pg-button', 'aria-expanded': expanded, onClick: () => setExpanded(!expanded) }, expanded ? '收起题面' : '展开题面'),
            // Plain text with its line breaks kept; the plugin has no markdown renderer.
            expanded ? h('pre', { key: 'statement', className: 'pg-statement', tabIndex: 0, 'aria-label': '题面全文' }, content) : null,
            // The number comes from the Host's cap (`contentLimit`); without it the note names no number.
            expanded && detail.truncated ? h('p', { key: 'truncated', className: 'pg-note' }, Number.isSafeInteger(detail.contentLimit) && detail.contentLimit > 0
              ? `题面超过 ${detail.contentLimit} 字，这里只显示前 ${detail.contentLimit} 字；完整题面请在网页中查看。`
              : '题面过长，这里只显示前一部分；完整题面请在网页中查看。') : null]) : null));
}

export { ChallengeDetailDrawer, DispatchChallengeButton };

