import * as React from 'react';
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import { h } from '../shared/react.js';
import { msg } from '../shared/language.js';
import { openableWebUrl } from '../shared/display.js';
import { taskModalCss } from '../shared/styles.js';

const storageKey = 'dsh-playground.competition-notices.v1';

function timeLabel(value) {
  if (!value) return undefined;
  const timestamp = /^(\d{4}-\d{2}-\d{2})[T ](\d\d:\d\d)(?::(\d\d)(?:\.\d+)?)?\s*(Z|[+-]\d\d:\d\d)?$/.exec(value);
  if (!timestamp) return value;
  const [, date, time, seconds, offset] = timestamp;
  const zone = offset === 'Z' ? 'UTC' : offset ? 'UTC' + offset : msg('时区未注明', 'time zone unspecified');
  return `${date} ${time}${seconds && seconds !== '00' ? ':' + seconds : ''} (${zone})`;
}

function readState(memory) {
  try {
    const state = JSON.parse(window.localStorage?.getItem(storageKey) ?? 'null');
    if (typeof state?.enabled === 'boolean' && state.seen && typeof state.seen === 'object' &&
        Object.values(state.seen).every((site) => Array.isArray(site?.sources) && Array.isArray(site.keys))) return state;
  } catch { /* Use this DSH session when browser storage is unavailable. */ }
  return memory.state ?? { enabled: true, seen: {} };
}

function saveState(memory, state) {
  memory.state = state;
  try { window.localStorage?.setItem(storageKey, JSON.stringify(state)); }
  catch { /* The setting still applies until DSH closes. */ }
}

export function CompetitionNoticeSetting({ memory }) {
  const [enabled, setEnabled] = React.useState(() => readState(memory).enabled);
  return h('label', { className: 'pg-field', style: { display: 'flex', alignItems: 'center', gap: 8, margin: '20px 0' } },
    h('input', { type: 'checkbox', checked: enabled, onChange: (event) => {
      const checked = event.target.checked;
      saveState(memory, { enabled: checked, seen: {} });
      setEnabled(checked);
    } }), msg('新比赛提醒', 'New competition alerts'));
}

const noticeCss = `
  .pg-task-modal.pg-contest-notice { border:1px solid var(--pg-task-border); box-shadow:0 12px 48px rgba(0,0,0,.16) }
  .pg-notice-entries { overflow-y:auto; overscroll-behavior:contain; min-height:0 }
  .pg-notice-entry { min-width:0 }
  .pg-notice-entry + .pg-notice-entry { border-top:1px solid var(--pg-task-border); padding-top:16px }
  .pg-notice-entry h3 { font-size:16px; line-height:1.5; margin:0; overflow-wrap:anywhere }
  .pg-notice-entry p { line-height:1.6; margin:4px 0 12px; overflow-wrap:anywhere }
  .pg-notice-entry dl { display:grid; grid-template-columns:max-content minmax(0,1fr); gap:5px 16px; margin:0 0 12px; line-height:1.5 }
  .pg-notice-entry dt { color:var(--pg-task-secondary) }
  .pg-notice-entry dd { margin:0; overflow-wrap:anywhere; white-space:pre-line }
  .pg-notice-entry a { color:var(--pg-task-accent); text-underline-offset:3px }
  .pg-notice-actions { display:flex; align-items:center; justify-content:space-between; gap:12px }
  .pg-notice-actions .pg-task-create { min-width:90px; background:var(--dsw-alias-button-primary-fill,var(--pg-task-accent)); color:var(--dsw-alias-label-primary-foreground,#fff) }
  .pg-notice-disable { color:var(--pg-task-secondary); border:0; background:none; padding:8px 0; font:inherit; cursor:pointer }
  .pg-notice-disable:hover { text-decoration:underline }
`;

export function CompetitionNotices({ memory, query }) {
  const [items, setItems] = React.useState([]);
  React.useEffect(() => {
    if (!readState(memory).enabled) return;
    const abort = new AbortController();
    async function check() {
      let snapshot;
      try { snapshot = await query({ action: 'competition_notices' }, abort.signal); }
      catch { return; }
      if (abort.signal.aborted || !snapshot?.ok) return;
      const state = readState(memory);
      if (!state.enabled) return;
      const site = state.seen[snapshot.scope];
      const initialized = new Set(site?.sources);
      const known = new Set(site?.keys);
      const fresh = new Map();
      for (const item of snapshot.items) {
        if (initialized.has(item.source) && !known.has(item.key) && !fresh.has(item.key)) fresh.set(item.key, item);
      }
      for (const source of snapshot.sources) initialized.add(source);
      for (const item of snapshot.items) known.add(item.key);
      saveState(memory, { enabled: true, seen: { ...state.seen, [snapshot.scope]: { sources: [...initialized], keys: [...known] } } });
      const additions = [...fresh.values()];
      const parents = new Set(additions.map((item) => item.parentKey).filter(Boolean));
      setItems(additions.filter((item) => !parents.has(item.key)));
    }
    void check();
    return () => abort.abort();
  }, [memory, query]);
  if (!items.length) return null;
  const close = () => setItems([]);
  const unknown = msg('暂未公布', 'Not announced');
  const title = msg('新比赛提醒', 'New competition alerts');
  return h(Modal, { open: true, headless: true, backdropBlur: false, className: 'pg-task-modal pg-contest-notice', title, onClose: close },
    h('style', null, taskModalCss + noticeCss),
    h('header', { className: 'pg-task-header' }, h('h2', null, title)),
    h('div', { className: 'pg-task-body pg-notice-entries' }, items.map((item) => {
      const link = openableWebUrl(item.webUrl);
      return h('article', { key: item.key, className: 'pg-notice-entry' },
        h('h3', null, msg(item.titleZh || item.title, item.title || item.titleZh)),
        h('p', null, msg(item.summaryZh || item.summary, item.summary || item.summaryZh) || msg('比赛简介暂未公布', 'Competition summary not announced')),
        h('dl', null, [
          [msg('开始时间', 'Starts'), timeLabel(item.startAt)], [msg('结束时间', 'Ends'), timeLabel(item.endAt)],
          [msg('奖励', 'Rewards'), msg(item.rewardZh || item.reward, item.reward || item.rewardZh)],
          [msg('平台资源', 'Platform resources'), msg(item.resourcesZh || item.resources, item.resources || item.resourcesZh)],
        ].map(([label, value]) => h(React.Fragment, { key: label }, h('dt', null, label), h('dd', null, value || unknown)))),
        link ? h('a', { href: link, target: '_blank', rel: 'noopener noreferrer' }, msg('查看比赛', 'View competition')) : null);
    })),
    h('footer', { className: 'pg-task-footer pg-notice-actions' },
      h('button', { type: 'button', className: 'pg-notice-disable', onClick: () => {
        saveState(memory, { enabled: false, seen: {} });
        close();
      } }, msg('关闭新比赛提醒', 'Turn off competition alerts')),
      h('button', { type: 'button', className: 'pg-task-button pg-task-create', 'data-modal-autofocus': true, onClick: close }, msg('知道了', 'Got it'))));
}
