import { readFileSync } from 'node:fs';

const repository = 'tjyyy3/dsh-playground';
const releasesApi = `https://api.github.com/repos/${repository}/releases`;
const releasesPage = `https://github.com/${repository}/releases`;
const pageSize = 50;
const maxPages = 5;
const maxPageBytes = 2 * 1024 * 1024;
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

const { version: currentVersion } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const runningVersion = parseVersion(currentVersion);
if (!runningVersion) throw new Error('Invalid plugin version in package.json');
const currentChannel = runningVersion.prerelease.length > 0 ? 'beta' : 'stable';

function compareVersions(left, right) {
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
  if (prerelease !== release.prerelease || (channel === 'stable' && prerelease)) return null;

  const assetName = `playground-dsh-playground-${version}.tgz`;
  const downloadUrl = `${releasesPage}/download/${tag}/${assetName}`;
  const downloadable = Array.isArray(release.assets) && release.assets.some((asset) =>
    asset?.name === assetName && asset.state === 'uploaded' && typeof asset.browser_download_url === 'string' &&
    asset.browser_download_url.replaceAll('%2B', '+') === downloadUrl);
  return { parsed, target: { version, prerelease, notesUrl: `${releasesPage}/tag/${tag}`, downloadUrl: downloadable ? downloadUrl : null } };
}

async function readReleasePage(response) {
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error('Release list request failed');
  }
  const decoder = new TextDecoder();
  let size = 0;
  let body = '';
  for await (const chunk of response.body ?? []) {
    size += chunk.byteLength;
    if (size > maxPageBytes) throw new Error('Release list exceeded the response limit');
    body += decoder.decode(chunk, { stream: true });
  }
  const releases = JSON.parse(body + decoder.decode());
  if (!Array.isArray(releases)) throw new Error('Invalid release list');
  return releases;
}

export async function queryReleases({ channel, check }, { signal, fetchImpl = globalThis.fetch, timeoutMs = 5000 } = {}) {
  const versionInfo = { currentVersion, currentChannel, channel, target: null, comparison: null };
  if (!check) return { ...versionInfo, status: 'unchecked' };

  const unavailable = (error) => ({ ...versionInfo, status: 'unavailable', error });
  const timeout = AbortSignal.timeout(timeoutMs);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let latest = null;
  try {
    for (let page = 1; page <= maxPages; page += 1) {
      requestSignal.throwIfAborted();
      const response = await fetchImpl(`${releasesApi}?per_page=${pageSize}&page=${page}`, {
        headers: { accept: 'application/vnd.github+json' }, redirect: 'error', signal: requestSignal,
      });
      const releases = await readReleasePage(response);
      requestSignal.throwIfAborted();
      for (const release of releases) {
        const candidate = releaseCandidate(release, channel);
        if (candidate && (!latest || compareVersions(candidate.parsed, latest.parsed) > 0)) latest = candidate;
      }
      // GitHub signals another page with Link. Keep building URLs against the fixed repository endpoint.
      if (!/<[^>]*>;\s*rel="next"/i.test(response.headers.get('link') ?? '')) {
        if (!latest) return { ...versionInfo, status: 'ready' };
        const order = compareVersions(latest.parsed, runningVersion);
        const comparison = order > 0 ? 'upgrade' : order < 0 ? 'downgrade' : 'current';
        return { ...versionInfo, status: 'ready', target: latest.target, comparison };
      }
    }
    return unavailable('release_list_incomplete');
  } catch {
    signal?.throwIfAborted();
    return unavailable(timeout.aborted ? 'release_check_timeout' : 'release_check_failed');
  }
}
