import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { queryReleases } from '../lib/releases.js';

const repository = 'https://github.com/tjyyy3/dsh-playground/releases';
const api = 'https://api.github.com/repos/tjyyy3/dsh-playground/releases';
const { version: currentVersion } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const currentChannel = currentVersion.split('+')[0].includes('-') ? 'beta' : 'stable';

function release(version, options = {}) {
  const tag = `v${version}`;
  const name = `playground-dsh-playground-${version}.tgz`;
  return { tag_name: tag, draft: false, prerelease: version.split('+')[0].includes('-'),
    assets: [{ name, state: 'uploaded', browser_download_url: `${repository}/download/${tag}/${name}` }], ...options };
}

const check = (channel, releases) => queryReleases({ channel, check: true }, { fetchImpl: async () => Response.json(releases) });

test('the unchecked status reports the running package version and makes no request', async () => {
  const channel = currentChannel === 'beta' ? 'stable' : 'beta';
  const result = await queryReleases({ channel, check: false }, { fetchImpl: () => assert.fail('unexpected release request') });
  assert.deepEqual(result, { currentVersion, currentChannel, channel, status: 'unchecked', target: null, comparison: null });
});

test('stable excludes prereleases, and beta selects the greatest SemVer across stable and prereleases', async () => {
  const releases = [release('3.9.0'), release('3.10.0'), release('3.11.0-preview.2'), release('3.11.0-preview.10'),
    release('99.0.0', { draft: true }), release('98.0.0-beta', { prerelease: false }), release('97.0.0', { prerelease: true }),
    release('096.0.0'), release('95.0.0-beta.01'), release('94.0.0\n'), release('93.0.0/../2.0.0'),
    release('92.0.0-'), release('91.0.0', { draft: undefined }), null];

  const stable = await check('stable', releases);
  assert.equal(stable.status, 'ready');
  assert.deepEqual(stable.target, { version: '3.10.0', prerelease: false, notesUrl: `${repository}/tag/v3.10.0`,
    downloadUrl: `${repository}/download/v3.10.0/playground-dsh-playground-3.10.0.tgz` });
  const beta = await check('beta', releases);
  assert.equal(beta.status, 'ready');
  assert.equal(beta.target.version, '3.11.0-preview.10');
  assert.equal(beta.target.prerelease, true);
  const stabilized = await check('beta', [...releases, release('3.11.0')]);
  assert.equal(stabilized.target.version, '3.11.0');
  assert.equal(stabilized.target.prerelease, false);
});

test('prerelease ordering handles ASCII, numeric identifiers, and identifier length', async () => {
  const versions = ['3.0.0-1', '3.0.0-a', '3.0.0-alpha', '3.0.0-alpha.2', '3.0.0-alpha.10', '3.0.0-alpha.z'];
  for (const [earlier, later] of versions.slice(1).map((version, i) => [versions[i], version])) {
    assert.equal((await check('beta', [release(earlier), release(later)])).target.version, later);
  }
  assert.equal((await check('beta', [release('3.0.0-alpha.9007199254740992'), release('3.0.0-alpha.9007199254740993')])).target.version,
    '3.0.0-alpha.9007199254740993');
});

test('the target comparison uses the running version and ignores build metadata', async () => {
  const channel = 'beta';
  const later = `${BigInt(currentVersion.split('.')[0]) + 1n}.0.0`;
  assert.equal((await check(channel, [release(later)])).comparison, 'upgrade');
  assert.equal((await check(channel, [release(currentVersion)])).comparison, 'current');
  const samePrecedence = `${currentVersion.split('+')[0]}+rebuild`;
  assert.equal((await check(channel, [release(samePrecedence)])).comparison, 'current');
  assert.equal((await check(channel, [release('0.0.0-alpha')])).comparison, 'downgrade');
});

