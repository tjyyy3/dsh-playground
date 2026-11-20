import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { createReleaseQuery, classifyInstallSource } from '../lib/releases.js';
import { DEFAULT_MAX_RESPONSE_BYTES } from '../lib/api.js';

const sha = 'a'.repeat(40);
const api = 'https://api.github.com/repos/tjyyy3/dsh-playground/releases';
const release = (version, fields = {}) => ({ tag_name: `v${version}`, draft: false,
  prerelease: version.split('+')[0].includes('-'), body: `Commit: ${sha}\nGit spec: github:tjyyy3/dsh-playground#${sha}\n`, ...fields });
const query = (options = {}) => createReleaseQuery({ readVersion: () => '0.5.0-preview.7', ...options });
const check = (channel, releases) => query({ channel, fetchImpl: async () => Response.json(releases) })({ check: true });

test('install source classification distinguishes every host source class', () => {
  for (const [source, update, expected] of [
    ['@playground/dsh-playground@1.0.0', 'registry', 'registry'],
    ['@playground/dsh-playground@^1.0.0', undefined, 'registry'],
    [`github:tjyyy3/dsh-playground#${sha}`, 'git', 'git_pinned'],
    [`git+https://github.com/tjyyy3/dsh-playground.git#${sha}`, 'git', 'git_pinned'],
    [`https://github.com/tjyyy3/dsh-playground.git#${sha}&path:plugin`, 'git', 'git_pinned'],
    ['github:tjyyy3/dsh-playground', undefined, 'git_unpinned'],
    ['github:tjyyy3/dsh-playground#main', undefined, 'git_unpinned'],
    ['github:tjyyy3/dsh-playground#v1.0.0', undefined, 'git_unpinned'],
    ['github:tjyyy3/dsh-playground#semver:^1', undefined, 'git_unpinned'],
    ['link:../plugin', undefined, 'link'],
    ['file:../plugin', undefined, 'file'],
    ['C:\\plugin\\bundle.tgz', undefined, 'file'],
    ['https://example.test/plugin.tgz', undefined, 'file'],
    [undefined, undefined, 'unknown'],
  ]) assert.equal(classifyInstallSource({ source, update }), expected, source);
  assert.equal(classifyInstallSource(undefined), 'unknown');
});

test('unchecked reads only local versions and host bundles, with distinct source hints', async () => {
  const hints = new Set();
  for (const source of ['1.0.0', `github:tjyyy3/dsh-playground#${sha}`, 'github:tjyyy3/dsh-playground', 'link:../plugin', 'file:../plugin', undefined]) {
    const result = await query({ pluginManager: () => ({ listBundles: () => [{ name: '@playground/dsh-playground', source }] }),
      fetchImpl: () => assert.fail('unchecked must not access the network') })({ check: false });
    assert.equal(result.status, 'unchecked');
    hints.add(result.sourceHint);
    if (result.source === 'git_unpinned' || result.source === 'file') {
      assert.match(result.sourceHint, /无法更新该来源.*覆盖安装.*仅当返回 already-installed 时才移除后重新安装/);
      assert.doesNotMatch(result.sourceHint, /先卸载/);
    }
    if (result.source === 'file') assert.match(result.sourceHint, /从 GitHub Release 页面复制/);
  }
  assert.equal(hints.size, 6);
  for (const pluginManager of [() => undefined, () => ({ listBundles: () => [] }), () => ({ listBundles() { throw Error('missing'); } })]) {
    assert.equal((await query({ pluginManager })({ check: false })).source, 'unknown');
  }
});

test('running version stays fixed while the on-disk manifest triggers restart only when newer', async () => {
  let version = '0.5.0-preview.7';
  const read = query({ readVersion: () => version });
  version = '0.5.1-beta.1';
  const next = await read({ check: false });
  assert.equal(next.currentVersion, '0.5.0-preview.7');
  assert.equal(next.installedVersion, '0.5.1-beta.1');
  assert.equal(next.restartRequired, true);
  version = '0.4.4';
  assert.equal((await read({ check: false })).restartRequired, false);
});

