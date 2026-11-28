// enterNotices returns { state, items, activityByKey, batchIds, scope, status, kind }.
// Pass that view and the latest saved state to actOnNotices. kind is overview, new or reminder.
const version = 2;
const day = 86_400_000;
const beijingOffset = 8 * 3_600_000;
const activeStatuses = new Set(['active', 'open', 'in_progress']);
const endedStatuses = new Set(['ended', 'closed', 'completed', 'finished', 'expired', 'cancelled', 'canceled', 'archived']);
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isStringArray = (value) => Array.isArray(value) && value.every((entry) => typeof entry === 'string');
const unique = (values) => [...new Set(values)];
const emptySite = () => ({ initializedSources: [], discovered: [], acknowledged: [], pending: [] });

export function noticeScheduleDate(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4}-\d\d-\d\d)(?:[T ](\d\d:\d\d(?::\d\d(?:\.\d+)?)?)(?:\s*(Z|[+-]\d\d:?\d\d))?)?$/i.exec(value.trim());
  if (!match) return null;
  const [, date, time, zone] = match;
  const calendarDay = new Date(date + 'T00:00:00Z');
  if (!Number.isFinite(calendarDay.getTime()) || calendarDay.toISOString().slice(0, 10) !== date) return null;
  if (!time) return { date, time, zone, ms: null };
  const ms = Date.parse(date + 'T' + time + (zone ?? 'Z'));
  return Number.isFinite(ms) ? { date, time, zone, ms: zone ? ms : null } : null;
}

const timestamp = (value) => noticeScheduleDate(value)?.ms ?? null;

export function noticeIsActive(item, now, start, end) {
  const status = String(item.officialStatus ?? item.status ?? '').trim().toLowerCase();
  return !endedStatuses.has(status) && (end === null || now < end) &&
    (activeStatuses.has(status) || (start !== null && start <= now && end !== null));
}

function clockTime(value) {
  const ms = typeof value === 'number' ? value : value instanceof Date ? value.getTime() : timestamp(value);
  if (!Number.isFinite(ms)) throw new TypeError('Pass an explicit time to the notice state.');
  return ms;
}

function validSite(site) {
  return isObject(site) && isStringArray(site.initializedSources) && isStringArray(site.discovered) &&
    (site.unverified === undefined || isStringArray(site.unverified)) &&
    isStringArray(site.acknowledged) && Array.isArray(site.pending) && site.pending.every((batch) =>
      Number.isSafeInteger(batch?.id) && (batch.kind === 'overview' || batch.kind === 'new') && (batch.dueAt === null || Number.isFinite(batch.dueAt)) &&
      Array.isArray(batch.entries) && batch.entries.every((entry) =>
        typeof entry?.key === 'string' && isStringArray(entry.sources) &&
        (entry.endAt === null || Number.isFinite(entry.endAt))));
}

export function createNoticeState(saved = null) {
  if (saved?.version === version && typeof saved.enabled === 'boolean' &&
      ['first', 'silent'].includes(saved.baseline) && Number.isSafeInteger(saved.nextBatchId) &&
      isObject(saved.sites) && Object.values(saved.sites).every(validSite)) return saved;

  const legacy = typeof saved?.enabled === 'boolean' && isObject(saved.seen) &&
    Object.values(saved.seen).every((site) => isStringArray(site?.sources) && isStringArray(site?.keys));
  return {
    version,
    enabled: legacy ? saved.enabled : true,
    baseline: legacy ? 'silent' : 'first',
    nextBatchId: 1,
    sites: legacy ? Object.fromEntries(Object.entries(saved.seen).map(([scope, site]) => [scope, {
      ...emptySite(),
      initializedSources: unique(site.sources),
      // v1 recorded discovery at load, so its keys cannot establish acknowledgement.
      discovered: unique(site.keys),
    }])) : {},
  };
}

function collectItems(items, sources, now) {
  const byKey = new Map();
  for (const item of items) {
    if (typeof item?.key !== 'string' || !item.key || !sources.has(item.source)) continue;
    const status = String(item.officialStatus ?? item.status ?? '').trim().toLowerCase();
    const start = timestamp(item.startAt);
    const end = timestamp(item.endAt);
    const ended = endedStatuses.has(status) || (end !== null && end <= now);
    const active = noticeIsActive(item, now, start, end);
    const upcoming = start !== null && start > now;
    const schedule = { item, start, end };
    const prior = byKey.get(item.key);
    if (!prior) {
      byKey.set(item.key, { item, sources: [item.source], schedules: [schedule], endAt: end, ended, active, upcoming });
      continue;
    }
    prior.sources.push(item.source);
    prior.schedules.push(schedule);
    prior.ended ||= ended;
    prior.active ||= active;
    prior.upcoming ||= upcoming;
    if (end !== null && (prior.endAt === null || end < prior.endAt)) {
      prior.item = item;
      prior.endAt = end;
    }
  }
  return byKey;
}

