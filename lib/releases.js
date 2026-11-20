import { readFileSync } from 'node:fs';
import { readBoundedResponse } from './api.js';

const repository = 'tjyyy3/dsh-playground';
const releasesApi = `https://api.github.com/repos/${repository}/releases`;
const releasesPage = `https://github.com/${repository}/releases`;
const pageSize = 50;
const maxPages = 5;
const cacheMs = 3 * 60 * 1000;
const numeric = /^(?:0|[1-9][0-9]*)$/;
const versionPattern = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export function parseVersion(version) {
  if (typeof version !== 'string' || version.length > 256) return null;
  const match = versionPattern.exec(version);
  if (match?.[0] !== version) return null;
  const prerelease = match[4]?.split('.') ?? [];
  if (prerelease.some((identifier) => /^[0-9]+$/.test(identifier) && !numeric.test(identifier))) return null;
  return {
    core: match.slice(1, 4).map((identifier) => BigInt(identifier)),
    prerelease: prerelease.map((identifier) => numeric.test(identifier) ? BigInt(identifier) : identifier),
  };
}

export function compareVersions(left, right) {
  for (const [i, identifier] of left.core.entries()) {
    if (identifier !== right.core[i]) return identifier > right.core[i] ? 1 : -1;
  }
  const leftIds = left.prerelease;
  const rightIds = right.prerelease;
  if (leftIds.length === 0 || rightIds.length === 0) return Math.sign(rightIds.length - leftIds.length);
  for (let i = 0; i < Math.min(leftIds.length, rightIds.length); i += 1) {
    const a = leftIds[i];
    const b = rightIds[i];
    if (a === b) continue;
    if (typeof a !== typeof b) return typeof a === 'bigint' ? -1 : 1;
    return a > b ? 1 : -1;
  }
  return Math.sign(leftIds.length - rightIds.length);
}

function releaseCandidate(release, channel) {
  if (release?.draft !== false || typeof release.tag_name !== 'string') return null;
  const tag = release.tag_name;
  const version = tag.startsWith('v') ? tag.slice(1) : tag;
  const parsed = parseVersion(version);
  if (!parsed) return null;
  const prerelease = parsed.prerelease.length > 0;
  if (prerelease !== release.prerelease) return { warning: 'prerelease_mismatch' };
  if (channel === 'stable' && prerelease) return null;

  // Only the published Release can supply the install commit, never a mutable tag ref.
  const commits = [...(typeof release.body === 'string' ? release.body : '').matchAll(/^Commit: ([0-9a-f]{40})\r?$/gm)];
  const commit = commits.length === 1 ? commits[0][1] : null;
  const gitSpec = commit ? `github:${repository}#${commit}` : null;
  return { parsed, target: { version, prerelease, notesUrl: `${releasesPage}/tag/${tag}`, commit, gitSpec } };
}

