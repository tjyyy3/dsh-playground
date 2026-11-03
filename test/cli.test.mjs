import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { chmod, copyFile, link, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import test from 'node:test';
import { createPlaygroundCli } from '../lib/cli.js';

const warnings = [];
process.on('warning', (warning) => warnings.push(warning));
// The directory name has Chinese and a space so every launch path has to keep it intact.
const root = await mkdtemp(join(tmpdir(), 'playground-cli 测试-'));
// Marker files live in a path without spaces, so an unquoted redirect would hit them exactly.
const markers = await mkdtemp(join(tmpdir(), 'playground-cli-marker-'));
test.after(() => Promise.all([root, markers].map((path) => rm(path, { recursive: true, force: true }))));

const PRINT_ARGV = 'console.log(JSON.stringify(process.argv.slice(2)));';
// Fake CLI: prints the argv it received, so tests compare it with what the plugin passed.
async function fakeCli(path, source = PRINT_ARGV) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `#!/usr/bin/env node\n${source}\n`);
  await chmod(path, 0o755);
  return path;
}

async function withEnv(values, run) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  try {
    return await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const withPath = (directory, run) => withEnv({ PATH: `${directory}${delimiter}${process.env.PATH}` }, run);

// Node needs to be reachable from a directory the test controls; a hard link avoids a copy.
async function placeNode(path) {
  await mkdir(dirname(path), { recursive: true });
  await link(process.execPath, path).catch(() => copyFile(process.execPath, path));
  return path;
}

const TRICKY = ['DSH Playground plugin', 'a & b', 'a | b', 'a ^ b', '%PATH%', 'say "hi" now', '中文 参数',
  'C:\\dir with space\\', '(paren) ok', '!PATH!', 'a < b > c'];
const submitArgv = (value) => ['submit', '--challenge-id', 'demo', '--bundle', value, '--trace', 'trace.jsonl',
  '--harness', value, '--method', 'DSH Playground plugin'];

async function expectArgv(cli, values, { drop = 0, cwd } = {}) {
  for (const value of values) {
    const argv = await cli.submit({ challengeId: 'demo', bundlePath: value, tracePath: 'trace.jsonl',
      harness: value, method: 'DSH Playground plugin', cwd });
    assert.deepEqual(argv, submitArgv(value).slice(drop), `argument ${JSON.stringify(value)}`);
  }
}

const npmShim = (entry) => [
  '@ECHO off', 'GOTO start', ':find_dp0', 'SET dp0=%~dp0', 'EXIT /b', ':start', 'SETLOCAL', 'CALL :find_dp0', '',
  'IF EXIST "%dp0%\\node.exe" (', '  SET "_prog=%dp0%\\node.exe"', ') ELSE (', '  SET "_prog=node"',
  '  SET PATHEXT=%PATHEXT:;.JS;=;%', ')', '',
  `endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\${entry}" %*`, '',
].join('\r\n');

const pnpmShim = (entry) => [
  '@SETLOCAL', '@IF NOT DEFINED NODE_PATH (', '  @SET "NODE_PATH=%~dp0\\..\\node_modules"', ') ELSE (',
  '  @SET "NODE_PATH=%NODE_PATH%;%~dp0\\..\\node_modules"', ')', '@IF EXIST "%~dp0\\node.exe" (',
  `  "%~dp0\\node.exe"  "%~dp0\\..\\${entry}" %*`, ') ELSE (', '  @SET PATHEXT=%PATHEXT:;.JS;=;%',
  `  node  "%~dp0\\..\\${entry}" %*`, ')', '',
].join('\r\n');

test('CLI receives every argument unchanged, including spaces, shell characters and Chinese', async () => {
  const cli = createPlaygroundCli({ command: await fakeCli(join(root, 'direct', 'fake-cli.mjs')) });
  await expectArgv(cli, TRICKY);
  const email = 'name+tag&x@example.test';
  assert.deepEqual(await cli.authLogin(email, 'synthetic-password'), ['auth', 'login', '--email', email]);
});

test('an argument with & does not run another command', async () => {
  const cli = createPlaygroundCli({ command: await fakeCli(join(root, 'marker', 'fake-cli.mjs')) });
  const marker = join(markers, 'direct.txt');
  const method = `x & echo marker> ${marker}`;
  const argv = await cli.submit({ challengeId: 'demo', bundlePath: 'b.zip', method });
  assert.deepEqual(argv, ['submit', '--challenge-id', 'demo', '--bundle', 'b.zip', '--method', method]);
  assert.equal(existsSync(marker), false);
});

test('a missing CLI is still reported as before', async () => {
  const command = `playground-missing-${process.pid}`;
  const cli = createPlaygroundCli({ command });
  await assert.rejects(() => cli.submit({ challengeId: 'demo', bundlePath: 'b.zip' }),
    (error) => error.code === (process.platform === 'win32' ? 'cli_not_found' : 'ENOENT') && error.started === false
      && (process.platform !== 'win32' || !error.message.includes(command)));
});

test('Windows: a missing CLI path is cli_not_found, not ENOENT', { skip: process.platform !== 'win32' }, async () => {
  for (const command of [join(root, 'missing', 'playground.cmd'), join(root, 'missing', 'cli.js'), join(root, 'missing', 'playground')]) {
    await assert.rejects(() => createPlaygroundCli({ command }).submit({ challengeId: 'demo', bundlePath: 'b.zip' }),
      (error) => error.code === 'cli_not_found' && error.started === false && !error.message.includes(root), command);
  }
});

test('a relative cliPath runs from the CLI working directory, not the host directory', async () => {
  const host = join(root, 'relative host');
  const workspace = join(root, 'relative 工作区');
  await fakeCli(join(host, 'tools', 'cli.mjs'), "console.log(JSON.stringify(['host']));");
  await fakeCli(join(workspace, 'tools', 'cli.mjs'), "console.log(JSON.stringify(['workspace']));");
  const previous = process.cwd();
  process.chdir(host);
  try {
    const cli = createPlaygroundCli({ command: 'tools/cli.mjs' });
    assert.deepEqual(await cli.submit({ challengeId: 'demo', bundlePath: 'b.zip', cwd: workspace }), ['workspace']);
    // The same instance follows the working directory instead of reusing the first resolution.
    assert.deepEqual(await cli.submit({ challengeId: 'demo', bundlePath: 'b.zip', cwd: host }), ['host']);
  } finally {
    process.chdir(previous);
  }
});

test('errors say whether the CLI process started', async () => {
  const bin = join(root, 'started');
  const notStarted = (error) => error.started === false;
  const started = (code) => (error) => error.started === true && error.code === code;
  const cli = createPlaygroundCli({ command: await fakeCli(join(bin, 'argv.mjs')) });
  // The working directory does not exist, so spawning fails before a process exists.
  await assert.rejects(() => cli.submit({ challengeId: 'demo', bundlePath: 'b.zip', cwd: join(bin, 'no such dir') }), notStarted);
  const failing = createPlaygroundCli({ command: await fakeCli(join(bin, 'fail.mjs'), "console.error('rejected'); process.exit(3);") });
  await assert.rejects(() => failing.submit({ challengeId: 'demo', bundlePath: 'b.zip' }), started('cli_error'));
  const text = createPlaygroundCli({ command: await fakeCli(join(bin, 'text.mjs'), "console.log('not json');") });
  await assert.rejects(() => text.submit({ challengeId: 'demo', bundlePath: 'b.zip' }), started(undefined));
  // Login uses timeoutMs and is terminated; submit uses submitTimeoutMs and finishes. The CLI takes
  // much longer than the login timeout because ending a process tree on Windows (taskkill) can take
  // over a second on a slow runner, and a CLI that finishes meanwhile is a success, not a termination.
  const slow = createPlaygroundCli({
    command: await fakeCli(join(bin, 'slow.mjs'), "setTimeout(() => console.log(JSON.stringify(['done'])), 4000);"),
    timeoutMs: 300,
    submitTimeoutMs: 30000,
  });
  await assert.rejects(() => slow.authLogin('name@example.test', 'synthetic-password'), started('cli_terminated'));
  assert.deepEqual(await slow.submit({ challengeId: 'demo', bundlePath: 'b.zip' }), ['done']);
});

test('a failed CLI keeps its output streams for classification but hides them from serialization', async () => {
  const failing = createPlaygroundCli({
    command: await fakeCli(join(root, 'streams', 'fail.mjs'), "console.log('stub-stdout'); console.error('error: stub-stderr'); process.exit(1);"),
  });
  const error = await failing.submit({ challengeId: 'demo', bundlePath: 'b.zip' }).then(
    () => assert.fail('expected the stub CLI to fail'),
    (failure) => failure,
  );
  assert.equal(error.started, true);
  assert.equal(error.code, 'cli_error');
  assert.equal(Object.keys(error).includes('stdout'), false);
  assert.equal(Object.keys(error).includes('stderr'), false);
  assert.match(error.stdout, /stub-stdout/);
  assert.match(error.stderr, /error: stub-stderr/);
  assert.doesNotMatch(JSON.stringify(error), /stub-stdout|stub-stderr/);
});

test('Windows: the current directory is never searched for the CLI or node', { skip: process.platform !== 'win32' }, async () => {
  const cwd = join(root, 'planted 工作区');
  const marker = join(markers, 'planted.txt');
  await mkdir(cwd, { recursive: true });
  for (const name of ['node.cmd', 'node.bat', 'playground.cmd', 'fakeplanted.cmd', 'fakecwd.cmd', 'fakecwdother.cmd']) {
    await writeFile(join(cwd, name), `@echo planted> "${marker}"\r\n`);
  }
  // Only the planted copy exists, so the lookup fails without running it.
  await assert.rejects(() => createPlaygroundCli({ command: 'fakeplanted' }).submit({ challengeId: 'demo', bundlePath: 'b.zip', cwd }),
    (error) => error.code === 'cli_not_found');
  const bin = join(root, 'planted bin');
  const entry = await fakeCli(join(bin, 'node_modules', '@fake', 'cli', 'dist', 'index.js'));
  await writeFile(join(bin, 'fakecwd.cmd'), npmShim('node_modules\\@fake\\cli\\dist\\index.js'));
  await fakeCli(join(bin, 'entry'));
  // Unrecognized, so it runs through the cmd fallback, where `node` would otherwise match cwd\node.cmd.
  await writeFile(join(bin, 'fakecwdother.cmd'), '@node "%~dp0entry" %*\r\n');
  await expectArgv(createPlaygroundCli({ command: entry }), ['DSH Playground plugin'], { cwd });
  await withPath(bin, async () => {
    await expectArgv(createPlaygroundCli({ command: 'fakecwd' }), ['DSH Playground plugin'], { cwd });
    await expectArgv(createPlaygroundCli({ command: 'fakecwdother' }), ['DSH Playground plugin'], { cwd });
  });
  assert.equal(existsSync(marker), false);
});

test('Windows: a missing Node.js is cli_node_missing for a .js cliPath and a recognized shim', { skip: process.platform !== 'win32' }, async () => {
  const bin = join(root, 'no node 目录');
  const script = await fakeCli(join(bin, 'node_modules', '@fake', 'cli', 'dist', 'index.js'));
  const shim = join(bin, 'fakenonode.cmd');
  await writeFile(shim, npmShim('node_modules\\@fake\\cli\\dist\\index.js'));
  const empty = join(root, 'empty path');
  await mkdir(empty, { recursive: true });
  await withEnv({ PATH: empty }, async () => {
    for (const command of [script, shim]) {
      await assert.rejects(() => createPlaygroundCli({ command }).submit({ challengeId: 'demo', bundlePath: 'b.zip' }),
        (error) => error.code === 'cli_node_missing' && error.started === false && !error.message.includes(root), command);
    }
  });
});

test('Windows: a quoted PATH entry containing ; and spaced PATHEXT items are honored', { skip: process.platform !== 'win32' }, async () => {
  const bin = join(root, 'quoted;path 目录');
  await fakeCli(join(bin, 'node_modules', '@fake', 'cli', 'dist', 'index.js'));
  await writeFile(join(bin, 'fakequoted.cmd'), npmShim('node_modules\\@fake\\cli\\dist\\index.js'));
  await withEnv({ PATH: `"${bin}";${process.env.PATH}`, PATHEXT: '.COM; .EXE ; .BAT; .CMD ' }, () =>
    expectArgv(createPlaygroundCli({ command: 'fakequoted' }), ['DSH Playground plugin']));
});

test('Windows: one CLI instance follows PATH changes', { skip: process.platform !== 'win32' }, async () => {
  const cli = createPlaygroundCli({ command: 'fakecache' });
  for (const name of ['a', 'b']) {
    const bin = join(root, `cache ${name}`);
    await fakeCli(join(bin, 'node_modules', '@fake', 'cli', 'dist', 'index.js'), `console.log(JSON.stringify(['${name}']));`);
    await writeFile(join(bin, 'fakecache.cmd'), npmShim('node_modules\\@fake\\cli\\dist\\index.js'));
    assert.deepEqual(await withPath(bin, () => cli.submit({ challengeId: 'demo', bundlePath: 'b.zip' })), [name]);
  }
});

test('Windows: npm shim on PATH in a directory with Chinese and spaces runs its JS entry', { skip: process.platform !== 'win32' }, async () => {
  const bin = join(root, '全局 npm', 'bin');
  await fakeCli(join(bin, 'node_modules', '@fake', 'cli', 'dist', 'index.js'));
  await writeFile(join(bin, 'fakeplayground.cmd'), npmShim('node_modules\\@fake\\cli\\dist\\index.js'));
  await withPath(bin, () => expectArgv(createPlaygroundCli({ command: 'fakeplayground' }), TRICKY));
});

test('Windows: pnpm shim with a parent-relative entry runs its JS entry', { skip: process.platform !== 'win32' }, async () => {
  const home = join(root, 'pnpm 目录');
  await fakeCli(join(home, '@fake', 'cli', 'dist', 'index.mjs'));
  const shim = join(home, 'bin', 'fakepnpm.cmd');
  await mkdir(dirname(shim), { recursive: true });
  await writeFile(shim, pnpmShim('@fake\\cli\\dist\\index.mjs'));
  await expectArgv(createPlaygroundCli({ command: shim }), TRICKY);
});

test('Windows: a shim directory node.exe is preferred over PATH node', { skip: process.platform !== 'win32' }, async () => {
  const bin = join(root, '自带 node');
  await fakeCli(join(bin, 'node_modules', '@fake', 'cli', 'dist', 'index.js'), 'console.log(JSON.stringify([process.execPath]));');
  await writeFile(join(bin, 'fakeplayground.cmd'), npmShim('node_modules\\@fake\\cli\\dist\\index.js'));
  const node = await placeNode(join(bin, 'node.exe'));
  const [execPath] = await createPlaygroundCli({ command: join(bin, 'fakeplayground.cmd') }).submit({ challengeId: 'demo', bundlePath: 'b.zip' });
  assert.equal(execPath.toLowerCase(), node.toLowerCase());
});

test('Windows: an npm shim saved as .bat runs its JS entry', { skip: process.platform !== 'win32' }, async () => {
  const bin = join(root, 'bat 目录');
  await fakeCli(join(bin, 'node_modules', '@fake', 'cli', 'dist', 'index.js'));
  await writeFile(join(bin, 'fakebat.bat'), npmShim('node_modules\\@fake\\cli\\dist\\index.js'));
  await expectArgv(createPlaygroundCli({ command: join(bin, 'fakebat.bat') }), TRICKY);
});

test('Windows: a wrapper that adds its own arguments is not parsed as a shim', { skip: process.platform !== 'win32' }, async () => {
  const bin = join(root, 'wrapper 目录');
  await fakeCli(join(bin, 'entry.js'));
  await writeFile(join(bin, 'fakewrapper.cmd'), '@set PLAYGROUND_X=1\r\n@node "%~dp0entry.js" --profile lab %*\r\n');
  const cli = createPlaygroundCli({ command: join(bin, 'fakewrapper.cmd') });
  assert.deepEqual(await cli.submit({ challengeId: 'demo', bundlePath: 'b.zip' }),
    ['--profile', 'lab', 'submit', '--challenge-id', 'demo', '--bundle', 'b.zip']);
  // The guarded cmd fallback handles it, so cmd metacharacters are refused.
  await assert.rejects(() => cli.submit({ challengeId: 'demo', bundlePath: 'b.zip', method: 'a & b' }),
    (error) => error.code === 'cli_unsafe_argument');
});

test('Windows: an .exe found on PATH is started directly', { skip: process.platform !== 'win32' }, async () => {
  const bin = join(root, 'exe 目录');
  await placeNode(join(bin, 'fakeexe.exe'));
  // The renamed node runs ./submit from cwd, so argv starts after the subcommand.
  const cwd = join(root, 'exe 工作区');
  await fakeCli(join(cwd, 'submit'));
  await withPath(bin, () => expectArgv(createPlaygroundCli({ command: 'fakeexe' }), TRICKY, { drop: 1, cwd }));
});

test('Windows: an unrecognized shim falls back to cmd and still passes safe arguments unchanged', { skip: process.platform !== 'win32' }, async () => {
  const bin = join(root, '未知 shim (x)');
  await fakeCli(join(bin, 'entry'));
  await writeFile(join(bin, 'fakeother.cmd'), '@node "%~dp0entry" %*\r\n');
  const cli = createPlaygroundCli({ command: join(bin, 'fakeother.cmd') });
  await expectArgv(cli, ['DSH Playground plugin', '中文 参数', '(paren) ok', 'C:\\dir with space\\', 'C:\\a\\b']);
  assert.deepEqual(await cli.authLogin('name+tag@example.test', 'synthetic-password'), ['auth', 'login', '--email', 'name+tag@example.test']);
  for (const value of ['', ',', ';', '=', 'a,b;c=d', ' , ; = ']) {
    assert.deepEqual(await cli.submit({ challengeId: value, bundlePath: value }),
      ['submit', '--challenge-id', value, '--bundle', value], JSON.stringify(value));
  }
});

test('Windows: the cmd fallback refuses arguments cmd would interpret', { skip: process.platform !== 'win32' }, async () => {
  const bin = join(root, 'fallback-unsafe');
  await fakeCli(join(bin, 'entry'), `require('node:fs').writeFileSync(${JSON.stringify(join(bin, 'started.txt'))}, '');`);
  await writeFile(join(bin, 'fakeother.cmd'), '@node "%~dp0entry" %*\r\n');
  const cli = createPlaygroundCli({ command: join(bin, 'fakeother.cmd') });
  const marker = join(markers, 'fallback.txt');
  for (const value of [`x & echo marker> ${marker}`, 'a|b', 'a^b', '%PATH%', '!PATH!', 'say "hi"', 'a<b', 'a>b', 'a\nb', 'a\rb']) {
    await assert.rejects(() => cli.submit({ challengeId: 'demo', bundlePath: 'b.zip', method: value }),
      (error) => error.code === 'cli_unsafe_argument' && error.started === false && /cliPath/.test(error.message)
        && !error.message.includes(root), JSON.stringify(value));
  }
  await assert.rejects(() => cli.authLogin('a&b@example.test', 'synthetic-password'), (error) => error.code === 'cli_unsafe_argument');
  assert.equal(existsSync(marker), false);
  assert.equal(existsSync(join(bin, 'started.txt')), false);
});

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const alive = (pid) => {
  try { return process.kill(pid, 0); } catch { return false; }
};
async function waitUntil(check, ms) {
  for (const end = Date.now() + ms; Date.now() < end && !(await check());) await sleep(50);
  return check();
}
const HANG = 'setInterval(() => {}, 1000);';

// Timing. TIMEOUT only drives the timeout tests; the tree tests abort once the process has really
// started, so slow start-up cannot make them fail. GRACE is short on purpose: the Windows kill
// path never kills the root before taskkill has exited, so the grace period does not have to
// outlast taskkill, which alone takes about 700 ms on a Windows development machine. Timing
// therefore cannot tell a working kill from the end of the grace period; the tests check that
// the processes are gone. BOUND is the contract: run() returns by TIMEOUT + GRACE, with 500 ms
// for timer jitter. MARKER_DELAY is when a surviving tree would write its marker.
const TIMEOUT = 1500;
const GRACE = 1000;
const BOUND = TIMEOUT + GRACE + 500;
const MARKER_DELAY = 4000;

const quote = (value) => JSON.stringify(value);
const readPid = async (file) => Number(await readFile(file, 'utf8').catch(() => '')) || 0;
// Cleanup for tests: ends the processes whose pids were recorded, if they are still alive.
async function killRecorded(...files) {
  for (const file of files) {
    const pid = await readPid(file);
    if (pid && alive(pid)) {
      try { process.kill(pid, 'SIGKILL'); } catch { /* gone in the meantime */ }
    }
  }
}

// Writes its pid to `marker`.started at once and `marker` itself MARKER_DELAY later.
const delayedMarker = (marker) => `const fs = require('node:fs'); fs.writeFileSync(${quote(`${marker}.started`)}, String(process.pid));`
  + ` setTimeout(() => fs.writeFileSync(${quote(marker)}, 'done'), ${MARKER_DELAY});`;

// Cancels the CLI once it has really started; whatever it started must be gone before the marker is due.
async function expectTreeEnded(cli, marker) {
  const controller = new AbortController();
  const outcome = cli.submit({ challengeId: 'demo', bundlePath: 'b.zip', signal: controller.signal }).then(
    () => assert.fail('expected the CLI to be cancelled'),
    (failure) => failure,
  );
  try {
    assert.equal(await waitUntil(() => existsSync(`${marker}.started`), 10000), true, 'the process never started');
    controller.abort();
    const error = await outcome;
    assert.equal(error.code, 'cli_terminated');
    assert.equal(error.started, true);
    // Wait until the marker would have been written, counted from when the process really started.
    await sleep(Math.max(0, statSync(`${marker}.started`).mtimeMs + MARKER_DELAY + 500 - Date.now()));
    assert.equal(existsSync(marker), false);
  } finally {
    controller.abort();
    await killRecorded(`${marker}.started`, `${marker}.root`);
  }
}

test('a cancellation ends the CLI together with the processes it started', async () => {
  const marker = join(markers, 'grandchild.txt');
  // The grandchild keeps the output pipes open. Windows kills a Node process's attached children
  // when it dies, so only a detached one outlives the CLI there.
  const cli = createPlaygroundCli({
    command: await fakeCli(join(root, 'tree', 'tree.mjs'), `import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
writeFileSync(${quote(`${marker}.root`)}, String(process.pid));
spawn(process.execPath, ['-e', ${quote(delayedMarker(marker))}], { stdio: 'inherit', detached: ${process.platform === 'win32'} });
${HANG}`),
    killGraceMs: GRACE,
  });
  await expectTreeEnded(cli, marker);
});

test('Windows: a cancellation ends the Node process behind the cmd fallback', { skip: process.platform !== 'win32' }, async () => {
  const bin = join(root, 'timeout cmd');
  const marker = join(markers, 'behind-cmd.txt');
  await fakeCli(join(bin, 'entry'), delayedMarker(marker));
  await writeFile(join(bin, 'fakehang.cmd'), '@node "%~dp0entry" %*\r\n');
  const cli = createPlaygroundCli({ command: join(bin, 'fakehang.cmd'), killGraceMs: GRACE });
  await expectTreeEnded(cli, marker);
});

test('a timeout ends a hanging CLI within the grace period', async () => {
  const pidFile = join(markers, 'hang.pid');
  const cli = createPlaygroundCli({
    command: await fakeCli(join(root, 'hang', 'hang.mjs'),
      `import { writeFileSync } from 'node:fs'; writeFileSync(${quote(pidFile)}, String(process.pid)); ${HANG}`),
    submitTimeoutMs: TIMEOUT,
    killGraceMs: GRACE,
  });
  const begin = Date.now();
  const error = await cli.submit({ challengeId: 'demo', bundlePath: 'b.zip' }).then(
    () => assert.fail('expected the CLI to be terminated'),
    (failure) => failure,
  );
  const elapsed = Date.now() - begin;
  try {
    assert.equal(error.code, 'cli_terminated');
    assert.equal(error.started, true);
    assert.ok(elapsed < BOUND, `run() took ${elapsed} ms`);
    const pid = await readPid(pidFile);
    assert.ok(pid > 0, 'the CLI never started');
    assert.equal(await waitUntil(() => !alive(pid), 2000), true, 'the CLI is still running');
  } finally {
    await killRecorded(pidFile);
  }
});

// SIGTERM does not exist on Windows, where the CLI is always ended with taskkill /F, so this
// only runs on macOS and Linux. SIGTERM is ignored, so SIGKILL and the end of the wait both
// come at TIMEOUT + GRACE; the bound leaves 1500 ms for timer jitter and process start-up.
test('a CLI that ignores SIGTERM is ended after the grace period and keeps its output on the error',
  { skip: process.platform === 'win32' && 'Windows has no SIGTERM: the CLI is ended with taskkill /F' }, async () => {
    const pidFile = join(markers, 'stubborn.pid');
    const cli = createPlaygroundCli({
      command: await fakeCli(join(root, 'stubborn', 'stubborn.mjs'), `import { writeFileSync } from 'node:fs';
process.on('SIGTERM', () => {});
writeFileSync(${quote(pidFile)}, String(process.pid));
console.log('partial-out'); console.error('partial-err');
${HANG}`),
      submitTimeoutMs: TIMEOUT,
      killGraceMs: GRACE,
    });
    const begin = Date.now();
    const error = await cli.submit({ challengeId: 'demo', bundlePath: 'b.zip' }).then(
      () => assert.fail('expected the CLI to be terminated'),
      (failure) => failure,
    );
    const elapsed = Date.now() - begin;
    try {
      assert.equal(error.code, 'cli_terminated');
      assert.equal(error.started, true);
      assert.ok(elapsed < TIMEOUT + GRACE + 1500, `run() took ${elapsed} ms`);
      assert.match(error.stdout, /partial-out/);
      assert.match(error.stderr, /partial-err/);
      assert.equal(Object.keys(error).includes('stdout'), false);
      const pid = await readPid(pidFile);
      assert.ok(pid > 0, 'the CLI never started');
      assert.equal(await waitUntil(() => !alive(pid), 2000), true, 'the CLI is still running');
    } finally {
      await killRecorded(pidFile);
    }
  });

// On Windows taskkill /T finds descendants through a live root, so a grandchild that outlives a
// clean CLI exit cannot be ended there. Process groups cover it on macOS and Linux.
test('a CLI that exited cleanly is not rewritten when a grandchild holds its output open',
  { skip: process.platform === 'win32' && 'Windows cannot end a grandchild after the CLI has exited' }, async () => {
    const pidFile = join(markers, 'held.pid');
    const timeout = 3000;
    // The grandchild ignores SIGTERM, so the pipes are only released by SIGKILL or the end of the
    // wait, both at timeout + GRACE. It writes its pid once the handler is installed, and the CLI
    // prints its JSON and exits only after that, so the timeout cannot hit a running CLI.
    const grandchild = `process.on('SIGTERM', () => {}); require('node:fs').writeFileSync(${quote(pidFile)}, String(process.pid)); setInterval(() => {}, 1000);`;
    const cli = createPlaygroundCli({
      command: await fakeCli(join(root, 'held', 'held.mjs'), `import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
spawn(process.execPath, ['-e', ${quote(grandchild)}], { stdio: 'inherit' }).unref();
const wait = setInterval(() => {
  if (!existsSync(${quote(pidFile)})) return;
  clearInterval(wait);
  console.log(JSON.stringify(['done']));
}, 20);`),
      submitTimeoutMs: timeout,
      killGraceMs: GRACE,
    });
    try {
      const begin = Date.now();
      const output = await cli.submit({ challengeId: 'demo', bundlePath: 'b.zip' });
      const elapsed = Date.now() - begin;
      assert.deepEqual(output, ['done']);
      assert.ok(elapsed >= timeout + GRACE - 100, `run() returned after ${elapsed} ms, before the grace period ended`);
      assert.ok(elapsed < timeout + GRACE + 1500, `run() took ${elapsed} ms`);
      const pid = await readPid(pidFile);
      assert.ok(pid > 0, 'the grandchild never started');
      assert.equal(await waitUntil(() => !alive(pid), 2000), true, 'the grandchild is still running');
    } finally {
      await killRecorded(pidFile);
    }
  });

test('an abort signal stops the CLI, and an already aborted signal never starts it', async () => {
  const pidFile = join(markers, 'aborted.pid');
  const cli = createPlaygroundCli({
    command: await fakeCli(join(root, 'abort', 'abort.mjs'),
      `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); ${HANG}`),
    killGraceMs: GRACE,
  });
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(() => cli.submit({ challengeId: 'demo', bundlePath: 'b.zip', signal: cancelled.signal }),
    (error) => error.code === 'cli_terminated' && error.started === false);
  await sleep(300);
  assert.equal(existsSync(pidFile), false);
  // Abort only once the CLI has written its pid, then check that this process is really gone.
  const running = new AbortController();
  const outcome = cli.submit({ challengeId: 'demo', bundlePath: 'b.zip', signal: running.signal }).then(
    () => assert.fail('expected the CLI to be cancelled'),
    (failure) => failure,
  );
  let pid;
  try {
    const written = await waitUntil(async () => existsSync(pidFile) && (await readFile(pidFile, 'utf8')) !== '', 10000);
    assert.equal(written, true, 'the CLI never started');
    pid = Number(await readFile(pidFile, 'utf8'));
    const begin = Date.now();
    running.abort();
    const error = await outcome;
    assert.equal(error.code, 'cli_terminated');
    assert.equal(error.started, true);
    assert.ok(Date.now() - begin < BOUND, `run() took ${Date.now() - begin} ms`);
    assert.equal(await waitUntil(() => !alive(pid), 2000), true, 'the CLI is still running');
  } finally {
    running.abort();
    if (pid && alive(pid)) process.kill(pid, 'SIGKILL');
  }
});
test('starting the CLI emits no shell deprecation warning', () => {
  assert.deepEqual(warnings.filter((warning) => warning.code === 'DEP0190').map(String), []);
});
