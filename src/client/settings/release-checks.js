const key = ['playground', 'release-checks', 'v1'].join('.');
const day = 24 * 60 * 60 * 1000;
const retryDelay = 3 * 60 * 1000;
const channels = ['stable', 'beta'];
const supported = ['registry', 'git_pinned', 'git_unpinned', 'file'];

export function pinnedReleaseSpec(target) {
  return /^github:tjyyy3\/dsh-playground#[0-9a-f]{40}$/.test(target?.gitSpec) ? target.gitSpec : null;
}

export function isEligibleReleaseUpgrade(release) {
  return release.status === 'ready' && release.comparison === 'upgrade' && Boolean(release.target?.version)
    && !release.incomplete && !release.restartRequired && release.compatible === true
    && release.registry?.status === 'ready' && supported.includes(release.source)
    && (release.source === 'registry' || Boolean(pinnedReleaseSpec(release.target)));
}

export function createReleaseChecks(query, storage, now = Date.now) {
  let saved;
  try { saved = JSON.parse(storage()?.getItem(key)); } catch { /* Private browsing. */ }
  const records = { ...saved?.records };
  let channel = saved?.channel;
  let rateLimitUntil = Number.isFinite(saved?.rateLimitUntil) ? saved.rateLimitUntil : 0;
  let infoRetryAt = 0;
  let state = { enabled: saved?.enabled !== false, version: null };
  let active;
  const listeners = new Set();
  const publish = (version, enabled = state.enabled) => {
    if (enabled === state.enabled && version === state.version) return;
    state = { enabled, version };
    for (const listener of listeners) listener();
  };
  const save = () => {
    try { storage()?.setItem(key, JSON.stringify({ enabled: state.enabled, channel, records, rateLimitUntil })); } catch { /* Keep in memory. */ }
  };
  const identity = info => [info.channel, info.currentVersion, info.installedVersion, info.source].join('/');
  const fresh = (entry, time) => entry?.checkedAt <= time && time - entry.checkedAt < day;
  function record(result) {
    if (!channels.includes(result?.channel)) return;
    channel = result.channel;
    const time = now();
    const id = identity(result);
    const authoritative = result.status === 'ready' && !result.incomplete
      && (!result.target || result.comparison === 'current' || result.comparison === 'downgrade'
        || (result.registry?.status === 'ready' && typeof result.compatible === 'boolean'));
    if (authoritative) {
      records[channel] = { identity: id, checkedAt: time,
        version: isEligibleReleaseUpgrade(result) ? result.target.version : null };
    } else {
      const previous = records[channel];
      const resetAt = result.error === 'rate_limited' ? Date.parse(result.resetAt) : NaN;
      if (resetAt > time) rateLimitUntil = Math.max(rateLimitUntil, resetAt);
      records[channel] = { ...(previous?.identity === id && fresh(previous, time) ? previous : { identity: id }),
        retryAt: resetAt > time ? resetAt : time + retryDelay };
    }
    const entry = records[channel];
    publish(state.enabled && fresh(entry, time) ? entry.version : null);
    save();
  }
  function cancel() { active?.abort(); active = null; }
  async function check() {
    if (!state.enabled || active || infoRetryAt > now()) return;
    const controller = new AbortController();
    active = controller;
    const timer = setTimeout(() => controller.abort(), 150000);
    const aborted = new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true }));
    let info;
    try {
      info = await Promise.race([query({ action: 'releases', check: false }, controller.signal), aborted]);
      if (controller.signal.aborted) return;
      if (!channels.includes(info?.channel) || info.status === 'unavailable') { infoRetryAt = now() + retryDelay; publish(null); return; }
      if (info.restartRequired || !supported.includes(info.source)) { publish(null); return; }
      const entry = records[info.channel];
      const time = now();
      const matches = entry?.identity === identity(info);
      const cached = channel === info.channel && matches && fresh(entry, time);
      publish(cached ? entry.version : null);
      if (rateLimitUntil > time || (matches && entry.retryAt > time) || (cached && entry.retryAt === undefined)) return;
      const result = await Promise.race([query({ action: 'releases', check: true, verifyPackage: true }, controller.signal), aborted]);
      if (!controller.signal.aborted) record(channels.includes(result?.channel) ? result : info);
    } catch {
      if (active !== controller) return;
      if (info) record(info);
      else { infoRetryAt = now() + retryDelay; publish(null); }
    }
    finally { clearTimeout(timer); if (active === controller) active = null; }
  }
  return {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    check, cancel,
    setEnabled(enabled) {
      cancel();
      publish(null, enabled);
      save();
      if (enabled) void check();
    },
    checked(result) { cancel(); infoRetryAt = 0; record(result); },
    installed() { cancel(); delete records[channel]; publish(null); save(); },
  };
}
