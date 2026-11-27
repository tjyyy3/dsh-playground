import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { createReleaseQuery, classifyInstallSource, createReleaseInstaller } from '../lib/releases.js';
import { createReleaseChecks } from '../src/client/settings/release-checks.js';
import { DEFAULT_MAX_RESPONSE_BYTES } from '../lib/api.js';

const sha = 'a'.repeat(40);

test('automatic release checks persist a verified badge, throttle per channel and respect opt-out', async () => {
  const info = { channel: 'beta', source: 'registry', currentVersion: '1.0.0', installedVersion: '1.0.0' };
  const result = { status: 'ready', compatible: true, registry: { status: 'ready' },
    comparison: 'upgrade', target: { version: '1.0.1' } };
  let count = 0;
  let time = 1000;
  let saved;
  const make = () => createReleaseChecks(async ({ check }) => {
    if (check) count++;
    return { ...info, ...(check ? result : { status: 'unchecked' }) };
  }, () => ({ getItem: () => saved, setItem: (_, value) => { saved = value; } }), () => time);
  let checks = make();
  await Promise.all([checks.check(), checks.check()]);
  assert.equal(count, 1);
  checks = make();
  await checks.check();
  assert.equal(checks.getSnapshot().version, '1.0.1');
  assert.equal(count, 1);
  info.channel = 'stable';
  result.compatible = false;
  await checks.check();
  assert.equal(count, 2);
  assert.equal(checks.getSnapshot().version, null);
  time += 86400000;
  result.compatible = true;
  result.registry.status = 'pending';
  await checks.check();
  assert.equal(count, 3);
  assert.equal(checks.getSnapshot().version, null);
  checks.setEnabled(false);
  checks = make();
  info.channel = 'beta';
  await checks.check();
  assert.equal(count, 3);
  assert.equal(checks.getSnapshot().enabled, false);
});

test('current and older releases need no compatibility decision to cache the absence of an upgrade', async () => {
  for (const comparison of ['current', 'downgrade']) {
    const info = { channel: 'beta', source: 'registry', currentVersion: '1.0.1', installedVersion: '1.0.1' };
    let count = 0;
    let time = 0;
    const checks = createReleaseChecks(async ({ check }) => {
      if (!check) return info;
      count++;
      return { ...info, status: 'ready', registry: { status: 'ready' }, comparison,
        target: { version: comparison === 'current' ? '1.0.1' : '1.0.0' } };
    }, () => null, () => time);
    await checks.check();
    time += 23 * 60 * 60 * 1000;
    await checks.check();
    assert.equal(count, 1);
    assert.equal(checks.getSnapshot().version, null);
  }
});

test('automatic release checks retry provisional results before the next day', async () => {
  const info = { channel: 'beta', source: 'registry', currentVersion: '1.0.0', installedVersion: '1.0.0' };
  const ready = { status: 'ready', compatible: true, registry: { status: 'ready' }, comparison: 'upgrade', target: { version: '1.0.1' } };
  for (const provisional of [
    { status: 'unavailable', error: 'failed' },
    { status: 'unavailable', error: 'timeout' },
    { ...ready, registry: { status: 'pending', stage: 'tarball' } },
    { ...ready, incomplete: true },
  ]) {
    let count = 0;
    let time = 1000;
    let saved;
    const make = () => createReleaseChecks(async ({ check }) => check
      ? { ...info, ...(count++ === 0 ? provisional : ready) } : { ...info, status: 'unchecked' },
    () => ({ getItem: () => saved, setItem: (_, value) => { saved = value; } }), () => time);
    const checks = make();
    await checks.check();
    assert.equal(checks.getSnapshot().version, null);
    const reopened = make();
    await reopened.check();
    assert.equal(count, 1);
    time += 5 * 60 * 1000;
    await reopened.check();
    assert.equal(count, 2, provisional.error || provisional.registry?.status || 'incomplete');
    assert.equal(reopened.getSnapshot().version, '1.0.1');
  }
});

test('automatic release checks wait until the GitHub rate limit resets', async () => {
  const info = { channel: 'stable', source: 'registry', currentVersion: '1.0.0', installedVersion: '1.0.0' };
  const reset = 30 * 60 * 1000;
  let checks = 0;
  let time = 1000;
  let saved;
  const make = () => createReleaseChecks(async ({ check }) => check ? { ...info, ...(checks++ === 0
    ? { status: 'unavailable', error: 'rate_limited', resetAt: new Date(reset).toISOString() }
    : { status: 'ready', compatible: true, registry: { status: 'ready' }, comparison: 'upgrade', target: { version: '1.0.1' } }) }
    : { ...info, status: 'unchecked' },
  () => ({ getItem: () => saved, setItem: (_, value) => { saved = value; } }), () => time);
  await make().check();
  const reopened = make();
  time = reset - 1;
  await reopened.check();
  assert.equal(checks, 1);
  time = reset;
  await reopened.check();
  assert.equal(checks, 2);
  assert.equal(reopened.getSnapshot().version, '1.0.1');
});

