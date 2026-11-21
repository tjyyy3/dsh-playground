import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { runInNewContext } from 'node:vm';
import { requiredFiles } from './validate-release.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const { values } = parseArgs({ options: { 'output-dir': { type: 'string' } } });
assert.ok(process.env.npm_execpath, 'Run this check with npm run verify:package.');
await mkdir(join(root, '_scratch'), { recursive: true });
const temporary = await mkdtemp(join(root, '_scratch', 'package-check-'));
const destination = values['output-dir'] ? resolve(values['output-dir']) : temporary;
await mkdir(destination, { recursive: true });

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', windowsHide: true });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

const npm = (...args) => JSON.parse(run(process.execPath, [process.env.npm_execpath, ...args]));
try {
  const [preview] = npm('pack', '--dry-run', '--ignore-scripts', '--json');
  const [packed] = npm('pack', '--ignore-scripts', '--json', '--pack-destination', destination);
  const names = (result) => result.files.map((file) => file.path).sort();
  assert.deepEqual(names(packed), names(preview), 'The dry run and packed file lists differ.');
  const tarball = join(destination, packed.filename);
  const unpacked = join(temporary, 'unpacked');
  await mkdir(unpacked);
  run('tar', ['-xzf', tarball, '-C', unpacked]);
  const packageRoot = join(unpacked, 'package');
  const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
  assert.equal(manifest.exports['./client'], './client.js');
  const shipped = new Set(names(packed));
  const hostModules = (await readdir(join(root, 'lib'), { recursive: true }))
    .filter((name) => name.endsWith('.js')).map((name) => `lib/${name.replaceAll('\\', '/')}`);
  const required = [...requiredFiles, ...hostModules, `release-notes/${manifest.version}.md`];
  for (const file of required) assert.ok(shipped.has(file), `Package is missing ${file}.`);
  for (const file of shipped) {
    assert.doesNotMatch(file, /^(?:src|scripts|test|node_modules)\/|\.map$/, `Unexpected development file ${file}.`);
    assert.deepEqual(await readFile(join(packageRoot, file)), await readFile(join(root, file)), `Packed ${file} differs from the checked file.`);
  }
  const host = await import(pathToFileURL(join(packageRoot, 'index.js')));
  assert.equal(typeof host.apply, 'function', 'The packed Host entry must load.');
  let registration;
  runInNewContext(await readFile(join(packageRoot, 'client.js'), 'utf8'), {
    window: { __ModuleLoader__: { load(value) { registration = value; } } },
  });
  assert.equal(registration?.id, 'dsh-playground');
  const dependencies = new Set();
  const plugin = registration.factory((name) => {
    dependencies.add(name);
    if (name === 'react') return { createElement() {} };
    if (name === '@deepseek-ai/dsh-client-ui-primitives') return { Modal() {} };
    if (name === '@deepseek-ai/dsh-client-store') return { createSnapshotStore() {} };
    assert.fail(`Unexpected Client dependency ${name}.`);
  });
  assert.deepEqual([...dependencies].sort(), ['@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-client-ui-primitives', 'react']);
  assert.equal(typeof plugin.apply, 'function', 'The factory must return the plugin directly.');
  assert.ok(Array.isArray(plugin.inject));
  assert.equal(plugin.default, undefined);
  console.log(`Verified ${packed.filename}: ${shipped.size} files, packed Host imports, Client loader, and resource bytes.`);
  if (values['output-dir']) console.log(`Verified tarball: ${tarball}`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
