const key = ['playground', 'release-checks', 'v1'].join('.');
const day = 24 * 60 * 60 * 1000;
const supported = ['registry', 'git_pinned', 'git_unpinned', 'file'];

// The browser stores the check time and badge only. The Host resolves the install target again on click.
export function createReleaseChecks(query, storage, now = Date.now) {
  let saved;
  try { saved = JSON.parse(storage()?.getItem(key)); } catch { /* Private browsing. */ }
  const records = { ...saved?.records };
  let channel = saved?.channel;
  let state = { enabled: saved?.enabled !== false, version: null };
  let active;
  const listeners = new Set();
  const publish = (version, enabled = state.enabled) => {
    if (enabled === state.enabled && version === state.version) return;
    state = { enabled, version };
    for (const listener of listeners) listener();
  };
  const save = () => {
    try { storage()?.setItem(key, JSON.stringify({ enabled: state.enabled, channel, records })); } catch { /* Keep in memory. */ }
  };
  const identity = info => [info.channel, info.currentVersion, info.installedVersion, info.source].join('/');
  function record(result) {
    if (!['stable', 'beta'].includes(result?.channel)) return;
    channel = result.channel;
    const ready = result.status === 'ready' && result.registry?.status === 'ready' && result.compatible === true
      && result.comparison === 'upgrade' && !result.incomplete && !result.restartRequired
      && (result.source === 'registry' || Boolean(result.target?.gitSpec));
    const version = ready ? result.target?.version : null;
    records[channel] = { identity: identity(result), at: now(), version };
    publish(state.enabled ? version : null);
    save();
  }
  function cancel() { active?.abort(); active = null; }
  async function check() {
    if (!state.enabled || active) return;
    const controller = new AbortController();
    active = controller;
    const timer = setTimeout(() => controller.abort(), 150000);
    try {
      const info = await query({ action: 'releases', check: false }, controller.signal);
      if (controller.signal.aborted || !['stable', 'beta'].includes(info?.channel)) return;
      const entry = records[info.channel];
      if (info.restartRequired || !supported.includes(info.source)) { publish(null); return; }
      if (channel === info.channel && entry?.identity === identity(info) && entry.at <= now() && now() - entry.at < day) {
        publish(typeof entry.version === 'string' ? entry.version : null);
        return;
      }
      record(info);
      const result = await query({ action: 'releases', check: true, verifyPackage: true }, controller.signal);
      if (!controller.signal.aborted) record(result);
    } catch { /* Background failures stay out of the controller. Manual checks show errors. */ }
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
    checked(result) { cancel(); record(result); },
    installed() { cancel(); delete records[channel]; publish(null); save(); },
  };
}
