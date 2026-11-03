import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chmod, copyFile, link, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import test from 'node:test';
import { buildSubmitArgs, createPlaygroundCli } from '../lib/cli.js';

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
  // Login uses timeoutMs and is terminated; submit uses submitTimeoutMs and finishes.
  const slow = createPlaygroundCli({
    command: await fakeCli(join(bin, 'slow.mjs'), "setTimeout(() => console.log(JSON.stringify(['done'])), 1500);"),
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

test('starting the CLI emits no shell deprecation warning', () => {
  assert.deepEqual(warnings.filter((warning) => warning.code === 'DEP0190').map(String), []);
});

const required = { challengeId: 'challenge-a', bundlePath: 'bundle.zip' };
const NEW_FIELD_FLAGS = ['--manifest', '--outcome', '--detail', '--author-name'];
const hasFlag = (args, flag) => args.some((arg) => arg === flag || arg.startsWith(`${flag}=`));

test('submit arguments include every given submission field', () => {
  assert.deepEqual(buildSubmitArgs({
    ...required, tracePath: 'trace.jsonl', model: 'model-a', harness: 'harness-a', method: 'method-a',
    manifestPath: 'arm_manifest.json', outcome: 'success', detail: 'Run notes', authorName: 'Agent A',
  }), [
    'submit', '--challenge-id', 'challenge-a', '--bundle', 'bundle.zip', '--trace', 'trace.jsonl',
    '--model', 'model-a', '--harness', 'harness-a', '--method', 'method-a',
    '--manifest=arm_manifest.json', '--outcome', 'success', '--detail=Run notes', '--author-name=Agent A',
  ]);
});

test('free-text values that start with "--" stay attached to their flag', () => {
  const args = buildSubmitArgs({ ...required, tracePath: 'trace.jsonl', manifestPath: '--odd/arm_manifest.json', detail: '--- notes', authorName: '--agent=a' });
  assert.deepEqual(args.slice(-3), ['--manifest=--odd/arm_manifest.json', '--detail=--- notes', '--author-name=--agent=a']);
});

test('submit arguments omit fields that were not given so the CLI keeps its defaults', () => {
  for (const blank of [undefined, '', '   ']) {
    const args = buildSubmitArgs({ ...required, tracePath: 'trace.jsonl', manifestPath: blank, outcome: blank, detail: blank, authorName: blank });
    assert.deepEqual(args, ['submit', '--challenge-id', 'challenge-a', '--bundle', 'bundle.zip', '--trace', 'trace.jsonl']);
  }
});

test('a retry into an existing attempt re-uploads only the bundle', () => {
  const args = buildSubmitArgs({
    ...required, attemptId: 7, tracePath: 'trace.jsonl', manifestPath: 'arm_manifest.json',
    outcome: 'failed', detail: 'Run notes', authorName: 'Agent A',
  });
  assert.deepEqual(args, ['submit', '--challenge-id', 'challenge-a', '--bundle', 'bundle.zip', '--attempt-id', '7']);
});

test('submit arguments accept only declarable outcomes', () => {
  assert.throws(() => buildSubmitArgs({ ...required, outcome: 'excellent' }), (error) => error.code === 'invalid_argument' && error.started === false);
});

test('a retry built from confirm() options carries none of the new attempt fields', () => {
  // The same option object confirm() hands to cli.submit() for a retry with every field set.
  const args = buildSubmitArgs({
    challengeId: 'challenge-a', bundlePath: 'bundle.zip', tracePath: undefined, attemptId: 7, model: 'model-a',
    harness: 'harness-a', method: 'method-a', manifestPath: '/abs/arm_manifest.json', outcome: 'success', detail: 'Run notes', authorName: 'Agent A',
  });
  for (const flag of NEW_FIELD_FLAGS) assert.equal(hasFlag(args, flag), false, flag);
});

test('createPlaygroundCli().submit() runs the CLI with the built arguments, including spaces and a leading "--"', async () => {
  const cli = createPlaygroundCli({ command: await fakeCli(join(root, 'fields', 'fake-cli.mjs')), baseUrl: 'http://127.0.0.1:9/api' });
  const withFields = await cli.submit({
    ...required, tracePath: 'trace.jsonl', manifestPath: 'arm manifest.json', outcome: 'stuck', detail: '--- run & notes', authorName: 'agent a',
  });
  assert.deepEqual(withFields, [
    'submit', '--challenge-id', 'challenge-a', '--bundle', 'bundle.zip', '--trace', 'trace.jsonl',
    '--manifest=arm manifest.json', '--outcome', 'stuck', '--detail=--- run & notes', '--author-name=agent a',
    '--api-base', 'http://127.0.0.1:9',
  ]);
  const withoutFields = await cli.submit({ ...required, tracePath: 'trace.jsonl' });
  for (const flag of NEW_FIELD_FLAGS) assert.equal(hasFlag(withoutFields, flag), false, flag);
});