test('stable selects the highest normal release and beta includes prereleases and stable releases', async () => {
  const releases = ['3.10.0', '3.9.0', '3.11.0-beta.2', '3.11.0-beta.10'].map((v) => release(v));
  assert.equal((await check('stable', releases)).target.version, '3.10.0');
  assert.equal((await check('beta', releases)).target.version, '3.11.0-beta.10');
  assert.equal((await check('beta', [...releases, release('3.11.0')])).target.version, '3.11.0');
  assert.equal((await check('beta', [release('0.5.0-beta.99')])).comparison, 'downgrade');
  assert.equal((await check('beta', [release('0.5.1-beta.1')])).comparison, 'upgrade');
  assert.equal((await check('beta', [release('0.5.0-preview.7+rebuild')])).comparison, 'current');
});

test('the pinned Git spec comes only from a single full commit SHA in the Release body', async () => {
  const target = (await check('stable', [release('1.0.0', { target_commitish: 'main' })])).target;
  assert.equal(target.commit, sha);
  assert.equal(target.gitSpec, `github:tjyyy3/dsh-playground#${sha}`);
  for (const body of ['', 'Commit: main', `Commit: ${sha}evil`, `Commit: ${sha}\nCommit: ${sha}`, `Commit: ${'a'.repeat(39)}`]) {
    const result = await check('stable', [release('1.0.0', { body, target_commitish: sha })]);
    assert.equal(result.target.gitSpec, null);
    assert.equal(result.target.commit, null);
  }
});

test('mismatched Release prerelease flags are reported instead of silently disappearing', async () => {
  const result = await check('stable', [release('1.0.0', { prerelease: true }), release('0.9.0')]);
  assert.equal(result.target.version, '0.9.0');
  assert.deepEqual(result.warnings, ['prerelease_mismatch']);
});

test('pagination uses only the public repository and retains the target when the page cap is reached', async () => {
  let calls = 0;
  const result = await query({ fetchImpl: async (url, init) => {
    assert.equal(url, `${api}?per_page=50&page=${++calls}`);
    assert.equal(new Headers(init.headers).has('authorization'), false);
    assert.equal(init.redirect, 'error');
    return Response.json([release(`${calls}.0.0`)], { headers: { link: '<https://other.test/>; rel="next"' } });
  } })({ check: true });
  assert.equal(calls, 5);
  assert.equal(result.status, 'ready');
  assert.equal(result.incomplete, true);
  assert.equal(result.target.version, '5.0.0');
  const incomplete = await query({ fetchImpl: async () => Response.json([], { headers: { link: '<https://other.test/>; rel="next"' } }) })({ check: true });
  assert.equal(incomplete.error, 'incomplete');
});

test('empty releases, failed requests, and unreadable local versions have distinct results', async () => {
  assert.equal((await check('stable', [])).target, null);
  assert.equal((await check('stable', [])).status, 'ready');
  for (const fetchImpl of [async () => { throw Error('private proxy'); }, async () => new Response('bad', { status: 403 }),
    async () => new Response('bad', { status: 429 }), async () => Response.json({}), async () => new Response('bad')]) {
    assert.equal((await query({ fetchImpl })({ check: true })).error, 'failed');
  }
  const result = await query({ readVersion: () => null, fetchImpl: () => assert.fail('unreadable versions must not fetch') })({ check: true });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.error, 'version_unavailable');
});

test('release results are cached for three minutes without hiding fresh disk information', async () => {
  let time = 1000000;
  let calls = 0;
  let version = '0.5.0-preview.7';
  const read = query({ now: () => time, readVersion: () => version, fetchImpl: async () => {
    calls++;
    return Response.json([release('1.0.0')]);
  } });
  await read({ check: true });
  version = '0.5.1-beta.1';
  assert.equal((await read({ check: true })).restartRequired, true);
  assert.equal(calls, 1);
  time += 180001;
  await read({ check: true });
  assert.equal(calls, 2);
});