test('a provisional manual check does not overwrite a verified badge or postpone refresh until tomorrow', async () => {
  const info = { channel: 'stable', source: 'git_pinned', currentVersion: '1.0.0', installedVersion: '1.0.0' };
  const result = { ...info, status: 'ready', compatible: true, registry: { status: 'ready' },
    comparison: 'upgrade', target: { version: '1.0.1', gitSpec: `github:tjyyy3/dsh-playground#${sha}` } };
  let count = 0;
  let time = 1000;
  const checks = createReleaseChecks(async ({ check }) => {
    if (!check) return { ...info, status: 'unchecked' };
    count++;
    return result;
  }, () => null, () => time);
  checks.checked(result);
  checks.checked({ ...result, registry: { status: 'pending', stage: 'tarball' }, compatible: undefined });
  assert.equal(checks.getSnapshot().version, '1.0.1');
  await checks.check();
  assert.equal(count, 0);
  time += 5 * 60 * 1000;
  await checks.check();
  assert.equal(count, 1);
  assert.equal(checks.getSnapshot().version, '1.0.1');
});

test('an automatic RPC that stalls can retry after its timeout', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const info = { channel: 'stable', source: 'registry', currentVersion: '1.0.0', installedVersion: '1.0.0' };
  let count = 0;
  let signal;
  const checks = createReleaseChecks(async ({ check }, requestSignal) => {
    if (!check) return { ...info, status: 'unchecked' };
    if (count++ > 0) return { ...info, status: 'ready', target: null, comparison: null };
    signal = requestSignal;
    return new Promise(() => {});
  }, () => null);
  const pending = checks.check();
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(signal);
  t.mock.timers.tick(150000);
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(signal.aborted);
  assert.equal(count, 1);
  t.mock.timers.tick(5 * 60 * 1000);
  await checks.check();
  assert.equal(count, 2);
  await pending;
});

test('a late check cannot redisplay an update after the user opts out', async () => {
  let complete;
  const info = { channel: 'stable', source: 'registry', currentVersion: '1.0.0', installedVersion: '1.0.0' };
  const checks = createReleaseChecks(async ({ check }) => check
    ? new Promise(resolve => { complete = resolve; }) : { ...info, status: 'unchecked' }, () => null);
  const pending = checks.check();
  await new Promise(resolve => setImmediate(resolve));
  checks.setEnabled(false);
  complete({ ...info, status: 'ready', comparison: 'upgrade', compatible: true, registry: { status: 'ready' }, target: { version: '2' } });
  await pending;
  assert.deepEqual(checks.getSnapshot(), { enabled: false, version: null });
});

test('an explicit upgrade revalidates the exact target and checks the installed version through DSH', async () => {
  const version = '1.0.1';
  const target = { canInstall: true, source: 'registry', comparison: 'upgrade', registry: { status: 'ready' }, target: { version } };
  let installed = '1.0.0';
  const calls = [];
  const manager = { listBundles: () => [{ name: 'dsh-playground', version: installed }],
    updateBundle(name, version) { calls.push([name, version]); return { result: { application: 'restart-required' } }; } };
  const install = createReleaseInstaller(async () => target, () => manager);
  assert.equal((await install({ version: 'latest' })).status, 'unavailable');
  target.restartRequired = true;
  assert.equal((await install({ version })).status, 'unavailable');
  assert.deepEqual(calls, []);
  target.restartRequired = false;
  assert.equal((await install({ version })).status, 'unverified');
  installed = version;
  assert.equal((await install({ version })).status, 'restart-required');
  assert.deepEqual(calls, [['dsh-playground', version], ['dsh-playground', version]]);
  manager.updateBundle = () => ({ result: { application: 'failed' }, restore: { application: 'applied' } });
  target.installedVersion = '1.0.0';
  assert.equal((await install({ version })).status, 'unverified');
  installed = target.installedVersion;
  assert.equal((await install({ version })).status, 'restored');
});
const api = 'https://api.github.com/repos/tjyyy3/dsh-playground/releases';
const release = (version, fields = {}) => ({ tag_name: `v${version}`, draft: false,
  prerelease: version.split('+')[0].includes('-'), body: `Commit: ${sha}\nGit spec: github:tjyyy3/dsh-playground#${sha}\n`, ...fields });
