import * as React from 'react';
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import { h } from '../shared/react.js';
import { msg } from '../shared/language.js';
import { openableWebUrl } from '../shared/display.js';
import { taskModalCss } from '../shared/styles.js';
import { controllerDialogCss, noticeCss } from './dialog-styles.js';
import { actOnNotices, createNoticeState, enterNotices, noticeDate, noticeIsActive } from './competition-notice-state.js';

const storageKey = 'dsh-playground.competition-notices.v2';
const legacyStorageKey = 'dsh-playground.competition-notices.v1';

function timeLabel(value) {
  const match = typeof value === 'string' && /^\d{4}-(\d\d)-(\d\d)(?:[T ](\d\d:\d\d)(?::(\d\d)(?:\.\d+)?)?\s*(?:Z|[+-]\d\d:?\d\d)?)?$/i.exec(value.trim());
  if (!match) return value;
  const [, month, day, time, seconds] = match;
  return month + '.' + day + (time ? ' ' + time + (seconds && seconds !== '00' ? ':' + seconds : '') : '');
}

function zoneLabel(zone) {
  const normalized = zone.toUpperCase().replace(/^([+-]\d\d)(\d\d)$/, '$1:$2');
  if (normalized === 'Z') return 'UTC';
  if (normalized === '+08:00') return msg('北京时间 UTC+8', 'Beijing time UTC+8');
  return 'UTC' + normalized;
}

function remainingLabel(ms) {
  if (ms <= 0) return msg('截止时间已过', 'Deadline passed');
  const hours = Math.floor(ms / 3_600_000);
  if (!hours) return msg('剩余不足 1 小时', 'Less than 1 hour left');
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return days
    ? msg(`剩余 ${days} 天 ${rest} 小时`, `${days}d ${rest}h left`)
    : msg(`剩余 ${hours} 小时`, `${hours}h left`);
}

function noticeGroups(item) {
  for (const summary of [msg(item.summaryZh, item.summary), msg(item.summary, item.summaryZh)]) {
    const list = /^(?:本期赛题分组[：:]|Challenge groups:)\s*(.+)$/i.exec(summary ?? '')?.[1];
    if (list) return list.split(' · ').map((label) => label.trim()).filter(Boolean);
  }
  return [];
}

function noticeBadge(item) {
  if (item.parentKey && item.source === 'seasons') return ['round', msg('新一轮', 'New round')];
  if (item.parentKey || item.target?.period) return ['period', msg('新一期', 'New period')];
  return ['competition', msg('新比赛', 'New competition')];
}

