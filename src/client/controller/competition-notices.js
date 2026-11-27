import * as React from 'react';
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import { h } from '../shared/react.js';
import { msg } from '../shared/language.js';
import { openableWebUrl } from '../shared/display.js';
import { taskModalCss } from '../shared/styles.js';
import { actOnNotices, createNoticeState, enterNotices } from './competition-notice-state.js';

const storageKey = 'dsh-playground.competition-notices.v2';
const legacyStorageKey = 'dsh-playground.competition-notices.v1';

function timeLabel(value) {
  if (!value) return undefined;
  const timestamp = /^(\d{4}-\d{2}-\d{2})[T ](\d\d:\d\d)(?::(\d\d)(?:\.\d+)?)?\s*(Z|[+-]\d\d:\d\d)?$/.exec(value);
  if (!timestamp) return value;
  const [, date, time, seconds, offset] = timestamp;
  const zone = offset === 'Z' ? 'UTC' : offset ? 'UTC' + offset : msg('时区未注明', 'time zone unspecified');
  return `${date} ${time}${seconds && seconds !== '00' ? ':' + seconds : ''} (${zone})`;
}

function noticeDetail(zh, en, keywords) {
  const published = (value) => value?.trim().replace(/^(?:暂未公布|尚未公布|待公布|未公布|无|not announced|to be announced|none|TBA|TBD)[。.!！]?$/i, '');
  const chinese = published(zh);
  const english = published(en);
  const value = msg(chinese || english, english || chinese);
  return value && value.split(keywords).map((part, index) => index % 2 ? h('strong', { key: index }, part) : part);
}

function readState(memory) {
  try {
    const stored = window.localStorage?.getItem(storageKey) ?? window.localStorage?.getItem(legacyStorageKey);
    if (stored != null && !memory.unsaved) return createNoticeState(JSON.parse(stored));
  } catch { /* Use this DSH session when browser storage is unavailable. */ }
  return memory.state ?? createNoticeState();
}

function saveState(memory, state) {
  memory.state = state;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
    memory.unsaved = false;
  } catch { memory.unsaved = true; }
}

export function CompetitionNoticeSetting({ memory }) {
  const [enabled, setEnabled] = React.useState(() => readState(memory).enabled);
  return h('label', { className: 'pg-field', style: { display: 'flex', alignItems: 'center', gap: 8, margin: '20px 0' } },
    h('input', { type: 'checkbox', checked: enabled, onChange: (event) => {
      const checked = event.target.checked;
      saveState(memory, actOnNotices(readState(memory), null, checked ? 'enable' : 'disable', Date.now()));
      setEnabled(checked);
    } }), msg('新比赛提醒', 'New competition alerts'));
}

const noticeCss = `
  .pg-task-modal.pg-contest-notice { width:590px; border:1px solid var(--pg-task-border); box-shadow:0 12px 48px rgba(0,0,0,.16) }
  .pg-notice-entries { overflow-y:auto; overscroll-behavior:contain; min-height:0; gap:16px }
  .pg-notice-entry { min-width:0 }
  .pg-notice-entry + .pg-notice-entry { border-top:1px solid var(--pg-task-border); padding-top:16px }
  .pg-notice-entry h3 { font-size:19px; line-height:1.35; font-weight:700; margin:0; overflow-wrap:anywhere }
  .pg-notice-entry p { color:var(--pg-task-secondary); line-height:1.6; margin:6px 0 12px; overflow-wrap:anywhere }
  .pg-notice-entry dl { display:grid; grid-template-columns:max-content minmax(0,1fr); gap:5px 16px; margin:0 0 12px; line-height:1.5 }
  .pg-notice-entry dt, .pg-notice-entry dd strong { font-weight:700 }
  .pg-notice-entry dd { margin:0; font-weight:400; overflow-wrap:anywhere; white-space:pre-line }
  .pg-notice-entry a { color:var(--pg-task-accent); font-weight:600; text-underline-offset:3px }
  .pg-notice-entry-actions { display:flex; align-items:center; gap:12px; flex-wrap:wrap }
  .pg-notice-actions { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:6px 12px }
  .pg-notice-batch { display:flex; justify-content:flex-end; flex-wrap:wrap; gap:8px; margin-inline-start:auto }
  .pg-contest-notice h2:focus-visible { outline:2px solid var(--pg-task-accent); outline-offset:3px; border-radius:4px }
  .pg-notice-actions .pg-task-create { min-width:90px; background:var(--dsw-alias-button-primary-fill,var(--pg-task-accent)); color:var(--dsw-alias-label-primary-foreground,#fff) }
  .pg-notice-disable { color:var(--pg-task-secondary); border:0; background:none; padding:8px 0; font:inherit; cursor:pointer }
  .pg-notice-disable:hover { text-decoration:underline }
`;