const query = (options = {}) => createReleaseQuery({ readVersion: () => '0.5.0-preview.7', ...options });
const check = (channel, releases) => query({ channel, fetchImpl: async () => Response.json(releases) })({ check: true });

test('install source classification distinguishes every host source class', () => {
  for (const [source, update, expected] of [
    ['dsh-playground@1.0.0', 'registry', 'registry'],
    ['dsh-playground@^1.0.0', undefined, 'registry'],
    ['dsh-playground@^0.6.0-beta.1', undefined, 'registry'],
    ['dsh-playground@beta', undefined, 'registry'],
    [`github:tjyyy3/dsh-playground#${sha}`, 'git', 'git_pinned'],
    [`git+https://github.com/tjyyy3/dsh-playground.git#${sha}`, 'git', 'git_pinned'],
    [`https://github.com/tjyyy3/dsh-playground.git#${sha}&path:plugin`, 'git', 'git_pinned'],
    ['github:tjyyy3/dsh-playground', undefined, 'git_unpinned'],
    ['github:tjyyy3/dsh-playground#main', undefined, 'git_unpinned'],
    ['github:tjyyy3/dsh-playground#v1.0.0', undefined, 'git_unpinned'],
    ['github:tjyyy3/dsh-playground#semver:^1', undefined, 'git_unpinned'],
    ['https://gitee.com/user/dsh-playground.git', undefined, 'git_unpinned'],
    ['https://codeberg.org/user/dsh-playground.git#main', undefined, 'git_unpinned'],
    [`https://gitee.com/user/dsh-playground.git#${sha}`, undefined, 'git_pinned'],
    ['https://gitee.com/user/dsh-playground#main', undefined, 'unknown'],
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
    const result = await query({ pluginManager: () => ({ listBundles: () => [{ name: 'dsh-playground', source }] }),
      fetchImpl: () => assert.fail('unchecked must not access the network') })({ check: false });
    assert.equal(result.status, 'unchecked');
    hints.add(result.sourceHint);
    if (result.source === 'git_unpinned' || result.source === 'file') {
      assert.match(result.sourceHint, /无法更新该来源.*覆盖安装.*仅当返回 already-installed 时才移除后重新安装/);
      assert.doesNotMatch(result.sourceHint, /先卸载/);
    }
    if (result.source === 'file') assert.match(result.sourceHint, /从 GitHub Release 页面复制/);
    if (result.source === 'registry') {
      assert.match(result.sourceHint, /npm.*核实目标版本及其公开安装包/);
      assert.doesNotMatch(result.sourceHint, /卸载|重新安装/);
    }
  }
  assert.equal(hints.size, 6);
  for (const pluginManager of [() => undefined, () => ({ listBundles: () => [] }), () => ({ listBundles() { throw Error('missing'); } })]) {
    assert.equal((await query({ pluginManager })({ check: false })).source, 'unknown');
  }
});

const npmVersion = '0.6.0-beta.2';
const npmUrl = `https://registry.npmjs.org/dsh-playground/${npmVersion}`;
const npmTarball = `https://registry.npmjs.org/dsh-playground/-/dsh-playground-${npmVersion}.tgz`;
const npmMetadata = () => Response.json({ name: 'dsh-playground', version: npmVersion, dist: { tarball: npmTarball } });
const registryQuery = (options) => query({ channel: 'beta',
  pluginManager: () => ({ listBundles: () => [{ name: 'dsh-playground', update: 'registry' }] }), ...options });

test('registry version and tarball availability retry independently of the three-minute GitHub cache', async () => {
  const calls = [];
  let available = 'neither';
  const read = registryQuery({ fetchImpl: async (url, init) => {
    calls.push(url);
    if (url.startsWith(api)) return Response.json([release(npmVersion)]);
    assert.equal(new Headers(init.headers).has('authorization'), false);
    assert.equal(new Headers(init.headers).has('cookie'), false);
    assert.equal(init.credentials, 'omit');
    assert.equal(init.redirect, 'error');
    assert.ok(init.signal);
    if (url === npmUrl) {
      assert.equal(init.method, 'GET');
      return available === 'neither' ? new Response(null, { status: 404 }) : npmMetadata();
    }
    assert.equal(url, npmTarball);
    assert.equal(init.method, 'HEAD');
    return new Response(null, { status: available === 'both' ? 200 : 404 });
  } });
  await read({ check: false });
  assert.deepEqual(calls, []);
  assert.deepEqual((await read({ check: true })).registry, { status: 'pending', stage: 'version' });
  available = 'metadata';
  assert.deepEqual((await read({ check: true })).registry, { status: 'pending', stage: 'tarball' });
  available = 'both';
  assert.deepEqual((await read({ check: true })).registry, { status: 'ready' });
  assert.equal(calls.filter((url) => url.startsWith(api)).length, 1);
  assert.equal(calls.filter((url) => url === npmUrl).length, 3);
});

test('registry failures stay retryable and do not masquerade as pending publication', async () => {
  for (const stage of ['version', 'tarball']) {
    for (const failure of [() => new Response(null, { status: 500 }), () => new Response(null, { status: 429 }),
      () => { throw Error('offline'); }, () => new Response(null, { status: 302 })]) {
      let broken = true;
      const read = registryQuery({ fetchImpl: async (url) => {
        if (url.startsWith(api)) return Response.json([release(npmVersion)]);
        if (broken && url === (stage === 'version' ? npmUrl : npmTarball)) return failure();
        return url === npmUrl ? npmMetadata() : new Response(null);
      } });
      const failed = (await read({ check: true })).registry;
      assert.equal(failed.status, 'error');
      assert.equal(failed.stage, stage);
      broken = false;
      assert.deepEqual((await read({ check: true })).registry, { status: 'ready' });
    }
  }
});

test('registry metadata must identify the exact package version and canonical public tarball', async () => {
  for (const metadata of [null, {}, { name: 'wrong', version: npmVersion, dist: { tarball: npmTarball } },
    { name: 'dsh-playground', version: '0.6.0-beta.1', dist: { tarball: npmTarball } },
    { name: 'dsh-playground', version: npmVersion, dist: { tarball: 'https://private.test/file.tgz' } }]) {
    const calls = [];
    const result = await registryQuery({ fetchImpl: async (url) => {
      calls.push(url);
      return url.startsWith(api) ? Response.json([release(npmVersion)]) : Response.json(metadata);
    } })({ check: true });
    assert.equal(result.registry.status, 'error');
    assert.equal(calls.length, 2);
  }
});

test('Git, link, file and unknown installs never request registry readiness', async () => {
  for (const source of [`github:tjyyy3/dsh-playground#${sha}`, 'github:tjyyy3/dsh-playground', 'link:../plugin', 'file:../plugin', undefined]) {
    const read = query({ pluginManager: () => ({ listBundles: () => [{ name: 'dsh-playground', source }] }),
      fetchImpl: async (url) => { assert.ok(url.startsWith(api)); return Response.json([release('1.0.0')]); } });
    const result = await read({ check: true });
    assert.equal(result.registry, undefined);
    assert.equal(result.target.gitSpec, `github:tjyyy3/dsh-playground#${sha}`);
  }
});

test('registry metadata is bounded and registry requests obey timeout and caller cancellation', async () => {
  let cancelled = false;
  const oversized = await registryQuery({ fetchImpl: async (url) => url.startsWith(api)
    ? Response.json([release(npmVersion)]) : new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(DEFAULT_MAX_RESPONSE_BYTES + 1)); },
      cancel() { cancelled = true; },
    })) })({ check: true });
  assert.equal(oversized.registry.status, 'error');
  assert.equal(cancelled, true);
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    for (const stage of ['version', 'tarball']) {
      const result = await registryQuery({ timeoutMs: 10, fetchImpl: async (url, { signal }) => {
        if (url.startsWith(api)) return Response.json([release(npmVersion)]);
        if (stage === 'tarball' && url === npmUrl) return npmMetadata();
        return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
      } })({ check: true });
      assert.deepEqual(result.registry, { status: 'error', stage, error: 'timeout' });
    }
  } finally { clearTimeout(keepAlive); }
  for (const urlToCancel of [npmUrl, npmTarball]) {
    const controller = new AbortController();
    const reason = Error('panel closed');
    const read = registryQuery({ fetchImpl: async (url, { signal }) => {
      if (url.startsWith(api)) return Response.json([release(npmVersion)]);
      if (url === urlToCancel) { controller.abort(reason); signal.throwIfAborted(); }
      return npmMetadata();
    } });
    await assert.rejects(read({ check: true }, { signal: controller.signal }), (error) => error === reason);
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
  await mkdir(join(directory, 'lib', 'task'), { recursive: true });
  await writeFile(join(directory, 'package.json'), '{"type":"module","version":"broken"}');
  for (const file of ['releases.js', 'api.js', 'task/evidence.js']) await copyFile(new URL(`../lib/${file}`, import.meta.url), join(directory, 'lib', file));
  const imported = await import(pathToFileURL(join(directory, 'lib/releases.js')).href);
  await writeFile(join(directory, 'package.json'), '{"type":"module","version":"1.0.0"}');
  assert.equal((await imported.queryReleases({ check: false })).currentVersion, '1.0.0');
  await writeFile(join(directory, 'package.json'), 'not json');
  assert.equal((await imported.queryReleases({ check: false })).error, 'version_unavailable');
});