export function enterNotices(state, snapshot, time) {
  const now = clockTime(time);
  const scope = typeof snapshot?.scope === 'string' ? snapshot.scope : '';
  const view = { state, scope, status: 'ready', kind: 'new', items: [], batchIds: [] };
  if (!state.enabled) return { ...view, status: 'disabled' };
  if (!scope || snapshot?.ok !== true || !isStringArray(snapshot?.sources) || !snapshot.sources.length ||
      !Array.isArray(snapshot.items)) return { ...view, status: 'error' };

  const sources = new Set(snapshot.sources);
  const current = collectItems(snapshot.items, sources, now);
  const site = Object.hasOwn(state.sites, scope) ? state.sites[scope] : emptySite();
  const known = new Set(site.discovered);
  const initialized = new Set(site.initializedSources);
  const unverified = new Set(site.unverified);
  const firstEntries = [];
  const newEntries = [];
  for (const [key, record] of current) {
    const newSource = record.sources.some((source) => !initialized.has(source));
    if (record.ended) {
      unverified.delete(key);
      continue;
    }
    if (known.has(key)) {
      // A newly available source can complete an inconclusive first-use snapshot.
      if (unverified.has(key) && newSource && record.active) {
        firstEntries.push({ key, sources: unique(record.sources), endAt: record.endAt });
        unverified.delete(key);
      } else if (record.upcoming) unverified.delete(key);
      continue;
    }
    const existingSource = record.sources.some((source) => initialized.has(source));
    if (existingSource || (state.baseline === 'first' && record.active)) {
      (existingSource ? newEntries : firstEntries).push({ key, sources: unique(record.sources), endAt: record.endAt });
    } else if (state.baseline === 'first' && !record.upcoming) unverified.add(key);
  }

  const pending = [];
  for (const batch of site.pending) {
    const remaining = batch.entries.flatMap((entry) => {
      const record = current.get(entry.key);
      if (!record) {
        const sourceUnavailable = entry.sources.some((source) => !sources.has(source));
        const unexpired = entry.endAt === null || entry.endAt > now;
        return sourceUnavailable && unexpired ? [entry] : [];
      }
      const endAt = record.endAt ?? entry.endAt;
      if (record.ended || (endAt !== null && endAt <= now)) return [];
      return [{ key: entry.key, sources: unique([...entry.sources, ...record.sources]), endAt }];
    });
    if (remaining.length) pending.push({ ...batch, entries: remaining });
  }
  // A newly published contest and its rounds share a single alert listing its rounds.
  const parents = new Set(newEntries.map(entry => current.get(entry.key).item.parentKey).filter(Boolean));
  let nextBatchId = state.nextBatchId;
  for (const [kind, entries] of [['overview', firstEntries], ['new', newEntries.filter(entry => !parents.has(entry.key))]]) {
    if (entries.length) pending.push({ id: nextBatchId++, kind, dueAt: null, entries });
  }

  const visible = [];
  const kinds = new Set();
  for (const batch of pending) {
    if (batch.dueAt !== null && batch.dueAt > now) continue;
    const available = batch.entries.filter((entry) => current.has(entry.key));
    if (!available.length) continue;
    view.batchIds.push(batch.id);
    kinds.add(batch.dueAt === null ? batch.kind : 'reminder');
    visible.push(...available);
  }
  visible.sort((left, right) => (left.endAt ?? Infinity) - (right.endAt ?? Infinity) ||
    (left.key < right.key ? -1 : Number(left.key > right.key)));
  return {
    ...view,
    kind: kinds.size > 1 ? 'reminder' : ([...kinds][0] ?? 'new'),
    items: visible.map(({ key }) => current.get(key).item),
    activityByKey: new Map(visible.map(({ key }) => [key, current.get(key).schedules])),
    state: {
      ...state,
      nextBatchId,
      sites: { ...state.sites, [scope]: {
        ...site,
        initializedSources: unique([...initialized, ...sources]),
        discovered: unique([...known, ...current.keys()]),
        unverified: [...unverified],
        pending,
      } },
    },
  };
}

export function actOnNotices(state, view, action, time) {
  if (action === 'enable' || action === 'disable') {
    const enabled = action === 'enable';
    if (enabled === state.enabled) return state;
    const sites = Object.fromEntries(Object.entries(state.sites).map(([scope, site]) => [scope, {
      ...site, initializedSources: [], unverified: [], pending: [],
    }]));
    return { ...state, enabled, baseline: 'silent', sites };
  }
  if ((action !== 'snooze' && action !== 'acknowledge') || !state.enabled || view?.status !== 'ready' ||
      !Object.hasOwn(state.sites, view.scope)) return state;

  const site = state.sites[view.scope];
  const batchIds = new Set(view.batchIds);
  const keys = new Set(view.items.map((item) => item.key));
  const actedOn = [];
  const pending = [];
  for (const batch of site.pending) {
    if (!batchIds.has(batch.id)) {
      pending.push(batch);
      continue;
    }
    const remaining = [];
    for (const entry of batch.entries) {
      if (keys.has(entry.key)) actedOn.push(entry);
      else remaining.push(entry);
    }
    if (remaining.length) pending.push({ ...batch, entries: remaining });
  }
  if (!actedOn.length) return state;

  const snooze = action === 'snooze';
  if (snooze) {
    const now = clockTime(time);
    const dueAt = (Math.floor((now + beijingOffset) / day) + 1) * day - beijingOffset;
    pending.push({ id: state.nextBatchId, kind: 'new', dueAt, entries: actedOn });
  }
  const acknowledged = snooze ? site.acknowledged : unique([...site.acknowledged, ...actedOn.map(({ key }) => key)]);
  return {
    ...state,
    nextBatchId: state.nextBatchId + Number(snooze),
    sites: { ...state.sites, [view.scope]: { ...site, acknowledged, pending } },
  };
}
