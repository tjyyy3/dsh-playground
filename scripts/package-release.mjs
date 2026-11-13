import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { parseVersion } from '../lib/releases.js';

export function checkReleaseTag(version, tag) {
  const parsed = parseVersion(version);
  if (!parsed || version.includes('+') || tag !== `v${version}`) {
    throw new Error('Release tag must be v followed by the exact package.json version.');
  }
  return parsed.prerelease.length > 0;
}

export function checkPackageFiles(files) {
  const paths = new Set(files.map((file) => file.path));
  for (const required of ['package.json', 'index.js', 'client.js', 'lib/releases.js', 'cordis.patch.yml',
    'locale/en.json', 'locale/zh.json', 'README.md', 'guide/reference.md', 'guide/releases.md', 'assets/playground-controller.png']) {
    if (!paths.has(required)) throw new Error(`Package is missing ${required}`);
  }
  for (const path of paths) {
    if (!/^(?:package\.json|index\.js|client\.js|cordis\.patch\.yml|icon\.svg|README\.md|LICENSE|lib\/[^/]+\.js|locale\/[^/]+\.json|guide\/[^/]+\.md|assets\/[^/]+\.png)$/.test(path)) {
      throw new Error(`Unexpected package file ${path}`);
    }
  }
}

async function main() {
  const { values } = parseArgs({ options: { tag: { type: 'string' }, out: { type: 'string', default: '_scratch/release' } } });
  const manifest = JSON.parse(await readFile('package.json', 'utf8'));
  const prerelease = checkReleaseTag(manifest.version, values.tag);
  if (!process.env.npm_execpath) throw new Error('Run this command through npm run release:pack.');
  const destination = resolve(values.out);
  await mkdir(destination, { recursive: true });
  const output = execFileSync(process.execPath, [process.env.npm_execpath, 'pack', '--ignore-scripts',
    '--json', '--pack-destination', destination], { encoding: 'utf8' });
  const [packed] = JSON.parse(output);
  checkPackageFiles(packed.files);
  const expected = `playground-dsh-playground-${manifest.version}.tgz`;
  if (packed.filename !== expected || basename(packed.filename) !== packed.filename) throw new Error('Unexpected package filename.');
  const artifact = await readFile(resolve(destination, packed.filename));
  const sha256 = createHash('sha256').update(artifact).digest('hex');
  await writeFile(resolve(destination, 'SHA256SUMS'), `${sha256}  ${packed.filename}\n`);
  console.log(JSON.stringify({ version: manifest.version, tag: values.tag, prerelease, filename: packed.filename, sha256 }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
