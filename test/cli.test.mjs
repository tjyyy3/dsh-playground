import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chmod, copyFile, link, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
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

async function withPath(directory, run) {
  const previous = process.env.PATH;
  process.env.PATH = `${directory}${delimiter}${previous}`;
  try { return await run(); } finally { process.env.PATH = previous; }
}

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
  const cli = createPlaygroundCli({ command: `playground-missing-${process.pid}` });
  await assert.rejects(() => cli.submit({ challengeId: 'demo', bundlePath: 'b.zip' }),
    (error) => error.code === (process.platform === 'win32' ? 'cli_not_found' : 'ENOENT'));
});

test('Windows: a missing CLI path is cli_not_found, not ENOENT', { skip: process.platform !== 'win32' }, async () => {
  for (const command of [join(root, 'missing', 'playground.cmd'), join(root, 'missing', 'cli.js'), join(root, 'missing', 'playground')]) {
    await assert.rejects(() => createPlaygroundCli({ command }).submit({ challengeId: 'demo', bundlePath: 'b.zip' }),
      (error) => error.code === 'cli_not_found', command);
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
});

test('Windows: the cmd fallback refuses arguments cmd would interpret', { skip: process.platform !== 'win32' }, async () => {
  const bin = join(root, 'fallback-unsafe');
  await fakeCli(join(bin, 'entry'), `require('node:fs').writeFileSync(${JSON.stringify(join(bin, 'started.txt'))}, '');`);
  await writeFile(join(bin, 'fakeother.cmd'), '@node "%~dp0entry" %*\r\n');
  const cli = createPlaygroundCli({ command: join(bin, 'fakeother.cmd') });
  const marker = join(markers, 'fallback.txt');
  for (const value of [`x & echo marker> ${marker}`, 'a|b', 'a^b', '%PATH%', '!PATH!', 'say "hi"', 'a<b', 'a>b', 'a\nb', 'a\rb']) {
    await assert.rejects(() => cli.submit({ challengeId: 'demo', bundlePath: 'b.zip', method: value }),
      (error) => error.code === 'cli_unsafe_argument' && /cliPath/.test(error.message), JSON.stringify(value));
  }
  await assert.rejects(() => cli.authLogin('a&b@example.test', 'synthetic-password'), (error) => error.code === 'cli_unsafe_argument');
  assert.equal(existsSync(marker), false);
  assert.equal(existsSync(join(bin, 'started.txt')), false);
});

test('starting the CLI emits no shell deprecation warning', () => {
  assert.deepEqual(warnings.filter((warning) => warning.code === 'DEP0190').map(String), []);
});
