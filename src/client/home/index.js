import * as React from 'react';
import { currentLanguage, msg } from '../shared/language.js';
import { h } from '../shared/react.js';
import { ChallengeDetailDrawer } from '../catalog/detail.js';
import { competitionName, competitionStatusText, competitionValue, periodName, startingPeriod } from '../catalog/index.js';
import { challengeProgress } from '../catalog/progress.js';
import { receiptProgress } from '../tasks/attempts.js';
import { noticeScheduleDate } from '../controller/competition-notice-state.js';
import { homeCss } from './styles.js';

const HOME_REFRESH_MS = 5 * 60 * 1000;
const positiveCount = (value) => Number.isSafeInteger(value) && value > 0;
const formatHomeNumber = (value) => new Intl.NumberFormat(currentLanguage() === 'zh' ? 'zh-CN' : 'en').format(value);
const offsetTime = /[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i;

function feedText(value) {
  if (typeof value !== 'string') return '';
  // A template's content is inert. Return text only and discard non-display markup.
  const template = globalThis.document?.createElement?.('template');
  if (!template) return value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  template.innerHTML = value;
  template.content.querySelectorAll('script, style, template, noscript').forEach((node) => node.remove());
  return template.content.textContent.replace(/\s+/g, ' ').trim();
}

function relativeFeedTime(value, now) {
  if (typeof value !== 'string' || !offsetTime.test(value)) return undefined;
  const seconds = Math.round((Date.parse(value) - now) / 1000);
  if (!Number.isFinite(seconds)) return undefined;
  const format = new Intl.RelativeTimeFormat(currentLanguage() === 'zh' ? 'zh-CN' : 'en', { numeric: 'auto' });
  for (const [unit, size] of [['day', 86400], ['hour', 3600], ['minute', 60]]) {
    if (Math.abs(seconds) >= size) return format.format(Math.trunc(seconds / size), unit);
  }
  return msg('刚刚', 'Just now');
}

function deadline(schedule, now) {
  const { startAt: start, endAt: end, status } = schedule;
  const value = status === 'upcoming' ? start : end;
  if (!value) return undefined;
  const date = noticeScheduleDate(value);
  if (!date) return undefined;
  if (date.ms === null) return msg('时区未注明', 'Time zone unspecified');
  const left = date.ms - now;
  if (!Number.isFinite(left) || left <= 0) return undefined;
  const days = Math.ceil(left / 86400000);
  const hours = Math.ceil(left / 3600000);
  return status === 'upcoming'
    ? (hours < 24 ? msg('约 ' + hours + ' 小时后开始', 'Starts in ~' + hours + ' h') : msg(days + ' 天后开始', 'Starts in ' + days + ' d'))
    : (hours < 24 ? msg('约剩 ' + hours + ' 小时', '~' + hours + ' h left') : msg('剩 ' + days + ' 天', days + ' d left'));
}

function homeAction(label, onClick, primary = false, extra = {}) {
  return h('button', { ...extra, type: 'button', className: 'pg-button' + (primary ? ' pg-primary' : ''), onClick }, label);
}

function statsRow(stats) {
  const fields = [
    ['challenges', msg('开放挑战', 'Open challenges')],
    ['disciplines', msg('学科', 'Disciplines')],
    ['attempts', msg('累计尝试', 'Total attempts')],
    ['discussions', msg('讨论', 'Discussions')],
    ['knights', msg('骑士', 'Knights')],
  ];
  if (!fields.every(([name]) => positiveCount(stats?.[name]))) return null;
  return h('dl', { className: 'pg-home-stats' }, fields.map(([key, label]) =>
    h('div', { key }, h('dt', null, label), h('dd', null, formatHomeNumber(stats[key])))));
}

function readiness({ workspace, inspection, authStatus, actions }) {
  const codex = inspection?.codex;
  const agentReady = codex === 'registered' || codex === 'unavailable';
  const signedIn = authStatus === 'authenticated';
  const steps = [
    [true, msg('插件已加载', 'Plugin loaded'), msg('Playground 工作台已就绪', 'Playground Workbench is ready'),
      msg('查看版本', 'View version'), actions.versions],
    [agentReady, msg('子智能体可用', 'Subagents available'), codex === 'registered'
      ? msg('已检测到 Codex 子智能体', 'Codex subagent detected') : codex === 'unavailable'
        ? msg('可使用 DSH 子智能体', 'DSH subagents are available') : msg('选择工作区后检查', 'Select a workspace to check'),
      msg('检查子智能体', 'Check subagents'), workspace ? actions.recheck : actions.focusWorkspace],
    [Boolean(workspace), msg('选择工作区', 'Choose a workspace'),
      workspace?.title || msg('选择已有 DSH 工作区，或添加一个专用目录', 'Choose a DSH workspace or add a folder'),
      msg('选择工作区', 'Choose workspace'), actions.focusWorkspace],
    [false, msg('创建主控对话', 'Create a controller chat'),
      msg('主控会在选定工作区协调赛题工作', 'The controller coordinates challenges in your workspace'),
      msg('创建主控对话', 'Set up controller'), actions.controller],
    [signedIn, msg('登录 Playground（可选）', 'Sign in to Playground (optional)'),
      msg('查看个人提交和请求评测时需要', 'For viewing your submissions and requesting evaluation'),
      signedIn ? msg('查看账号', 'View account') : msg('用 API 令牌登录', 'Sign in with an API token'), actions.settings],
  ];
  const next = steps.findIndex(([done], index) => !done && index > 1);
  return h('div', null, h('h3', null, msg('准备就绪检查', 'Readiness check')),
    h('ol', { className: 'pg-home-readiness' }, steps.map(([done, title, detail, label, run], index) =>
      h('li', { key: index, 'data-state': done ? 'done' : index === next ? 'next' : 'todo' },
        h('span', { className: 'pg-home-step', 'aria-hidden': true }, done ? '✓' : String(index + 1).padStart(2, '0')),
        h('div', null, h('strong', null, title), h('small', null, detail)),
        h('span', { className: 'pg-home-step-status' }, done ? msg('就绪', 'Ready') : msg('待完成', 'Pending')),
        homeAction(label, run)))));
}

function myWork({ workspace, inspection, controllerId, taskRows, authStatus, latest, actions }) {
  const running = taskRows?.filter((row) => row.state === 'running').length;
  const score = latest ? receiptProgress(latest).score : undefined;
  const fact = (label, value) => h('div', null, h('dt', null, label), h('dd', null, value));
  return h('section', { className: 'pg-home-work' }, h('h2', null, msg('我的工作', 'My work')),
    controllerId
      ? h(React.Fragment, null, h('dl', { className: 'pg-home-work-facts' },
        fact(msg('工作区', 'Workspace'), workspace.title || workspace.workspaceId),
        fact(msg('主控', 'Controller'), h('span', { className: 'pg-home-ready' }, msg('已初始化', 'Initialized'))),
        taskRows && fact(msg('派出的任务', 'Dispatched tasks'),
          msg(taskRows.length + ' 个 · ' + running + ' 运行中', taskRows.length + ' tasks · ' + running + ' running')),
        latest && fact(msg('最近提交', 'Latest submission'),
          '#' + latest.id + (Number.isFinite(score) ? ' · ' + formatHomeNumber(score) : ''))),
      h('div', { className: 'pg-home-actions' }, homeAction(msg('打开主控', 'Open controller'), actions.controller),
        homeAction(msg('看提交', 'View submissions'), actions.submissions)))
      : readiness({ workspace, inspection, authStatus, actions }));
}

function competitionsSection(items, now, actions) {
  if (!items?.length) return null;
  return h('section', { className: 'pg-home-competitions' },
    h('header', { className: 'pg-home-section-head' },
      h('h2', null, msg('进行中的比赛', 'Ongoing competitions')),
      h('small', null, msg(items.length + ' 场', items.length + ' competitions')),
      homeAction(msg('查看全部 →', 'View all →'), actions.browse)),
    h('ul', { className: 'pg-home-contest-list' }, items.map((item) => {
      const period = item.periods?.find(({ slug }) => slug === startingPeriod(item));
      const schedule = period || item;
      const status = schedule.status;
      const remaining = deadline(schedule, now);
      const count = period ? period.count : item.count;
      const start = noticeScheduleDate(schedule.startAt)?.ms;
      const end = noticeScheduleDate(schedule.endAt)?.ms;
      const progress = status === 'live' && Number.isFinite(start) && Number.isFinite(end) && start < now && now < end
        ? (now - start) / (end - start) : undefined;
      return h('li', { key: item.id, className: 'pg-home-contest' },
        h('h3', null, [competitionName(item), periodName(period)].filter(Boolean).join(' · ')),
        h('div', { className: 'pg-home-contest-meta' },
          h('span', { 'data-status': status }, competitionStatusText(status)),
          remaining && h('span', null, remaining),
          positiveCount(count) && h('span', null, msg(formatHomeNumber(count) + ' 道题', formatHomeNumber(count) + ' challenges'))),
        progress !== undefined ? h('progress', { className: 'pg-home-contest-progress', value: progress, max: 1,
          'aria-label': msg('比赛时间进度', 'Competition time elapsed') }) : null,
        homeAction(msg('看赛题', 'View challenges'), () => actions.browse({ value: competitionValue(item), period: period?.slug })));
    })));
}

function latestAttempt(result, account) {
  if (!result?.ok) return undefined;
  const when = ({ createdAt }) => Date.parse(createdAt) || 0;
  return Object.values(result.byId ?? {}).flatMap(({ items }) => items ?? [])
    .filter((item) => positiveCount(item?.id) && (item.authorId == null || String(item.authorId) === String(account)))
    .reduce((latest, item) => !latest || when(item) > when(latest) || (when(item) === when(latest) && item.id > latest.id)
      ? item : latest, undefined);
}

export function HomePanel({ query, account, authStatus, workspace, inspection, controllerId, taskRows, actions, handoff, requestTask }) {
  const [snapshot, setSnapshot] = React.useState(null);
  const [attempt, setAttempt] = React.useState(null);
  const [detail, setDetail] = React.useState(null);
  const heading = React.useRef(null);
  const entries = React.useRef(new Map());

  React.useEffect(() => {
    const abort = new AbortController();
    let running = false;
    const refresh = async () => {
      if (running) return;
      running = true;
      try {
        const result = await query({ action: 'home' }, abort.signal);
        if (!abort.signal.aborted) setSnapshot(result?.ok ? result : null);
      } catch {
        if (!abort.signal.aborted) setSnapshot(null);
      } finally {
        running = false;
      }
    };
    void refresh();
    const timer = setInterval(refresh, HOME_REFRESH_MS);
    return () => { clearInterval(timer); abort.abort(); };
  }, [query]);

  React.useEffect(() => {
    setAttempt(null);
    if (!controllerId || authStatus !== 'authenticated' || account == null) return;
    const abort = new AbortController();
    void Promise.resolve().then(() => query({ action: 'my_attempts_summary' }, abort.signal)).then((result) => {
      if (!abort.signal.aborted) setAttempt({ account, value: latestAttempt(result, account) });
    }).catch(() => {});
    return () => abort.abort();
  }, [query, controllerId, authStatus, account]);

  const now = Date.now();
  const feed = snapshot?.feed?.slice(0, 8).map((item) => ({ ...item, text: feedText(item.text) })).filter((item) => item.text);
  const challenges = snapshot?.challenges?.slice(0, 6);
  return h('main', { className: 'pg-home', 'aria-label': msg('Playground 首页', 'Playground home') },
    h('style', null, homeCss),
    h('div', { className: 'pg-home-top' },
      h('section', { className: 'pg-home-hero' },
        h('p', { className: 'pg-home-kicker' }, msg('OPEN AGENTIC SCIENCE PLATFORM', 'OPEN AGENTIC SCIENCE PLATFORM')),
        h('h1', { tabIndex: -1, ref: heading }, msg('从一道题直击科研现场', 'Start with a real research challenge')),
        h('p', { className: 'pg-home-tagline' }, msg('碳基硅基各显本领。', 'A place for people and agents to do science.')),
        h('div', { className: 'pg-home-actions' }, homeAction(msg('浏览赛题', 'Browse challenges'), () => actions.browse(), true),
          homeAction(controllerId ? msg('继续主控对话', 'Continue controller chat') : msg('创建主控', 'Set up a controller'), actions.controller)),
        statsRow(snapshot?.stats)),
      myWork({ workspace, inspection, controllerId, taskRows, authStatus,
        latest: authStatus === 'authenticated' && attempt?.account === account ? attempt?.value : undefined, actions })),
    competitionsSection(snapshot?.competitions, now, actions),
    challenges?.length || feed?.length ? h('div', { className: 'pg-home-lists' },
      challenges?.length ? h('section', null, h('h2', null, msg('最新挑战', 'Latest challenges')),
        h('ul', { className: 'pg-home-latest' }, challenges.map((item) => {
          const title = msg(item.titleZh || item.title, item.title || item.titleZh) || item.id;
          return h('li', { key: item.id }, h('button', { type: 'button', 'aria-haspopup': 'dialog',
            ref: (node) => { if (node) entries.current.set(item.id, node); else entries.current.delete(item.id); },
            onClick: () => setDetail(item) }, title),
          positiveCount(item.attempts) ? h('span', null, msg(formatHomeNumber(item.attempts) + ' 次', formatHomeNumber(item.attempts) + ' attempts')) : null);
        }))) : null,
      feed?.length ? h('section', null, h('h2', null, msg('实时动态', 'Live activity')),
        h('ul', { className: 'pg-home-feed' }, feed.map((item, index) => {
          const when = relativeFeedTime(item.time, now);
          return h('li', { key: index }, h('span', null, item.text),
            when ? h('time', { dateTime: item.time }, when) : null);
        }))) : null) : null,
    detail ? h(ChallengeDetailDrawer, { key: detail.id, challenge: detail, query, handoff, requestTask,
      progress: challengeProgress(detail.id, taskRows, [], undefined, undefined, account),
      close: () => setDetail(null), focusFallback: () => [entries.current.get(detail.id), heading.current] }) : null);
}
