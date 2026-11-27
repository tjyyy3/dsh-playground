import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

test('Client builds reproduce the committed entry and freshness checks never overwrite stale files', async (t) => {
  await mkdir(join(root, '_scratch'), { recursive: true });
  const fixture = await mkdtemp(join(root, '_scratch', 'client-build-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  await cp(join(root, 'src'), join(fixture, 'src'), { recursive: true });
  await mkdir(join(fixture, 'lib/task'), { recursive: true });
  await cp(join(root, 'lib/task/evidence.js'), join(fixture, 'lib/task/evidence.js'));
  await mkdir(join(fixture, 'scripts'));
  await cp(join(root, 'scripts/build-client.mjs'), join(fixture, 'scripts/build-client.mjs'));
  await writeFile(join(fixture, 'package.json'), '{"type":"module"}\n');
  await writeFile(join(fixture, 'index.js'), 'Host sentinel\n');
  const run = (...args) => spawnSync(process.execPath, ['scripts/build-client.mjs', ...args], {
    cwd: fixture, encoding: 'utf8', windowsHide: true,
  });
  const build = () => {
    const result = run();
    assert.equal(result.status, 0, result.stderr);
  };
  build();
  const generated = await readFile(join(fixture, 'client.js'), 'utf8');
  assert.equal(generated, (await readFile(join(root, 'client.js'), 'utf8')).replace(/\r\n/g, '\n'));
  build();
  assert.equal(await readFile(join(fixture, 'client.js'), 'utf8'), generated);
  assert.equal(await readFile(join(fixture, 'index.js'), 'utf8'), 'Host sentinel\n');
  assert.deepEqual((await readdir(fixture)).sort(), ['client.js', 'index.js', 'lib', 'package.json', 'scripts', 'src']);
  assert.equal(generated.includes(root), false);
  assert.equal(generated.includes(fixture), false);
  assert.equal(run('--check').status, 0);

  await writeFile(join(fixture, 'client.js'), generated + '\n// stale output\n');
  assert.notEqual(run('--check').status, 0);
  assert.match(await readFile(join(fixture, 'client.js'), 'utf8'), /stale output/);
  build();
  const sourcePath = join(fixture, 'src/client/dsh.js');
  const source = await readFile(sourcePath, 'utf8');
  const changed = source.replace("label: () => 'Playground'", "label: () => 'Changed fixture'");
  assert.notEqual(changed, source);
  await writeFile(sourcePath, changed);
  assert.notEqual(run('--check').status, 0);
  assert.equal(await readFile(join(fixture, 'client.js'), 'utf8'), generated);
  build();
  assert.notEqual(await readFile(join(fixture, 'client.js'), 'utf8'), generated);
  assert.equal(run('--check').status, 0);
});

test('test and delivery paths explicitly build and verify the delivery package after script-free install', async () => {
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  assert.match(manifest.scripts.test, /^npm run check:client && npm run build:client &&/);
  for (const name of ['test', 'release', 'publish']) {
    const workflow = await readFile(join(root, '.github/workflows', `${name}.yml`), 'utf8');
    assert.match(workflow, /npm ci --ignore-scripts/);
    assert.ok(workflow.indexOf('npm ci --ignore-scripts') < workflow.indexOf('npm test'));
    assert.ok(workflow.indexOf('npm test') < workflow.indexOf('npm run verify:package'));
  }
});