function noticeSchedule(item, start, end, now, unknown) {
  const progress = start && end && start.ms < end.ms
    ? Math.min(100, Math.max(0, 100 * (now - start.ms) / (end.ms - start.ms))) : null;
  return h('div', { className: 'pg-notice-schedule' },
    progress === null ? null : h('div', { className: 'pg-notice-track', role: 'progressbar',
      'aria-label': msg('赛程进度', 'Competition progress'), 'aria-valuenow': Math.round(progress) },
      h('span', { style: { width: progress + '%', '--pg-notice-progress': progress + '%' } })),
    h('div', { className: 'pg-notice-times' },
      h('span', null, msg('开始', 'Starts'), ' ', timeLabel(item.startAt) || unknown,
        start && (!end || zoneLabel(start.zone) !== zoneLabel(end.zone)) ? ' (' + zoneLabel(start.zone) + ')' : null),
      end ? h('span', { className: 'pg-notice-remaining' }, remainingLabel(end.ms - now)) : null,
      h('span', null, msg('截止', 'Deadline'), ' ', timeLabel(item.endAt) || unknown)));
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
  const now = Date.now();
  const count = view.items.length;
  return h(Modal, { open: true, headless: true, backdropBlur: true, className: 'pg-task-modal pg-controller-dialog pg-contest-notice', title, onClose: () => dismiss('snooze') },
    h('style', null, taskModalCss + controllerDialogCss + noticeCss),
    h('header', { className: 'pg-task-header' },
      h('div', { className: 'pg-notice-heading' },
        h('span', { className: 'pg-dialog-label' }, msg(`EVENTS · ${count} 条 · 按最近截止排序`, `EVENTS · ${count} · Earliest deadlines first`)),
        h('h2', { tabIndex: -1, 'data-modal-autofocus': true }, title),
        h('p', null, view.kind === 'overview'
          ? msg('只列出能由官方状态或带时区赛程确认正在进行的比赛和赛期。', 'Ongoing competitions and rounds are verified by official status or a schedule with a time zone.')
          : msg('查看比赛和赛期。进行中状态来自官方状态或带时区赛程。', 'Explore competitions and rounds. Ongoing status comes from official status or a schedule with a time zone.'))),
      h('button', { type: 'button', className: 'pg-task-close', 'aria-label': msg('关闭新比赛提醒弹窗', 'Close competition alerts dialog'),
        onClick: () => dismiss('snooze') },
        h('svg', { viewBox: '0 0 14 14', 'aria-hidden': true }, h('path', { d: 'm3 3 8 8M11 3l-8 8' })))),
    h('div', { className: 'pg-task-body' }, view.items.map((item) => {
      const link = openableWebUrl(item.webUrl);
      const start = noticeDate(item.startAt);
      const end = noticeDate(item.endAt);
      const active = noticeIsActive(item, now, start?.ms ?? null, end?.ms ?? null);
      const [kind, badge] = noticeBadge(item);
      const groups = noticeGroups(item);
      const singleChallenge = item.target?.kind === 'challenge';
      const scope = singleChallenge ? msg('1 道已确认赛题', '1 confirmed challenge') : groups.length
        ? msg(`${groups.length} 个分组`, `${groups.length} ${groups.length === 1 ? 'group' : 'groups'}`) : unknown;
      const summary = groups.length ? null : msg(item.summaryZh || item.summary, item.summary || item.summaryZh);
      const reward = noticeDetail(item.rewardZh, item.reward, /((?:\b(?:CNY|RMB|USD)\s*|[¥￥$]\s*)\d+(?:,\d{3})*(?:\.\d+)?|\d+(?:,\d{3})*(?:\.\d+)?\s*万?元)/i);
      const resources = noticeDetail(item.resourcesZh, item.resources, /(算力支持|\bcompute support\b)/i);
      return h('article', { key: item.key, className: 'pg-notice-entry' },
        h('div', { className: 'pg-notice-entry-header' },
          h('span', { className: 'pg-notice-badge', 'data-kind': kind }, badge),
          h('h3', null, msg(item.titleZh || item.title, item.title || item.titleZh)),
          active ? h('span', { className: 'pg-notice-live' }, msg('进行中', 'Ongoing')) : null),
        noticeSchedule(item, start, end, now, unknown),
        h('dl', null,
          h('div', null, h('dt', null, msg('时区', 'Time zone')), h('dd', { 'data-tone': end ? undefined : 'warning' },
            end ? zoneLabel(end.zone) : msg('时区未注明 · 剩余时间仅供参考', 'Time zone unspecified · Remaining time is approximate'))),
          h('div', null, h('dt', null, msg('奖励', 'Rewards')), h('dd', { 'data-field': 'reward' }, reward || unknown)),
          h('div', null, h('dt', null, msg('本期赛题', 'Challenges in this period')), h('dd', null, scope)),
          resources ? h('div', null, h('dt', null, msg('参赛资源', 'Resources')), h('dd', null, resources)) : null),
        groups.length ? h('ul', { className: 'pg-notice-groups', 'aria-label': msg('赛题分组', 'Challenge groups') },
          groups.map((label, index) => h('li', { key: index }, label))) : null,
        summary ? h('p', null, summary) : null,
        h('div', { className: 'pg-notice-entry-actions' },
          h('button', { type: 'button', className: 'pg-task-button pg-notice-coordinate', disabled: Boolean(readingKey), onClick: () => coordinate(item) },
            readingKey === item.key ? msg('正在读取赛题…', 'Loading challenge…') : msg('协调参赛', 'Coordinate participation'),
            h('svg', { viewBox: '0 0 14 14', 'aria-hidden': true }, h('path', { d: 'M3 7h8m0 0L7.5 3.5M11 7l-3.5 3.5' }))),
          link ? h('a', { href: link, className: 'pg-task-button', target: '_blank', rel: 'noopener noreferrer' }, msg('查看比赛', 'View competition')) : null,
          h('span', null, singleChallenge ? msg('题面可访问时，可直接选择工作区', 'If the statement is accessible, choose a workspace directly')
            : msg('先进入赛题目录选题', 'Choose a challenge in the catalog first'))));
    })),
    h('footer', { className: 'pg-task-footer' },
      h('button', { type: 'button', className: 'pg-notice-disable', onClick: () => dismiss('disable') }, msg('关闭新比赛提醒', 'Turn off competition alerts')),
      h('button', { type: 'button', className: 'pg-task-button', 'aria-describedby': hintId, onClick: () => dismiss('snooze') }, msg('明天再提醒', 'Remind me tomorrow')),
      h('button', { type: 'button', className: 'pg-task-button pg-notice-ack', 'aria-describedby': hintId, onClick: () => dismiss('acknowledge') }, msg('知道了', 'Got it')),
      h('p', { id: hintId }, msg('「明天再提醒」在北京时间次日或之后再次打开主控时，只显示本批仍有效的比赛。「知道了」仅确认本批。两者都保留新赛期提醒，可在连接设置中重新开启已关闭的提醒。',
        'Remind me tomorrow shows the still-valid entries the next time you open the controller tomorrow or later (Beijing time). Got it acknowledges this batch. Both keep future alerts on. Re-enable alerts in Connection settings.'))));
}