test('failed and incomplete release checks can retry immediately and only ready results are cached', async () => {
  let calls = 0;
  const retry = query({ fetchImpl: async () => {
    if (++calls === 1) throw Error('temporarily offline');
    return Response.json([release('1.0.0')]);
  } });
  assert.equal((await retry({ check: true })).error, 'failed');
  assert.equal((await retry({ check: true })).target.version, '1.0.0');
  assert.equal(calls, 2);
  await retry({ check: true });
  assert.equal(calls, 2);

  let pages = 0;
  const incomplete = query({ fetchImpl: async () => ++pages <= 5
    ? Response.json([], { headers: { link: '<https://other.test/>; rel="next"' } })
    : Response.json([release('1.0.0')]) });
  assert.equal((await incomplete({ check: true })).error, 'incomplete');
  assert.equal((await incomplete({ check: true })).target.version, '1.0.0');
  assert.equal(pages, 6);
});

test('each release page gets its own twenty-second budget independent of earlier pages', async (t) => {
  const timeouts = [];
  t.mock.method(AbortSignal, 'timeout', (ms) => {
    const controller = new AbortController();
    timeouts.push({ ms, controller });
    return controller.signal;
  });
  let pages = 0;
  const result = await query({ fetchImpl: async (_url, { signal }) => {
    pages++;
    if (pages === 2) {
      timeouts[0].controller.abort(new DOMException('first page budget elapsed', 'TimeoutError'));
      assert.equal(signal.aborted, false);
    }
    return Response.json([release(`${pages}.0.0`)], pages === 1
      ? { headers: { link: '<https://other.test/>; rel="next"' } } : {});
  } })({ check: true });
  assert.deepEqual(timeouts.map(({ ms }) => ms), [20000, 20000]);
  assert.equal(result.status, 'ready');
  assert.equal(result.target.version, '2.0.0');
});

test('403 and 429 rate limits include reset time and block requests until reset', async () => {
  for (const status of [403, 429]) {
    let time = 1000000;
    let calls = 0;
    const read = query({ now: () => time, fetchImpl: async () => {
      calls++;
      return new Response('rate limited', { status, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '2000' } });
    } });
    const first = await read({ check: true });
    assert.equal(first.error, 'rate_limited');
    assert.equal(first.resetAt, new Date(2000000).toISOString());
    time += 180001;
    assert.equal((await read({ check: true })).resetAt, first.resetAt);
    assert.equal(calls, 1);
    time = 2000001;
    await read({ check: true });
    assert.equal(calls, 2);
  }
});

test('the shared eight MiB response budget cancels oversized release bodies', async () => {
  let cancelled = false;
  const result = await query({ fetchImpl: async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(DEFAULT_MAX_RESPONSE_BYTES + 1)); },
    cancel() { cancelled = true; },
  })) })({ check: true });
  assert.equal(result.error, 'failed');
  assert.equal(cancelled, true);
});

test('timeout covers reading the release body and caller cancellation propagates', async () => {
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    let hung = true;
    const read = query({ timeoutMs: 20, fetchImpl: async (_url, { signal }) => hung ? new Response(new ReadableStream({
      start(controller) { signal.addEventListener('abort', () => controller.error(signal.reason), { once: true }); },
    })) : Response.json([release('1.0.0')]) });
    const result = await read({ check: true });
    assert.equal(result.error, 'timeout');
    hung = false;
    assert.equal((await read({ check: true })).status, 'ready');
  } finally { clearTimeout(keepAlive); }
  const controller = new AbortController();
  const reason = Error('closed');
  await assert.rejects(query({ fetchImpl: async (_url, { signal }) => { controller.abort(reason); signal.throwIfAborted(); } })({ check: true }, { signal: controller.signal }), (error) => error === reason);
});

test('importing the release module never reads the package version or fails on an unreadable manifest', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'pg-release-import-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, 'lib'));
  await writeFile(join(directory, 'package.json'), '{"type":"module","version":"broken"}');
  for (const file of ['releases.js', 'api.js']) await copyFile(new URL(`../lib/${file}`, import.meta.url), join(directory, 'lib', file));
  const imported = await import(pathToFileURL(join(directory, 'lib/releases.js')).href);
  await writeFile(join(directory, 'package.json'), '{"type":"module","version":"1.0.0"}');
  assert.equal((await imported.queryReleases({ check: false })).currentVersion, '1.0.0');
  await writeFile(join(directory, 'package.json'), 'not json');
  assert.equal((await imported.queryReleases({ check: false })).error, 'version_unavailable');
});