export function CompetitionNotices({ memory, query, onCoordinate }) {
  const [view, setView] = React.useState(null);
  const [readingKey, setReadingKey] = React.useState('');
  const reading = React.useRef(null);
  const hintId = React.useId();
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
      const next = enterNotices(state, snapshot, Date.now());
      if (next.state !== state) saveState(memory, next.state);
      setView(next);
    }
    void check();
    return () => { abort.abort(); reading.current?.abort(); };
  }, [memory, query]);
  if (!view?.items.length) return null;
  function dismiss(action) {
    reading.current?.abort();
    saveState(memory, actOnNotices(readState(memory), view, action, Date.now()));
    setView(null);
  }
  async function coordinate(item) {
    if (reading.current) return;
    let target = item.target ?? { kind: 'collection' };
    if (target.kind === 'challenge') {
      const abort = new AbortController();
      reading.current = abort;
      setReadingKey(item.key);
      const { challengeId, title, ...source } = target;
      const detail = await query({ action: 'challenge', challengeId }, abort.signal).catch(() => undefined);
      if (abort.signal.aborted) return;
      reading.current = null;
      setReadingKey('');
      const resolved = detail?.ok && String(detail.id) === challengeId;
      target = resolved && !detail.contentGated
        ? { kind: 'challenge', challengeId, title: msg(detail.titleZh || detail.title, detail.title || detail.titleZh) || title }
        : { ...source, kind: 'collection', ...(resolved && detail.contentGated && { gatedChallengeId: challengeId }) };
    }
    onCoordinate(target, { scope: view.scope, key: item.key, webUrl: openableWebUrl(item.webUrl),
      title: item.title, titleZh: item.titleZh,
      acknowledge: () => saveState(memory, actOnNotices(readState(memory), { ...view, items: [item] }, 'acknowledge', Date.now())) });
    setView(null);
  }
  const unknown = msg('暂未公布', 'Not announced');
  const title = view.kind === 'overview' ? msg('正在进行的比赛', 'Ongoing competitions')
    : view.kind === 'reminder' ? msg('赛事提醒', 'Competition reminders') : msg('新比赛提醒', 'New competition alerts');
  return h(Modal, { open: true, headless: true, backdropBlur: false, className: 'pg-task-modal pg-contest-notice', title, onClose: () => dismiss('snooze') },
    h('style', null, taskModalCss + noticeCss),
    h('header', { className: 'pg-task-header' }, h('h2', { tabIndex: -1, 'data-modal-autofocus': true }, title)),
    h('div', { className: 'pg-task-body pg-notice-entries' }, view.items.map((item) => {
      const link = openableWebUrl(item.webUrl);
      return h('article', { key: item.key, className: 'pg-notice-entry' },
        h('h3', null, msg(item.titleZh || item.title, item.title || item.titleZh)),
        h('p', null, msg(item.summaryZh || item.summary, item.summary || item.summaryZh) || msg('比赛简介暂未公布', 'Competition summary not announced')),
        h('dl', null, [
          [msg('开始', 'Starts'), timeLabel(item.startAt)],
          [msg('截止', 'Deadline'), timeLabel(item.endAt) || unknown],
          [msg('奖励', 'Rewards'), noticeDetail(item.rewardZh, item.reward, /((?:\b(?:CNY|RMB|USD)\s*|[¥￥$]\s*)\d+(?:,\d{3})*(?:\.\d+)?|\d+(?:,\d{3})*(?:\.\d+)?\s*万?元)/i)],
          [msg('参赛资源', 'Resources'), noticeDetail(item.resourcesZh, item.resources, /(算力支持|\bcompute support\b)/i)],
        ].filter(([, value]) => value).map(([label, value]) => h(React.Fragment, { key: label }, h('dt', null, label), h('dd', null, value)))),
        h('div', { className: 'pg-notice-entry-actions' },
          h('button', { type: 'button', className: 'pg-task-button', disabled: Boolean(readingKey), onClick: () => coordinate(item) },
            readingKey === item.key ? msg('正在读取赛题…', 'Loading challenge…') : msg('协调参赛', 'Coordinate participation')),
          link ? h('a', { href: link, target: '_blank', rel: 'noopener noreferrer' }, msg('查看比赛', 'View competition')) : null));
    })),
    h('footer', { className: 'pg-task-footer' },
      h('p', { id: hintId }, msg('「明天再提醒」会在北京时间次日或之后再次打开主控时，显示本批仍有效的赛事。「知道了」仅确认本批。两种操作都保留新赛期提醒。',
        'Choose Remind me tomorrow to see this batch on your next visit tomorrow or later (Beijing time). Expired entries drop out. Got it dismisses this batch. Either choice keeps alerts for new rounds on.')),
      h('div', { className: 'pg-notice-actions' },
        h('button', { type: 'button', className: 'pg-notice-disable', onClick: () => dismiss('disable') }, msg('关闭新比赛提醒', 'Turn off competition alerts')),
        h('div', { className: 'pg-notice-batch' },
          h('button', { type: 'button', className: 'pg-task-button', 'aria-describedby': hintId, onClick: () => dismiss('snooze') }, msg('明天再提醒', 'Remind me tomorrow')),
          h('button', { type: 'button', className: 'pg-task-button pg-task-create', 'aria-describedby': hintId, onClick: () => dismiss('acknowledge') }, msg('知道了', 'Got it'))))));
}