test('only the expected uploaded package from the tagged release gets a download URL', async () => {
  const raw = release('5.0.0');
  const [asset] = raw.assets;
  const old = release('4.0.0');
  const forged = [
    { ...asset, name: 'other.tgz' },
    { ...asset, state: 'starter' },
    { ...asset, browser_download_url: asset.browser_download_url.replace('https:', 'http:') },
    { ...asset, browser_download_url: asset.browser_download_url.replace('github.com', 'other.test') },
    { ...asset, browser_download_url: asset.browser_download_url.replace('tjyyy3', 'someone-else') },
    { ...asset, browser_download_url: asset.browser_download_url.replace('v5.0.0', 'v4.0.0') },
    { ...asset, browser_download_url: `${asset.browser_download_url}?extra=1` },
  ];
  const result = await check('stable', [{ ...raw, html_url: 'https://other.test', assets: forged }, old]);
  assert.deepEqual(result.target, { version: '5.0.0', prerelease: false, notesUrl: `${repository}/tag/v5.0.0`, downloadUrl: null });
  const bareTag = { ...raw, tag_name: '5.0.0', assets: [{ ...asset, browser_download_url: asset.browser_download_url.replace('v5.0.0', '5.0.0') }] };
  assert.equal((await check('stable', [bareTag])).target.downloadUrl, bareTag.assets[0].browser_download_url);
});

test('pagination requests only the configured public repository and compares versions across pages', async () => {
  const calls = [];
  const result = await queryReleases({ channel: 'stable', check: true }, {
    fetchImpl: async (url, init) => {
      calls.push(url);
      assert.equal(new URL(url).origin, new URL(api).origin);
      assert.equal(new URL(url).pathname, new URL(api).pathname);
      assert.equal(new Headers(init.headers).has('authorization'), false);
      assert.equal(init.redirect, 'error');
      if (calls.length === 1) return Response.json([release('1.0.0')], {
        headers: { link: '<https://unrelated.test/>; rel="next"' },
      });
      return Response.json([release('2.0.0')]);
    },
  });
  assert.deepEqual(calls, [`${api}?per_page=50&page=1`, `${api}?per_page=50&page=2`]);
  assert.equal(result.target.version, '2.0.0');
});

test('checks distinguish empty releases, failures and incomplete pagination', async () => {
  for (const releases of [[], [release('2.0.0-beta')]]) {
    const result = await check('stable', releases);
    assert.deepEqual(result, { currentVersion, currentChannel, channel: 'stable', status: 'ready', target: null, comparison: null });
  }
  for (const fetchImpl of [
    async () => { throw new Error('private proxy details'); },
    async () => new Response('private proxy details', { status: 429 }),
    async () => new Response('not-json'),
    async () => Response.json({ message: 'unexpected envelope' }),
  ]) {
    const result = await queryReleases({ channel: 'stable', check: true }, { fetchImpl });
    assert.deepEqual(result, { currentVersion, currentChannel, channel: 'stable', status: 'unavailable', target: null,
      comparison: null, error: 'release_check_failed' });
  }
  let pages = 0;
  const result = await queryReleases({ channel: 'stable', check: true }, {
    fetchImpl: async () => {
      assert.ok(++pages <= 5, 'pagination must stop');
      return Response.json([release('3.0.0')], { headers: { link: '<https://unrelated.test/>; rel="next"' } });
    },
  });
  assert.equal(pages, 5);
  assert.equal(result.status, 'unavailable');
  assert.equal(result.target, null);
  assert.equal(result.error, 'release_list_incomplete');
});

test('a release response exceeding the byte limit is cancelled', async () => {
  let cancelled = false;
  const result = await queryReleases({ channel: 'stable', check: true }, {
    fetchImpl: async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1)); },
      cancel() { cancelled = true; },
    })),
  });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.error, 'release_check_failed');
  assert.equal(cancelled, true);
});

test('the timeout also covers reading the release response body', async () => {
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    const result = await queryReleases({ channel: 'stable', check: true }, {
      timeoutMs: 20,
      fetchImpl: async (_url, { signal }) => new Response(new ReadableStream({
        start(controller) { signal.addEventListener('abort', () => controller.error(signal.reason), { once: true }); },
      })),
    });
    assert.equal(result.status, 'unavailable');
    assert.equal(result.error, 'release_check_timeout');
  } finally {
    clearTimeout(keepAlive);
  }
});

test('the caller can cancel a release check', async () => {
  const controller = new AbortController();
  const reason = new Error('workbench closed');
  await assert.rejects(queryReleases({ channel: 'beta', check: true }, {
    signal: controller.signal,
    fetchImpl: async (_url, { signal }) => {
      controller.abort(reason);
      signal.throwIfAborted();
    },
  }), (error) => error === reason);
});