export function classifyInstallSource(bundle) {
  if (bundle?.update === 'registry') return 'registry';
  if (bundle?.update === 'git') return 'git_pinned';
  const prefix = '@playground/dsh-playground@';
  const source = typeof bundle?.source === 'string' ? bundle.source.trim() : '';
  const spec = source.startsWith(prefix) ? source.slice(prefix.length) : source;
  if (/^link:/i.test(spec)) return 'link';
  if (/^file:|^(?:\/|[a-z]:[\\/]|\\\\|\.{1,2}[\\/])/i.test(spec)) return 'file';
  if (/^(?:github|gitlab|bitbucket|gist):|^git(?:\+[a-z]+)?:\/\/|^git@[^:]+:|^https?:\/\/(?:www\.)?(?:github\.com|gitlab\.com|bitbucket\.org)\/[^/]+\/[^/#]+(?:\.git)?(?:#.*)?$/i.test(spec)) {
    return /#[0-9a-f]{40}(?:&path:[^&]+)?$/i.test(spec) ? 'git_pinned' : 'git_unpinned';
  }
  if (/^https?:\/\//i.test(spec)) return 'file';
  if (spec && /^(?:[~^>=<*\d]|latest$|beta$|next$)/.test(spec)) return 'registry';
  return 'unknown';
}

const sourceHints = {
  registry: '通过软件包仓库安装。由 DSH 插件管理器检查兼容版本并更新。',
  git_pinned: '通过固定 commit 的 Git spec 安装。将发布版本的 Git spec 交给 DSH 插件管理器更新；目标必须来自同一仓库和目录。',
  git_unpinned: '当前 Git spec 未固定完整 commit，DSH 无法更新该来源。检查发布版本后复制固定 Git spec，填入 DSH 第三方插件安装框覆盖安装当前副本，可能提示重启。仅当返回 already-installed 时才移除后重新安装。',
  link: '当前为本地链接开发版。请在链接目录更新代码，再按 DSH 提示重新加载或重启。',
  file: '当前为本地文件或压缩包安装，DSH 无法更新该来源。请从 GitHub Release 页面复制固定 Git spec，填入 DSH 第三方插件安装框覆盖安装，可能提示重启。仅当返回 already-installed 时才移除后重新安装。',
  unknown: '无法确认安装来源。请在 DSH 插件管理器核对来源后选择安装或更新方式。',
};

function manifestVersion() {
  try {
    const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    return parseVersion(version) ? version : null;
  } catch { return null; }
}

export function createReleaseQuery({ channel = 'stable', pluginManager = () => undefined,
  readVersion = manifestVersion, fetchImpl = globalThis.fetch, timeoutMs = 20000, now = Date.now } = {}) {
  const currentVersion = readVersion();
  const runningVersion = parseVersion(currentVersion);
  const cache = new Map();
  let rateLimit = null;

  return async function query({ check }, { signal } = {}) {
    signal?.throwIfAborted();
    const installedVersion = readVersion();
    const disk = parseVersion(installedVersion);
    let source = 'unknown';
    try {
      const manager = pluginManager();
      const bundles = await manager?.listBundles?.();
      source = classifyInstallSource(bundles?.find((bundle) => bundle?.name === '@playground/dsh-playground'));
    } catch { /* The host service can be absent during startup or shutdown. */ }
    const versionInfo = { currentVersion, currentChannel: runningVersion?.prerelease.length ? 'beta' : 'stable',
      installedVersion, restartRequired: Boolean(disk && runningVersion && compareVersions(disk, runningVersion) > 0),
      source, sourceHint: sourceHints[source], channel, target: null, comparison: null };
    const unavailable = (error, fields = {}) => ({ ...versionInfo, status: 'unavailable', error, ...fields });
    if (!runningVersion || !disk) return unavailable('version_unavailable');
    if (!check) return { ...versionInfo, status: 'unchecked' };
    if (rateLimit && rateLimit.until > now()) return unavailable('rate_limited', { resetAt: rateLimit.resetAt });
    const cached = cache.get(channel);
    if (cached && cached.until > now()) return { ...versionInfo, ...cached.value };
    let timeout;
    let latest = null;
    const warnings = new Set();
    const ready = (incomplete = false) => ({ status: 'ready', target: latest?.target ?? null, incomplete, warnings: [...warnings],
      comparison: latest ? ['downgrade', 'current', 'upgrade'][compareVersions(latest.parsed, runningVersion) + 1] : null });
    try {
      for (let page = 1; page <= maxPages; page += 1) {
        timeout = AbortSignal.timeout(timeoutMs);
        const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
        requestSignal.throwIfAborted();
        const response = await fetchImpl(`${releasesApi}?per_page=${pageSize}&page=${page}`, {
          headers: { accept: 'application/vnd.github+json' }, redirect: 'error', signal: requestSignal,
        });
        if (!response.ok) {
          await response.body?.cancel();
          if ([403, 429].includes(response.status) && response.headers.get('x-ratelimit-remaining') === '0') {
            const reset = Number(response.headers.get('x-ratelimit-reset')) * 1000;
            const until = Number.isFinite(reset) && reset > now() ? reset : now() + cacheMs;
            rateLimit = { until, resetAt: new Date(until).toISOString() };
            return unavailable('rate_limited', { resetAt: rateLimit.resetAt });
          }
          throw new Error('Release list request failed');
        }
        const releases = JSON.parse(await readBoundedResponse(response));
        if (!Array.isArray(releases)) throw new Error('Invalid release list');
        requestSignal.throwIfAborted();
        for (const release of releases) {
          const candidate = releaseCandidate(release, channel);
          if (candidate?.warning) { warnings.add(candidate.warning); continue; }
          if (candidate && (!latest || compareVersions(candidate.parsed, latest.parsed) > 0)) latest = candidate;
        }
        if (!/<[^>]*>;\s*rel="next"/i.test(response.headers.get('link') ?? '')) {
          const value = ready();
          cache.set(channel, { until: now() + cacheMs, value });
          return { ...versionInfo, ...value };
        }
      }
      const value = latest ? ready(true) : { status: 'unavailable', error: 'incomplete' };
      if (value.status === 'ready') cache.set(channel, { until: now() + cacheMs, value });
      return { ...versionInfo, ...value };
    } catch {
      signal?.throwIfAborted();
      return unavailable(timeout?.aborted ? 'timeout' : 'failed');
    }
  };
}

let defaultQuery;
export function queryReleases(input, exec) {
  defaultQuery ??= createReleaseQuery();
  return defaultQuery(input, exec);
}
