import { webRootOf } from '../shared/web-address.js';

export function taskProvider(provider, language) {
  if (provider === 'codex') return 'Codex';
  if (provider === 'dsh') return language === 'en' ? 'DSH subagent' : 'DSH 子智能体';
  return provider;
}

export function challengeSubtitle({ id, baseUrl }, configuredBase) {
  const taskPlatform = webRootOf(baseUrl);
  const configuredPlatform = webRootOf(configuredBase);
  return taskPlatform && configuredPlatform && taskPlatform !== configuredPlatform
    ? `${id} · ${taskPlatform}` : id;
}

function asDate(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function calendarTime(value, language, now = Date.now()) {
  const date = asDate(value);
  if (!date) return null;
  const today = new Date(now);
  const time = date.toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  let label = time;
  if (date.toDateString() !== today.toDateString()) {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const prefix = language === 'en' ? 'Yesterday' : '昨天';
    label = date.toDateString() === yesterday.toDateString()
      ? `${prefix} ${time}`
      : date.toLocaleDateString(language, { year: 'numeric', month: '2-digit', day: '2-digit' });
  }
  return { dateTime: date.toISOString(), title: date.toLocaleString(language), label };
}

export function taskRowTime(row, language, now = Date.now()) {
  const stamp = calendarTime(row.createdAt, language, now);
  if (!stamp) return null;
  return { ...stamp, label: language === 'en' ? `Created ${stamp.label}` : `创建于 ${stamp.label}` };
}
